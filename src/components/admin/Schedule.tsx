import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  CalendarCheck,
  Search,
  Filter,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { roomsQuery, settingsQuery } from "@/lib/queries";
import { fmtDate, fmtTime } from "@/lib/afterglow";

import { useProfiles, type ResRow } from "./shared";

type ViewMode = "daily" | "weekly" | "monthly";

type RoomRow = {
  id: string;
  name: string;
  room_number?: string | null;
  room_type?: string | null;
  type?: string | null;
  is_active?: boolean | null;
  maintenance_status?: boolean | null;
};

type BusinessSettings = {
  opening_time?: string | null;
  closing_time?: string | null;
};

const SELECTED_RESERVATION_KEY = "afterglow:selected-reservation";

const RESERVATION_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;

type ScheduleReservationStatus = (typeof RESERVATION_STATUSES)[number];

const RESERVATION_COLORS: Record<ScheduleReservationStatus, string> = {
  pending: "border-l-amber-400 bg-amber-500/10",
  approved: "border-l-yellow-500 bg-yellow-500/10",
  rejected: "border-l-red-500 bg-red-500/10",
  cancelled: "border-l-muted-foreground bg-muted",
};

const dropdownItemClass = "cursor-pointer";

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

function getScheduleReservationStatus(reservation: ResRow): ScheduleReservationStatus | null {
  const status = getReservationStatus(reservation);

  return RESERVATION_STATUSES.includes(status as ScheduleReservationStatus)
    ? (status as ScheduleReservationStatus)
    : null;
}

function isConfirmedReservation(reservation: ResRow) {
  return getReservationStatus(reservation) === "approved";
}

