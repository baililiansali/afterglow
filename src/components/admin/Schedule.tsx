import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Users,
  CalendarCheck,
  LayoutGrid,
} from "lucide-react";

import { PageHeader } from "@/components/SiteChrome";
import { StatusBadge, PaymentMethodBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { roomsQuery, settingsQuery } from "@/lib/queries";
import { fmtDate, fmtTime, peso } from "@/lib/afterglow";

import { useProfiles, type ResRow } from "./shared";

type ViewMode = "daily" | "weekly" | "monthly";
type RoomStatusFilter = "all" | "available" | "reserved" | "occupied" | "maintenance";

type RoomRow = {
  id: string;
  name: string;
  room_number?: string | null;
  is_active?: boolean | null;
  maintenance_status?: boolean | null;
};

type BusinessSettings = {
  opening_time?: string | null;
  closing_time?: string | null;
};

const ROOM_STATUS_OPTIONS: {
  value: RoomStatusFilter;
  label: string;
  dot: string;
}[] = [
  { value: "all", label: "All room statuses", dot: "" },
  { value: "available", label: "Available" },
  { value: "reserved", label: "Reserved" },
  { value: "occupied", label: "Occupied" },
  { value: "maintenance", label: "Maintenance" },
];

const RESERVATION_COLORS: Record<string, string> = {
  pending: "border-l-amber-400 bg-amber-500/10",
  approved: "border-l-yellow-500 bg-yellow-500/10",
  rejected: "border-l-red-500 bg-red-500/10",
  cancelled: "border-l-muted-foreground bg-muted",
  checked_in: "border-l-blue-500 bg-blue-500/10",
  completed: "border-l-emerald-500 bg-emerald-500/10",
  no_show: "border-l-orange-500 bg-orange-500/10",
};

const ROOM_STATUS_STYLES: Record<
  Exclude<RoomStatusFilter, "all">,
  { label: string; dot: string; text: string }
> = {
  available: {
    label: "Available",
    dot: "bg-emerald-500",
    text: "text-emerald-600",
  },
  reserved: {
    label: "Reserved",
    dot: "bg-yellow-500",
    text: "text-yellow-600",
  },
  occupied: {
    label: "Occupied",
    dot: "bg-blue-500",
    text: "text-blue-600",
  },
  maintenance: {
    label: "Maintenance",
    dot: "bg-orange-500",
    text: "text-orange-600",
  },
};

function getLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: string, amount: number) {
  const result = parseDate(date);
  result.setDate(result.getDate() + amount);
  return getLocalDateString(result);
}

function addMonths(date: string, amount: number) {
  const result = parseDate(date);
  result.setDate(1);
  result.setMonth(result.getMonth() + amount);
  return getLocalDateString(result);
}

function getWeekDates(date: string) {
  const selected = parseDate(date);
  const day = selected.getDay();
  const sunday = new Date(selected);

  sunday.setDate(selected.getDate() - day);

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(sunday);
    current.setDate(sunday.getDate() + index);
    return getLocalDateString(current);
  });
}

function getMonthDates(date: string) {
  const selected = parseDate(date);
  const firstDay = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const lastDay = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);

  const startOffset = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const current = new Date(selected.getFullYear(), selected.getMonth(), index - startOffset + 1);

    return {
      date: getLocalDateString(current),
      currentMonth: current.getMonth() === selected.getMonth(),
    };
  });
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function getReservationStatus(reservation: ResRow) {
  return String(reservation.status).toLowerCase();
}

function isConfirmedReservation(reservation: ResRow) {
  const status = getReservationStatus(reservation);
  return status === "approved" || status === "checked_in";
}

function getRoomStatus(
  room: RoomRow,
  reservations: ResRow[],
  date: string,
): Exclude<RoomStatusFilter, "all">[] {
  if (room.is_active === false || room.maintenance_status === true) {
    return ["maintenance"];
  }

  const roomReservations = reservations.filter(
    (reservation) =>
      reservation.room_id === room.id &&
      reservation.booking_date === date &&
      isConfirmedReservation(reservation),
  );

  const occupied = roomReservations.some(
    (reservation) => getReservationStatus(reservation) === "checked_in",
  );

  const reserved = roomReservations.some(
    (reservation) => getReservationStatus(reservation) === "approved",
  );

  const opening = 14 * 60;
  const closing = 23 * 60;

  const bookedMinutes = roomReservations.reduce((total, reservation) => {
    const start = Math.max(toMinutes(reservation.start_time), opening);
    const end = Math.min(toMinutes(reservation.end_time), closing);

    return total + Math.max(0, end - start);
  }, 0);

  const hasAvailableTime = bookedMinutes < closing - opening;

  const statuses: Exclude<RoomStatusFilter, "all">[] = [];

  if (hasAvailableTime) statuses.push("available");
  if (reserved) statuses.push("reserved");
  if (occupied) statuses.push("occupied");

  return statuses;
}

function getReservationPosition(
  reservation: ResRow,
  openingMinutes: number,
  closingMinutes: number,
) {
  const start = Math.max(toMinutes(reservation.start_time), openingMinutes);

  const end = Math.min(toMinutes(reservation.end_time), closingMinutes);

  const duration = closingMinutes - openingMinutes;

  return {
    left: ((start - openingMinutes) / duration) * 100,
    width: Math.max(0, ((end - start) / duration) * 100),
  };
}

function getCustomerName(
  reservation: ResRow,
  profiles: Record<string, { full_name?: string | null }> | undefined,
) {
  return profiles?.[reservation.user_id]?.full_name || "Customer";
}

function formatMonth(date: string) {
  return parseDate(date).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatDay(date: string) {
  return parseDate(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function sameDate(a: string, b: string) {
  return a === b;
}

export function Schedule({ res }: { res: ResRow[] }) {
  const [date, setDate] = useState(() => getLocalDateString(new Date()));

  const [view, setView] = useState<ViewMode>("daily");
  const [roomFilter, setRoomFilter] = useState("all");
  const [roomStatusFilter, setRoomStatusFilter] = useState<RoomStatusFilter>("all");

  const [selectedReservation, setSelectedReservation] = useState<ResRow | null>(null);

  const profiles = useProfiles();

  const { data: roomsData } = useQuery(roomsQuery);
  const { data: settingsData } = useQuery(settingsQuery);

  const rooms = (roomsData ?? []) as RoomRow[];
  const settings = settingsData as BusinessSettings | undefined;

  const openingTime = settings?.opening_time || "14:00";
  const closingTime = settings?.closing_time || "23:00";

  const openingMinutes = toMinutes(openingTime);
  const closingMinutes = toMinutes(closingTime);

  const today = getLocalDateString(new Date());

  const dailyReservations = useMemo(
    () =>
      res
        .filter((reservation) => reservation.booking_date === date)
        .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)),
    [res, date],
  );

  const visibleRooms = useMemo(() => {
    return rooms.filter((room) => {
      if (roomFilter !== "all" && room.id !== roomFilter) {
        return false;
      }

      if (roomStatusFilter === "all") return true;

      const statuses = getRoomStatus(room, res, date);

      return statuses.includes(roomStatusFilter);
    });
  }, [rooms, roomFilter, roomStatusFilter, res, date]);

  const visibleDailyReservations = useMemo(
    () =>
      dailyReservations.filter((reservation) =>
        visibleRooms.some((room) => room.id === reservation.room_id),
      ),
    [dailyReservations, visibleRooms],
  );

  const weekDates = useMemo(() => getWeekDates(date), [date]);

  const monthDates = useMemo(() => getMonthDates(date), [date]);

  const totalReservations = visibleDailyReservations.length;

  const approvedCount = visibleDailyReservations.filter(
    (reservation) => getReservationStatus(reservation) === "approved",
  ).length;

  const occupiedCount = visibleDailyReservations.filter(
    (reservation) => getReservationStatus(reservation) === "checked_in",
  ).length;

  function navigatePrevious() {
    if (view === "daily") setDate((current) => addDays(current, -1));
    if (view === "weekly") setDate((current) => addDays(current, -7));
    if (view === "monthly") setDate((current) => addMonths(current, -1));
  }

  function navigateNext() {
    if (view === "daily") setDate((current) => addDays(current, 1));
    if (view === "weekly") setDate((current) => addDays(current, 7));
    if (view === "monthly") setDate((current) => addMonths(current, 1));
  }

  function getDateHeading() {
    if (view === "monthly") return formatMonth(date);

    if (view === "weekly") {
      const first = weekDates[0];
      const last = weekDates[6];

      return `${fmtDate(first)} – ${fmtDate(last)}`;
    }

    return formatDay(date);
  }

  function getReservationsForDate(selectedDate: string) {
    return res
      .filter(
        (reservation) =>
          reservation.booking_date === selectedDate &&
          (roomFilter === "all" || reservation.room_id === roomFilter),
      )
      .filter((reservation) => {
        if (roomStatusFilter === "all") return true;

        const room = rooms.find((item) => item.id === reservation.room_id);

        if (!room) return false;

        return getRoomStatus(room, res, selectedDate).includes(roomStatusFilter);
      });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Room Schedule"
        description="View room availability and reservations across your karaoke rooms."
      />

      {/* View controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-border bg-card p-1">
          {(
            [
              ["daily", "Daily"],
              ["weekly", "Weekly"],
              ["monthly", "Monthly"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={view === value ? "default" : "ghost"}
              onClick={() => setView(value)}
              className="gap-2"
            >
              {value === "daily" && <Clock className="h-4 w-4" />}
              {value === "weekly" && <CalendarCheck className="h-4 w-4" />}
              {value === "monthly" && <CalendarDays className="h-4 w-4" />}
              {label}
            </Button>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={() => setDate(today)}>
          Today
        </Button>
      </div>

      {/* Date navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <Button
          variant="outline"
          size="icon"
          onClick={navigatePrevious}
          aria-label="Previous period"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="text-center">
          <h2 className="font-semibold">{getDateHeading()}</h2>
          <p className="text-xs text-muted-foreground">
            {view === "daily"
              ? "Daily room schedule"
              : view === "weekly"
                ? "Weekly room schedule"
                : "Monthly room schedule"}
          </p>
        </div>

        <Button variant="outline" size="icon" onClick={navigateNext} aria-label="Next period">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="schedule-room-filter">Filter by room</Label>
          <select
            id="schedule-room-filter"
            value={roomFilter}
            onChange={(event) => setRoomFilter(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All rooms</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
                {room.room_number ? ` (${room.room_number})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="schedule-room-status">Filter by room status</Label>
          <select
            id="schedule-room-status"
            value={roomStatusFilter}
            onChange={(event) => setRoomStatusFilter(event.target.value as RoomStatusFilter)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {ROOM_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.dot ? "● " : ""}
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary */}
      {view === "daily" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Total Rooms"
            value={visibleRooms.length}
            icon={<LayoutGrid className="h-4 w-4" />}
          />
          <SummaryCard
            label="Reservations"
            value={totalReservations}
            icon={<CalendarDays className="h-4 w-4" />}
          />
          <SummaryCard
            label="Reserved"
            value={approvedCount}
            icon={<CalendarCheck className="h-4 w-4" />}
          />
          <SummaryCard
            label="Occupied"
            value={occupiedCount}
            icon={<Users className="h-4 w-4" />}
          />
        </div>
      )}

      {/* Room status legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm">
        {ROOM_STATUS_OPTIONS.filter((option) => option.value !== "all").map((option) => (
          <div key={option.value} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${option.dot}`} />
            <span>{option.label}</span>
          </div>
        ))}
      </div>

      {/* Daily view */}
      {view === "daily" && (
        <div className="space-y-4">
          {visibleRooms.length === 0 ? (
            <EmptyState message="No rooms match the selected filters." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold">Daily room timeline</h3>
                <p className="text-xs text-muted-foreground">
                  {formatMinutes(openingMinutes)} – {formatMinutes(closingMinutes)}
                </p>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  {/* Time labels */}
                  <div className="grid grid-cols-[180px_1fr] border-b border-border">
                    <div className="p-3 text-xs font-medium text-muted-foreground">Room</div>

                    <div className="relative h-10">
                      {Array.from(
                        {
                          length: Math.floor((closingMinutes - openingMinutes) / 60) + 1,
                        },
                        (_, index) => {
                          const minute = openingMinutes + index * 60;
                          const position =
                            ((minute - openingMinutes) / (closingMinutes - openingMinutes)) * 100;

                          return (
                            <div
                              key={minute}
                              className="absolute top-0 h-full border-l border-border"
                              style={{ left: `${position}%` }}
                            >
                              <span className="absolute left-1 top-3 whitespace-nowrap text-[10px] text-muted-foreground">
                                {formatMinutes(minute)}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>

                  {/* Room rows */}
                  {visibleRooms.map((room) => {
                    const roomReservations = visibleDailyReservations.filter(
                      (reservation) => reservation.room_id === room.id,
                    );

                    const statuses = getRoomStatus(room, res, date);

                    return (
                      <div
                        key={room.id}
                        className="grid grid-cols-[180px_1fr] border-b border-border last:border-b-0"
                      >
                        <div className="flex flex-col justify-center gap-1 p-3">
                          <span className="text-sm font-medium">{room.name}</span>
                          {room.room_number && (
                            <span className="text-xs text-muted-foreground">
                              {room.room_number}
                            </span>
                          )}

                          <div className="flex flex-wrap gap-1">
                            {statuses.map((status) => (
                              <span
                                key={status}
                                className={`text-[10px] font-medium ${ROOM_STATUS_STYLES[status].text}`}
                              >
                                {ROOM_STATUS_STYLES[status].label}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="relative min-h-[76px]">
                          {Array.from(
                            {
                              length: Math.floor((closingMinutes - openingMinutes) / 60) + 1,
                            },
                            (_, index) => {
                              const minute = openingMinutes + index * 60;
                              const position =
                                ((minute - openingMinutes) / (closingMinutes - openingMinutes)) *
                                100;

                              return (
                                <div
                                  key={minute}
                                  className="absolute inset-y-0 border-l border-border/60"
                                  style={{ left: `${position}%` }}
                                />
                              );
                            },
                          )}

                          {(room.maintenance_status || room.is_active === false) && (
                            <div className="absolute inset-1 flex items-center justify-center rounded-md bg-orange-500/10 text-xs font-medium text-orange-600">
                              {room.is_active === false ? "Inactive" : "Under Maintenance"}
                            </div>
                          )}

                          {roomReservations.map((reservation) => {
                            const position = getReservationPosition(
                              reservation,
                              openingMinutes,
                              closingMinutes,
                            );

                            if (position.width <= 0) return null;

                            const status = getReservationStatus(reservation);

                            return (
                              <button
                                key={reservation.id}
                                type="button"
                                onClick={() => setSelectedReservation(reservation)}
                                className={`absolute top-2 z-10 flex h-[58px] flex-col justify-center overflow-hidden rounded-md border-l-4 px-2 text-left text-xs transition hover:brightness-95 ${
                                  RESERVATION_COLORS[status] || "border-l-muted-foreground bg-muted"
                                }`}
                                style={{
                                  left: `${position.left}%`,
                                  width: `${position.width}%`,
                                  minWidth: "48px",
                                }}
                                title={`${reservation.reference_code} · ${fmtTime(
                                  reservation.start_time,
                                )}–${fmtTime(reservation.end_time)}`}
                              >
                                <span className="truncate font-semibold">
                                  {reservation.reference_code}
                                </span>
                                <span className="truncate text-[10px] text-muted-foreground">
                                  {fmtTime(reservation.start_time)} –{" "}
                                  {fmtTime(reservation.end_time)}
                                </span>
                              </button>
                            );
                          })}

                          {roomReservations.length === 0 &&
                            !room.maintenance_status &&
                            room.is_active !== false && (
                              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                                No reservations
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Reservation list */}
          <div className="space-y-3">
            <h3 className="font-semibold">Reservations for this day</h3>

            {visibleDailyReservations.length === 0 ? (
              <EmptyState message="No reservations for this date." />
            ) : (
              visibleDailyReservations.map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  customerName={getCustomerName(reservation, profiles)}
                  onClick={() => setSelectedReservation(reservation)}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Weekly view */}
      {view === "weekly" && (
        <div className="space-y-3">
          {weekDates.map((weekDate) => {
            const dayReservations = getReservationsForDate(weekDate).sort(
              (a, b) => toMinutes(a.start_time) - toMinutes(b.start_time),
            );

            return (
              <div
                key={weekDate}
                className={`overflow-hidden rounded-xl border border-border bg-card ${
                  sameDate(weekDate, today) ? "border-primary/50" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setDate(weekDate);
                    setView("daily");
                  }}
                  className="flex w-full items-center justify-between gap-3 border-b border-border p-4 text-left hover:bg-muted/40"
                >
                  <div>
                    <p className="font-medium">{formatDay(weekDate)}</p>
                    <p className="text-xs text-muted-foreground">
                      {dayReservations.length} reservation
                      {dayReservations.length !== 1 ? "s" : ""}
                    </p>
                  </div>

                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>

                {dayReservations.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No reservations</p>
                ) : (
                  <div className="divide-y divide-border">
                    {dayReservations.map((reservation) => (
                      <button
                        key={reservation.id}
                        type="button"
                        onClick={() => setSelectedReservation(reservation)}
                        className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-muted/40"
                      >
                        <div>
                          <p className="text-sm font-medium">{reservation.rooms?.name || "Room"}</p>
                          <p className="text-xs text-muted-foreground">
                            {reservation.reference_code} · {fmtTime(reservation.start_time)} –{" "}
                            {fmtTime(reservation.end_time)}
                          </p>
                        </div>

                        <StatusBadge status={reservation.status} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Monthly view */}
      {view === "monthly" && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border bg-muted/30">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="p-2 text-center text-xs font-medium text-muted-foreground sm:p-3"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {monthDates.map(({ date: monthDate, currentMonth }) => {
              const dayReservations = getReservationsForDate(monthDate);

              const isToday = sameDate(monthDate, today);
              const isSelected = sameDate(monthDate, date);

              return (
                <button
                  key={monthDate}
                  type="button"
                  onClick={() => {
                    setDate(monthDate);
                    setView("daily");
                  }}
                  className={`relative flex min-h-[90px] flex-col items-start gap-1 border-b border-r border-border p-2 text-left transition hover:bg-muted/50 sm:min-h-[120px] sm:p-3 ${
                    !currentMonth ? "opacity-40" : ""
                  } ${isSelected ? "bg-primary/5" : ""}`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                      isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    {parseDate(monthDate).getDate()}
                  </span>

                  {dayReservations.length > 0 && (
                    <div className="mt-1 space-y-1">
                      <div className="flex flex-wrap gap-0.5">
                        {dayReservations.slice(0, 5).map((reservation) => (
                          <span
                            key={reservation.id}
                            className={`h-1.5 w-1.5 rounded-full ${
                              getReservationStatus(reservation) === "checked_in"
                                ? "bg-blue-500"
                                : getReservationStatus(reservation) === "approved"
                                  ? "bg-yellow-500"
                                  : "bg-amber-500"
                            }`}
                          />
                        ))}
                      </div>

                      <span className="text-[10px] text-muted-foreground sm:text-xs">
                        {dayReservations.length} booking
                        {dayReservations.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Reservation details dialog */}
      <Dialog
        open={!!selectedReservation}
        onOpenChange={(open) => {
          if (!open) setSelectedReservation(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {selectedReservation && (
            <>
              <DialogHeader>
                <DialogTitle>Reservation Details</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">Reference Code</p>
                  <p className="font-semibold">{selectedReservation.reference_code}</p>
                </div>

                <DetailRow
                  label="Customer"
                  value={getCustomerName(selectedReservation, profiles)}
                />

                <DetailRow label="Room" value={selectedReservation.rooms?.name || "Room"} />

                <DetailRow label="Date" value={fmtDate(selectedReservation.booking_date)} />

                <DetailRow
                  label="Time"
                  value={`${fmtTime(selectedReservation.start_time)} – ${fmtTime(
                    selectedReservation.end_time,
                  )}`}
                />

                <DetailRow label="Guests" value={`${selectedReservation.guest_count}`} />

                <DetailRow label="Room Total" value={peso(selectedReservation.room_total)} />

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={selectedReservation.status} />
                  <StatusBadge status={selectedReservation.payment_status} />
                  <PaymentMethodBadge method={selectedReservation.payment_method} />
                </div>

                {selectedReservation.payer_name && (
                  <DetailRow label="Payer Name" value={selectedReservation.payer_name} />
                )}

                {selectedReservation.payment_reference && (
                  <DetailRow
                    label="Payment Reference"
                    value={selectedReservation.payment_reference}
                  />
                )}

                {selectedReservation.special_requests && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Special Requests</p>
                    <p className="text-sm">{selectedReservation.special_requests}</p>
                  </div>
                )}

                {selectedReservation.rejection_reason && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Rejection Reason</p>
                    <p className="text-sm">{selectedReservation.rejection_reason}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ReservationCard({
  reservation,
  customerName,
  onClick,
}: {
  reservation: ResRow;
  customerName: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:bg-muted/40"
    >
      <div className="space-y-1">
        <p className="font-medium">
          {reservation.rooms?.name || "Room"} · {fmtTime(reservation.start_time)} –{" "}
          {fmtTime(reservation.end_time)}
        </p>
        <p className="text-xs text-muted-foreground">
          {reservation.reference_code} · {customerName} · {reservation.guest_count} guests
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={reservation.status} />
        <StatusBadge status={reservation.payment_status} />
        <PaymentMethodBadge method={reservation.payment_method} />
      </div>
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