function getRoomStatus(room: RoomRow, reservations: ResRow[], date: string) {
  if (room.is_active === false) return "inactive";
  if (room.maintenance_status === true) return "maintenance";

  const roomReservations = reservations.filter(
    (reservation) =>
      reservation.room_id === room.id &&
      reservation.booking_date === date &&
      isConfirmedReservation(reservation),
  );

  const opening = 14 * 60;
  const closing = 23 * 60;

  const bookedMinutes = roomReservations.reduce((total, reservation) => {
    const start = Math.max(toMinutes(reservation.start_time), opening);
    const end = Math.min(toMinutes(reservation.end_time), closing);

    return total + Math.max(0, end - start);
  }, 0);

  return bookedMinutes >= closing - opening ? "full" : "available";
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
  const navigate = useNavigate();

  const [date, setDate] = useState(() => getLocalDateString(new Date()));
  const [view, setView] = useState<ViewMode>("daily");

  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const [roomFilter, setRoomFilter] = useState("all");
  const [roomStatusFilter, setRoomStatusFilter] = useState("all");
  const [reservationStatusFilter, setReservationStatusFilter] = useState("all");

  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

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
  const normalizedSearch = search.trim().toLowerCase();

  function openReservationInBookings(reservation: ResRow) {
    sessionStorage.setItem(SELECTED_RESERVATION_KEY, reservation.id);

    navigate({
      to: "/admin",
      search: { section: "bookings" },
    });

    window.dispatchEvent(
      new CustomEvent("afterglow:show-reservation", {
        detail: {
          reservationId: reservation.id,
        },
      }),
    );
  }

  function resetPage() {
    setPage(1);
  }

  const weekDates = useMemo(() => getWeekDates(date), [date]);

  const monthDates = useMemo(() => getMonthDates(date), [date]);

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      if (roomFilter !== "all" && room.id !== roomFilter) {
        return false;
      }

      if (roomStatusFilter !== "all") {
        const roomStatus = getRoomStatus(room, res, date);

        if (roomStatus !== roomStatusFilter) {
          return false;
        }
      }

      if (normalizedSearch) {
        const roomText = [room.name, room.room_number, room.room_type, room.type]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const hasRoomMatch = roomText.includes(normalizedSearch);

        const hasReservationMatch = res.some((reservation) => {
          if (reservation.room_id !== room.id) {
            return false;
          }

          const customer = getCustomerName(reservation, profiles);

          return [reservation.reference_code, customer]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedSearch));
        });

        if (!hasRoomMatch && !hasReservationMatch) {
          return false;
        }
      }

      return true;
    });
  }, [rooms, res, date, roomFilter, roomStatusFilter, normalizedSearch, profiles]);

  const filteredReservations = useMemo(() => {
    return res.filter((reservation) => {
      const status = getScheduleReservationStatus(reservation);

      if (!status) return false;

      if (roomFilter !== "all" && reservation.room_id !== roomFilter) {
        return false;
      }

      if (reservationStatusFilter !== "all" && status !== reservationStatusFilter) {
        return false;
      }

      const room = rooms.find((item) => item.id === reservation.room_id);

      if (roomStatusFilter !== "all") {
        if (!room) return false;

        const roomStatus = getRoomStatus(room, res, reservation.booking_date);

        if (roomStatus !== roomStatusFilter) {
          return false;
        }
      }

      if (normalizedSearch) {
        const customer = getCustomerName(reservation, profiles);

        const roomName = room?.name || reservation.rooms?.name || "";

        const searchableText = [
          reservation.reference_code,
          customer,
          roomName,
          reservation.booking_date,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchableText.includes(normalizedSearch)) {
          return false;
        }
      }

      return true;
    });
  }, [
    res,
    rooms,
    roomFilter,
    roomStatusFilter,
    reservationStatusFilter,
    normalizedSearch,
    profiles,
  ]);

  const dailyReservations = useMemo(() => {
    return filteredReservations
      .filter((reservation) => reservation.booking_date === date)
      .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
  }, [filteredReservations, date]);

  const visibleDailyReservations = useMemo(
    () =>
      dailyReservations.filter((reservation) =>
        filteredRooms.some((room) => room.id === reservation.room_id),
      ),
    [dailyReservations, filteredRooms],
  );

  const totalPages = Math.max(1, Math.ceil(visibleDailyReservations.length / pageSize));

  const currentPage = Math.min(page, totalPages);

  const paginatedReservations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;

    return visibleDailyReservations.slice(start, start + pageSize);
  }, [visibleDailyReservations, currentPage, pageSize]);

  function navigatePrevious() {
    if (view === "daily") {
      setDate((current) => addDays(current, -1));
    }

    if (view === "weekly") {
      setDate((current) => addDays(current, -7));
    }

    if (view === "monthly") {
      setDate((current) => addMonths(current, -1));
    }

    resetPage();
  }

  function navigateNext() {
    if (view === "daily") {
      setDate((current) => addDays(current, 1));
    }

    if (view === "weekly") {
      setDate((current) => addDays(current, 7));
    }

    if (view === "monthly") {
      setDate((current) => addMonths(current, 1));
    }

    resetPage();
  }

  function getDateHeading() {
    if (view === "monthly") {
      return formatMonth(date);
    }

    if (view === "weekly") {
      return `${fmtDate(weekDates[0])} – ${fmtDate(weekDates[6])}`;
    }

    return formatDay(date);
  }

  function getReservationsForDate(selectedDate: string) {
    return filteredReservations
      .filter((reservation) => reservation.booking_date === selectedDate)
      .filter((reservation) => filteredRooms.some((room) => room.id === reservation.room_id))
      .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
  }

  const activeFilterCount = [
    roomFilter !== "all",
    roomStatusFilter !== "all",
    reservationStatusFilter !== "all",
  ].filter(Boolean).length;

  function clearFilters() {
    setRoomFilter("all");
    setRoomStatusFilter("all");
    setReservationStatusFilter("all");
    resetPage();
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold">Room Schedule</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Manage room availability and view scheduled reservations by day, week, or month.
        </p>
      </div>

      {/* Schedule toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetPage();
            }}
            placeholder="Search room, customer, or reservation ID..."
            className="pl-9"
          />

          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                resetPage();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setFilterOpen(true)} className="gap-2">
            <Filter className="h-4 w-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>

          <div className="inline-flex rounded-lg border border-border bg-background p-1">
            {(
              [
                ["daily", "Daily", Clock],
                ["weekly", "Weekly", CalendarCheck],
                ["monthly", "Monthly", CalendarDays],
              ] as const
            ).map(([value, label, Icon]) => (
              <Button
                key={value}
                size="sm"
                variant={view === value ? "default" : "ghost"}
                onClick={() => {
                  setView(value);
                  resetPage();
                }}
                className="gap-1.5"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={navigatePrevious}
            aria-label="Previous period"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDate(today);
              resetPage();
            }}
          >
            Today
          </Button>

          <Button variant="outline" size="icon" onClick={navigateNext} aria-label="Next period">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="text-right">
          <h2 className="font-semibold">{getDateHeading()}</h2>

          <p className="text-xs text-muted-foreground">
            {view === "daily"
              ? "Daily room schedule"
              : view === "weekly"
                ? "Weekly room schedule"
                : "Monthly room schedule"}
          </p>
        </div>
      </div>

      {/* Filter modal */}
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule Filters</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Room filter */}
            <div className="space-y-1.5">
              <Label htmlFor="schedule-room-filter">Room</Label>

              <Select
                value={roomFilter}
                onValueChange={(value) => {
                  setRoomFilter(value);
                  resetPage();
                }}
              >
                <SelectTrigger
                  id="schedule-room-filter"
                  className="h-10 w-full justify-between text-sm"
                >
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>

                <SelectContent position="popper" className="max-h-60">
                  <SelectItem value="all" className={dropdownItemClass}>
                    All rooms
                  </SelectItem>

                  {rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id} className={dropdownItemClass}>
                      {room.name}
                      {room.room_number ? ` (${room.room_number})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Room operational status filter */}
            <div className="space-y-1.5">
              <Label htmlFor="schedule-room-status">Room Operational Status</Label>

              <Select
                value={roomStatusFilter}
                onValueChange={(value) => {
                  setRoomStatusFilter(value);
                  resetPage();
                }}
              >
                <SelectTrigger
                  id="schedule-room-status"
                  className="h-10 w-full justify-between text-sm"
                >
                  <SelectValue placeholder="Select room status" />
                </SelectTrigger>

                <SelectContent position="popper" className="max-h-60">
                  <SelectItem value="all" className={dropdownItemClass}>
                    All room statuses
                  </SelectItem>

                  <SelectItem value="available" className={dropdownItemClass}>
                    Available
                  </SelectItem>

                  <SelectItem value="full" className={dropdownItemClass}>
                    Full
                  </SelectItem>

                  <SelectItem value="occupied" className={dropdownItemClass}>
                    Occupied
                  </SelectItem>

                  <SelectItem value="maintenance" className={dropdownItemClass}>
                    Maintenance
                  </SelectItem>

                  <SelectItem value="inactive" className={dropdownItemClass}>
                    Inactive
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reservation status filter */}
            <div className="space-y-1.5">
              <Label htmlFor="schedule-reservation-status">Reservation Status</Label>

              <Select
                value={reservationStatusFilter}
                onValueChange={(value) => {
                  setReservationStatusFilter(value);
                  resetPage();
                }}
              >
                <SelectTrigger
                  id="schedule-reservation-status"
                  className="h-10 w-full justify-between text-sm"
                >
                  <SelectValue placeholder="Select reservation status" />
                </SelectTrigger>

                <SelectContent position="popper" className="max-h-60">
                  <SelectItem value="all" className={dropdownItemClass}>
                    All reservation statuses
                  </SelectItem>

                  {RESERVATION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status} className={dropdownItemClass}>
                      {status.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-between gap-2 border-t border-border pt-4">
              <Button variant="ghost" onClick={clearFilters}>
                Clear all
              </Button>

              <Button onClick={() => setFilterOpen(false)}>Apply filters</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Daily view */}
      {view === "daily" && (
        <div className="space-y-6">
          {filteredRooms.length === 0 ? (
            <EmptyState message="No rooms match your search or selected filters." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold">Daily Room Timeline</h3>

                <p className="text-xs text-muted-foreground">
                  {formatMinutes(openingMinutes)} – {formatMinutes(closingMinutes)}
                </p>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
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

                  {filteredRooms.map((room) => {
                    const roomReservations = visibleDailyReservations.filter(
                      (reservation) => reservation.room_id === room.id,
                    );

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

                            if (position.width <= 0) {
                              return null;
                            }

                            const status = getScheduleReservationStatus(reservation);

                            if (!status) return null;

                            return (
                              <button
                                key={reservation.id}
                                type="button"
                                onClick={() => openReservationInBookings(reservation)}
                                className={`absolute top-2 z-10 flex h-[58px] flex-col justify-center overflow-hidden rounded-md border-l-4 px-2 text-left text-xs transition hover:brightness-95 ${RESERVATION_COLORS[status]}`}
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

          {/* Scheduled reservations */}
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">Scheduled Reservations</h3>

              <p className="text-sm text-muted-foreground">
                Reservations scheduled for {fmtDate(date)}.
              </p>
            </div>

            {visibleDailyReservations.length === 0 ? (
              <EmptyState message="No reservations match your search or selected filters for this date." />
            ) : (
              <div className="space-y-3">
                {paginatedReservations.map((reservation) => (
                  <ReservationCard
                    key={reservation.id}
                    reservation={reservation}
                    customerName={getCustomerName(reservation, profiles)}
                    onClick={() => openReservationInBookings(reservation)}
                  />
                ))}
              </div>
            )}

            {visibleDailyReservations.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Showing {(currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, visibleDailyReservations.length)} of{" "}
                  {visibleDailyReservations.length} reservations
                </p>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>

                  <span className="text-xs text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Weekly view */}
      {view === "weekly" && (
        <div className="space-y-3">
          {weekDates.map((weekDate) => {
            const dayReservations = getReservationsForDate(weekDate);

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
                    resetPage();
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
                    {dayReservations.map((reservation) => {
                      const status = getScheduleReservationStatus(reservation);

                      return (
                        <button
                          key={reservation.id}
                          type="button"
                          onClick={() => openReservationInBookings(reservation)}
                          className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {reservation.rooms?.name || "Room"}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {reservation.reference_code} · {fmtTime(reservation.start_time)} –{" "}
                              {fmtTime(reservation.end_time)}
                            </p>
                          </div>

                          {status && <StatusBadge status={status} />}
                        </button>
                      );
                    })}
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
                    resetPage();
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
                        {dayReservations.slice(0, 5).map((reservation) => {
                          const status = getScheduleReservationStatus(reservation);

                          if (!status) return null;

                          const dotColor =
                            status === "approved"
                              ? "bg-yellow-500"
                              : status === "rejected"
                                ? "bg-red-500"
                                : status === "cancelled"
                                  ? "bg-muted-foreground"
                                  : "bg-amber-500";

                          return (
                            <span
                              key={reservation.id}
                              className={`h-1.5 w-1.5 rounded-full ${dotColor}`}
                            />
                          );
                        })}
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
  const status = getScheduleReservationStatus(reservation);

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

      {status && <StatusBadge status={status} />}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
