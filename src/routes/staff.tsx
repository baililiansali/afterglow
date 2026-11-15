import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  CalendarClock,
  Clock,
  DoorOpen,
  DoorClosed,
  RefreshCw,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { roomsQuery } from "@/lib/queries";

import { StaffShell, type StaffSection } from "@/components/staff/StaffShell";
import { StaffReservations, type ResRow } from "@/components/staff/StaffReservations";
import { StaffRoomSchedule } from "@/components/staff/StaffRoomSchedule";
import { StaffRoomSessions } from "@/components/staff/StaffRoomSessions";
import { StaffFoodOrders, type OrderRow } from "@/components/staff/StaffFoodOrders";

const STAFF_SECTIONS: StaffSection[] = [
  "dashboard",
  "reservations",
  "schedule",
  "sessions",
  "orders",
];

const OPENING_MINUTES = 14 * 60;
const CLOSING_MINUTES = 23 * 60;

type RoomForDashboard = {
  id: string;
  name?: string;
  room_number?: string | number;
  is_active: boolean;
  maintenance_status: boolean;
};

type ReservationForAvailability = {
  room_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  checked_out_at: string | null;
};

type AvailabilityStatus = "available" | "booked" | "pending" | "maintenance";

type AvailabilityDate = {
  key: string;
  date: Date;
  weekday: string;
  day: string;
};

type TimeInterval = {
  start: number;
  end: number;
};

function getTodayDate() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getNext30Days(): AvailabilityDate[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    return {
      key: getDateKey(date),
      date,
      weekday: date.toLocaleDateString("en-PH", {
        weekday: "short",
      }),
      day: String(date.getDate()),
    };
  });
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatDate(date: string) {
  if (!date) return "—";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(time: string) {
  if (!time) return "—";

  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();

  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const date = new Date();

  date.setHours(hours, remainingMinutes, 0, 0);

  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatIntervals(intervals: TimeInterval[]) {
  if (intervals.length === 0) return "None";

  return intervals
    .map((interval) => `${formatMinutes(interval.start)} – ${formatMinutes(interval.end)}`)
    .join(", ");
}

function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a.start - b.start);

  const merged: TimeInterval[] = [{ ...sorted[0] }];

  for (let index = 1; index < sorted.length; index++) {
    const current = sorted[index];
    const previous = merged[merged.length - 1];

    if (current.start <= previous.end) {
      previous.end = Math.max(previous.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

function getComplementIntervals(occupiedIntervals: TimeInterval[]): TimeInterval[] {
  const merged = mergeIntervals(occupiedIntervals);

  const available: TimeInterval[] = [];
  let currentStart = OPENING_MINUTES;

  for (const interval of merged) {
    if (interval.start > currentStart) {
      available.push({
        start: currentStart,
        end: interval.start,
      });
    }

    currentStart = Math.max(currentStart, interval.end);
  }

  if (currentStart < CLOSING_MINUTES) {
    available.push({
      start: currentStart,
      end: CLOSING_MINUTES,
    });
  }

  return available.filter((interval) => interval.end > interval.start);
}

function getReservationInterval(reservation: ReservationForAvailability): TimeInterval | null {
  let start = timeToMinutes(reservation.start_time);
  let end = timeToMinutes(reservation.end_time);

  if (reservation.status === "checked_in") {
    if (reservation.checked_out_at) {
      const checkout = new Date(reservation.checked_out_at);

      if (!Number.isNaN(checkout.getTime())) {
        end = checkout.getHours() * 60 + checkout.getMinutes();
      }
    } else {
      end = CLOSING_MINUTES;
    }
  }

  start = Math.max(start, OPENING_MINUTES);
  end = Math.min(end, CLOSING_MINUTES);

  if (end <= start) return null;

  return { start, end };
}

function getRoomAvailabilityDetails(
  room: RoomForDashboard,
  date: string,
  reservations: ReservationForAvailability[],
) {
  const roomName = room.name || (room.room_number ? `Room ${room.room_number}` : "Unnamed Room");

  const dateReservations = reservations.filter(
    (reservation) =>
      reservation.room_id === room.id &&
      reservation.booking_date === date &&
      !["cancelled", "rejected", "completed"].includes(reservation.status),
  );

  const confirmedReservations = dateReservations.filter((reservation) =>
    ["approved", "checked_in"].includes(reservation.status),
  );

  const pendingReservations = dateReservations.filter(
    (reservation) => reservation.status === "pending",
  );

  const occupiedIntervals = confirmedReservations
    .map(getReservationInterval)
    .filter((interval): interval is TimeInterval => interval !== null);

  const mergedOccupied = mergeIntervals(occupiedIntervals);

  const availableIntervals = getComplementIntervals(mergedOccupied);

  const pendingIntervals = pendingReservations
    .map(getReservationInterval)
    .filter((interval): interval is TimeInterval => interval !== null);

  let status: AvailabilityStatus = "available";

  if (room.maintenance_status) {
    status = "maintenance";
  } else if (confirmedReservations.length > 0) {
    status = "booked";
  } else if (pendingReservations.length > 0) {
    status = "pending";
  }

  const tooltip = [
    `${roomName}`,
    `${formatDate(date)}`,
    "",
    "Shop hours: 2:00 PM – 11:00 PM",
    "",
    `Status: ${status.charAt(0).toUpperCase()}${status.slice(1)}`,
    "",
    `Available hours: ${
      room.maintenance_status ? "None (maintenance)" : formatIntervals(availableIntervals)
    }`,
    `Occupied hours: ${formatIntervals(mergedOccupied)}`,
    `Pending hours: ${formatIntervals(pendingIntervals)}`,
  ].join("\n");

  return {
    status,
    availableIntervals,
    occupiedIntervals: mergedOccupied,
    pendingIntervals,
    tooltip,
  };
}

function getAvailableRooms(
  rooms: RoomForDashboard[],
  reservations: ReservationForAvailability[],
  today: string,
) {
  return rooms.filter((room) => {
    if (!room.is_active || room.maintenance_status) {
      return false;
    }

    const currentlyOccupied = reservations.some(
      (reservation) =>
        reservation.room_id === room.id &&
        reservation.status === "checked_in" &&
        !reservation.checked_out_at,
    );

    if (currentlyOccupied) {
      return false;
    }

    const roomReservations = reservations.filter(
      (reservation) =>
        reservation.room_id === room.id &&
        reservation.booking_date === today &&
        ["approved", "checked_in"].includes(reservation.status),
    );

    const intervals: TimeInterval[] = [];

    roomReservations.forEach((reservation) => {
      const interval = getReservationInterval(reservation);

      if (interval) {
        intervals.push(interval);
      }
    });

    const availableIntervals = getComplementIntervals(intervals);

    return availableIntervals.length > 0;
  }).length;
}

function getOccupiedRooms(reservations: ResRow[]) {
  const occupiedRoomIds = new Set(
    reservations
      .filter((reservation) => reservation.status === "checked_in" && !reservation.checked_out_at)
      .map((reservation) => reservation.room_id)
      .filter(Boolean),
  );

  return occupiedRoomIds.size;
}

function getAvailabilityStyle(status: AvailabilityStatus) {
  const styles: Record<
    AvailabilityStatus,
    {
      label: string;
      className: string;
      dotClassName: string;
      textClassName: string;
      borderClassName: string;
    }
  > = {
    available: {
      label: "Available",
      className: "bg-green-500/10 text-green-600 dark:text-green-400",
      dotClassName: "bg-green-500",
      textClassName: "text-green-600 dark:text-green-400",
      borderClassName: "border-green-500/30",
    },
    booked: {
      label: "Booked",
      className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      dotClassName: "bg-blue-500",
      textClassName: "text-blue-600 dark:text-blue-400",
      borderClassName: "border-blue-500/30",
    },
    pending: {
      label: "Pending",
      className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      dotClassName: "bg-amber-500",
      textClassName: "text-amber-600 dark:text-amber-400",
      borderClassName: "border-amber-500/30",
    },
    maintenance: {
      label: "Maintenance",
      className: "bg-red-500/10 text-red-600 dark:text-red-400",
      dotClassName: "bg-red-500",
      textClassName: "text-red-600 dark:text-red-400",
      borderClassName: "border-red-500/30",
    },
  };

  return styles[status];
}

function AvailabilityStatusBadge({ status }: { status: AvailabilityStatus }) {
  const style = getAvailabilityStyle(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${style.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dotClassName}`} />
      {style.label}
    </span>
  );
}

function StaffStatCard({
  title,
  value,
  description,
  icon: Icon,
  iconColor,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  iconColor: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>

          <p className="font-display text-2xl font-bold tracking-tight">{value}</p>

          <p className="text-xs text-muted-foreground">{description}</p>
        </div>

        <div className={`rounded-lg bg-secondary p-1.5 ${iconColor}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function ReservationStatus({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-accent/15 text-accent",
    approved: "bg-green-500/15 text-green-600 dark:text-green-400",
    checked_in: "bg-primary/15 text-primary",
    completed: "bg-muted text-muted-foreground",
    rejected: "bg-destructive/10 text-destructive",
    cancelled: "bg-red-500/15 text-red-600 dark:text-red-400",
  };

  const labels: Record<string, string> = {
    pending: "Pending",
    approved: "Approved",
    checked_in: "Checked In",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
  };

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
        styles[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function DashboardPanel({
  title,
  description,
  action,
  onAction,
  children,
}: {
  title: string;
  description?: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-semibold">{title}</h3>

          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>

        {action && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            {action}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {children}
    </section>
  );
}

function ReservationList({
  reservations,
  emptyMessage,
}: {
  reservations: ResRow[];
  emptyMessage: string;
}) {
  if (reservations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
        <CalendarDays className="mx-auto h-7 w-7 text-muted-foreground/50" />

        <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {reservations.map((reservation) => (
        <div
          key={reservation.id}
          className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-semibold">
              {reservation.reference_code || "Reservation"}
            </p>

            <p className="truncate text-xs text-muted-foreground">
              {reservation.rooms?.name ||
                (reservation.rooms?.room_number
                  ? `Room ${reservation.rooms.room_number}`
                  : "Room not assigned")}
            </p>

            <p className="text-xs text-muted-foreground">
              {formatDate(reservation.booking_date)}
              {" · "}
              {formatTime(reservation.start_time)}
              {" – "}
              {formatTime(reservation.end_time)}
            </p>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
            <ReservationStatus status={reservation.status} />

            <span className="text-xs text-muted-foreground">{reservation.guest_count} guests</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RoomAvailabilityCalendar({
  rooms,
  reservations,
}: {
  rooms: RoomForDashboard[];
  reservations: ResRow[];
}) {
  const dates = getNext30Days();
  const [selectedDate, setSelectedDate] = useState<AvailabilityDate | null>(null);

  const activeRooms = rooms.filter((room) => room.is_active);

  const sortedRooms = [...activeRooms].sort((a, b) => {
    const roomA = Number(a.room_number ?? 0);
    const roomB = Number(b.room_number ?? 0);

    return roomA - roomB;
  });

  const availabilityReservations = reservations as ReservationForAvailability[];

  const roomName = (room: RoomForDashboard) =>
    room.name || (room.room_number ? `Room ${room.room_number}` : "Unnamed Room");

  const getDateStatus = (date: string): AvailabilityStatus => {
    if (sortedRooms.length === 0) return "maintenance";

    const roomDetails = sortedRooms.map((room) => ({
      room,
      details: getRoomAvailabilityDetails(room, date, availabilityReservations),
    }));

    const roomsNotUnderMaintenance = roomDetails.filter(({ room }) => !room.maintenance_status);

    if (roomsNotUnderMaintenance.length === 0) {
      return "maintenance";
    }

    const hasAvailableHours = roomsNotUnderMaintenance.some(
      ({ details }) => details.availableIntervals.length > 0,
    );

    if (hasAvailableHours) {
      return "available";
    }

    const hasPendingHours = roomsNotUnderMaintenance.some(
      ({ details }) => details.pendingIntervals.length > 0,
    );

    if (hasPendingHours) {
      return "pending";
    }

    const hasOccupiedHours = roomsNotUnderMaintenance.some(
      ({ details }) => details.occupiedIntervals.length > 0,
    );

    if (hasOccupiedHours) {
      return "booked";
    }

    return "available";
  };

  const selectedRoomDetails = selectedDate
    ? sortedRooms.map((room) => ({
        room,
        details: getRoomAvailabilityDetails(room, selectedDate.key, availabilityReservations),
      }))
    : [];

  return (
    <>
      <DashboardPanel
        title="Room Availability"
        description="Next 30 days · Select a date to view room availability."
      >
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {(["available", "booked", "pending", "maintenance"] as AvailabilityStatus[]).map(
            (status) => {
              const style = getAvailabilityStyle(status);

              return (
                <div key={status} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-sm ${style.dotClassName}`} />

                  <span className={`text-[11px] font-medium ${style.textClassName}`}>
                    {style.label}
                  </span>
                </div>
              );
            },
          )}
        </div>

        {sortedRooms.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <DoorOpen className="mx-auto h-7 w-7 text-muted-foreground/50" />

            <p className="mt-2 text-sm text-muted-foreground">
              No active rooms available to display.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
            {dates.map((date) => {
              const status = getDateStatus(date.key);
              const style = getAvailabilityStyle(status);
              const isToday = date.key === getTodayDate();
              const isSelected = selectedDate?.key === date.key;

              return (
                <button
                  key={date.key}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  aria-label={`View room availability for ${formatDate(date.key)}. Status: ${style.label}`}
                  aria-pressed={isSelected}
                  className={`min-w-0 rounded-xl border p-2 text-center transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isSelected
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : isToday
                        ? "border-primary/40 bg-primary/[0.04]"
                        : "border-border bg-secondary/20 hover:border-primary/40 hover:bg-secondary/50"
                  }`}
                >
                  <span className="block text-[10px] font-medium text-muted-foreground">
                    {date.weekday}
                  </span>

                  <span
                    className={`mt-0.5 block font-display text-lg font-bold ${
                      isToday ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {date.day}
                  </span>

                  <span className="mt-1 flex min-w-0 items-center justify-center gap-1">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dotClassName}`} />

                    <span className={`truncate text-[9px] font-medium ${style.textClassName}`}>
                      {style.label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <p className="mt-3 text-[10px] text-muted-foreground">
          Shop hours: 2:00 PM–11:00 PM. Select any date to view each room's availability.
        </p>
      </DashboardPanel>

      {selectedDate && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedDate(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-availability-title"
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <CalendarDays className="h-5 w-5" />
                  </div>

                  <div>
                    <h3 id="room-availability-title" className="font-display text-lg font-bold">
                      Room Availability
                    </h3>

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {selectedDate.date.toLocaleDateString("en-PH", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-muted-foreground">Shop hours: 2:00 PM – 11:00 PM</p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                aria-label="Close room availability details"
                className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                {(["available", "booked", "pending", "maintenance"] as AvailabilityStatus[]).map(
                  (status) => {
                    const style = getAvailabilityStyle(status);

                    return (
                      <div key={status} className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-sm ${style.dotClassName}`} />

                        <span className={`text-[11px] font-medium ${style.textClassName}`}>
                          {style.label}
                        </span>
                      </div>
                    );
                  },
                )}
              </div>

              {selectedRoomDetails.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
                  <DoorOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />

                  <p className="mt-2 text-sm text-muted-foreground">
                    No active rooms available to display.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedRoomDetails.map(({ room, details }) => {
                    const isMaintenance = room.maintenance_status;

                    return (
                      <div
                        key={room.id}
                        className={`rounded-xl border p-4 ${
                          getAvailabilityStyle(details.status).borderClassName
                        } bg-secondary/10`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{roomName(room)}</p>

                            {room.room_number && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Room {room.room_number}
                              </p>
                            )}
                          </div>

                          <AvailabilityStatusBadge status={details.status} />
                        </div>

                        {isMaintenance ? (
                          <div className="mt-4 rounded-lg bg-red-500/5 px-3 py-3">
                            <p className="text-xs font-medium text-red-600 dark:text-red-400">
                              This room is under maintenance.
                            </p>

                            <p className="mt-1 text-xs text-muted-foreground">
                              No booking availability during this period.
                            </p>
                          </div>
                        ) : (
                          <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <div className="min-w-0 rounded-lg bg-green-500/5 p-3">
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />

                                <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                                  Available
                                </p>
                              </div>

                              <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
                                {formatIntervals(details.availableIntervals)}
                              </p>
                            </div>

                            <div className="min-w-0 rounded-lg bg-blue-500/5 p-3">
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />

                                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                                  Booked
                                </p>
                              </div>

                              <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
                                {formatIntervals(details.occupiedIntervals)}
                              </p>
                            </div>

                            <div className="min-w-0 rounded-lg bg-amber-500/5 p-3">
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />

                                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                                  Pending
                                </p>
                              </div>

                              <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
                                {formatIntervals(details.pendingIntervals)}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-border p-4">
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StaffDashboard({
  reservations,
  rooms,
  onSectionChange,
}: {
  reservations: ResRow[];
  rooms: RoomForDashboard[];
  onSectionChange: (section: StaffSection) => void;
}) {
  const today = getTodayDate();

  const activeReservations = reservations.filter(
    (reservation) => !["cancelled", "rejected"].includes(reservation.status),
  );

  const todaysReservations = activeReservations.filter(
    (reservation) => reservation.booking_date === today,
  ).length;

  const pendingReservations = reservations.filter(
    (reservation) => reservation.status === "pending",
  );

  const availableRooms = getAvailableRooms(
    rooms,
    reservations as ReservationForAvailability[],
    today,
  );

  const occupiedRooms = getOccupiedRooms(reservations);

  const recentReservations = reservations.slice(0, 5);

  const upcomingReservations = reservations
    .filter((reservation) => reservation.status === "approved" && reservation.booking_date >= today)
    .sort((a, b) => {
      const dateCompare = a.booking_date.localeCompare(b.booking_date);

      if (dateCompare !== 0) return dateCompare;

      return a.start_time.localeCompare(b.start_time);
    })
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold">Staff Dashboard</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Monitor reservations, room availability, and daily operations.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StaffStatCard
          title="Total Reservations"
          value={reservations.length}
          description="All reservations"
          icon={CalendarDays}
          iconColor="text-primary"
        />

        <StaffStatCard
          title="Today's Reservations"
          value={todaysReservations}
          description="Scheduled today"
          icon={CalendarCheck}
          iconColor="text-accent"
        />

        <StaffStatCard
          title="Pending Reservations"
          value={pendingReservations.length}
          description="Awaiting approval"
          icon={Clock}
          iconColor="text-destructive"
        />

        <StaffStatCard
          title="Available Rooms"
          value={availableRooms}
          description={`of ${rooms.filter((room) => room.is_active).length} active rooms`}
          icon={DoorOpen}
          iconColor="text-glow"
        />

        <StaffStatCard
          title="Occupied Rooms"
          value={occupiedRooms}
          description="In use now"
          icon={DoorClosed}
          iconColor="text-primary"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardPanel
          title="Pending Approvals"
          description="Reservations waiting for administrator review"
          action="View reservations"
          onAction={() => onSectionChange("reservations")}
        >
          <ReservationList
            reservations={pendingReservations.slice(0, 5)}
            emptyMessage="No pending reservations right now."
          />
        </DashboardPanel>

        <DashboardPanel
          title="Recent Reservations"
          description="The latest reservation activity"
          action="View all"
          onAction={() => onSectionChange("reservations")}
        >
          <ReservationList
            reservations={recentReservations}
            emptyMessage="No reservations have been recorded yet."
          />
        </DashboardPanel>

        <RoomAvailabilityCalendar rooms={rooms} reservations={reservations} />

        <DashboardPanel
          title="Upcoming Reservations"
          description="Approved reservations scheduled from today onward"
          action="View schedule"
          onAction={() => onSectionChange("schedule")}
        >
          <ReservationList
            reservations={upcomingReservations}
            emptyMessage="There are no upcoming reservations."
          />
        </DashboardPanel>

        <DashboardPanel
          title="Room Schedule"
          description="Check room bookings and availability throughout the day"
          action="Open schedule"
          onAction={() => onSectionChange("schedule")}
        >
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-secondary/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-3 text-primary">
                <CalendarClock className="h-6 w-6" />
              </div>

              <div>
                <p className="text-sm font-semibold">Manage room availability</p>

                <p className="mt-1 text-xs text-muted-foreground">
                  View today's bookings and scheduled room sessions.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSectionChange("schedule")}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              View schedule
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </DashboardPanel>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/staff")({
  validateSearch: (search: Record<string, unknown>) => {
    const section = STAFF_SECTIONS.includes(search.section as StaffSection)
      ? (search.section as StaffSection)
      : "dashboard";

    return { section };
  },

  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw redirect({ to: "/login" });
    }

    const { data: roleData, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error || !roleData) {
      throw redirect({ to: "/login" });
    }

    if (roleData.role === "admin") {
      throw redirect({ to: "/admin" });
    }

    if (roleData.role !== "staff") {
      throw redirect({ to: "/login" });
    }
  },

  component: StaffPage,
});

function StaffPage() {
  const navigate = useNavigate({ from: "/staff" });
  const queryClient = useQueryClient();
  const { section } = Route.useSearch();

  const changeSection = (nextSection: StaffSection) => {
    void navigate({
      search: (previous) => ({
        ...previous,
        section: nextSection,
      }),
    });
  };

  const reservationsQuery = useQuery({
    queryKey: ["staff-reservations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(
          `
            id,
            reference_code,
            user_id,
            booking_date,
            start_time,
            end_time,
            guest_count,
            room_total,
            status,
            payment_status,
            payment_method,
            payer_name,
            payer_account_number,
            payment_reference,
            special_requests,
            room_id,
            room_rate_snapshot,
            rejection_reason,
            created_at,
            updated_at,
            checked_out_at,
            rooms(name, room_number)
          `,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data ?? []) as unknown as ResRow[];
    },
  });

  const ordersQuery = useQuery({
    queryKey: ["staff-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("food_orders")
        .select(
          `
            id,
            reference_code,
            user_id,
            reservation_id,
            order_type,
            status,
            food_subtotal,
            payment_method,
            payment_status,
            payer_name,
            payer_account_number,
            payment_reference,
            special_instructions,
            submitted_at,
            created_at,
            served_at,
            food_order_items(
              id,
              food_order_id,
              menu_item_id,
              item_name_snapshot,
              unit_price_snapshot,
              quantity,
              line_total
            ),
            reservations(
              reference_code,
              booking_date,
              rooms(name, room_number)
            )
          `,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = data ?? [];
      const userIds = [...new Set(rows.map((row) => row.user_id))];

      let profiles: {
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
      }[] = [];

      if (userIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone")
          .in("id", userIds);

        if (profileError) throw profileError;

        profiles = profileData ?? [];
      }

      return rows.map((row) => ({
        ...row,
        profiles: profiles.find((profile) => profile.id === row.user_id) ?? null,
      })) as unknown as OrderRow[];
    },
  });

  const roomsQueryResult = useQuery(roomsQuery);

  const reservations = reservationsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const rooms = (roomsQueryResult.data ?? []) as RoomForDashboard[];

  const isLoading =
    reservationsQuery.isLoading || ordersQuery.isLoading || roomsQueryResult.isLoading;

  const hasError = reservationsQuery.isError || ordersQuery.isError || roomsQueryResult.isError;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["staff-reservations"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["staff-orders"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["rooms"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["room-status-reservations"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["menu"],
      }),
    ]);
  };

  const handleRestrictedPayment = () => {
    toast.info("Please ask an administrator to manage payment records.");
  };

  if (isLoading) {
    return (
      <StaffShell section={section} onSectionChange={changeSection}>
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading staff dashboard...
          </div>
        </div>
      </StaffShell>
    );
  }

  if (hasError) {
    return (
      <StaffShell section={section} onSectionChange={changeSection}>
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="font-semibold">Unable to load staff data</p>

          <p className="mt-1 text-sm text-muted-foreground">
            Please check your connection and try again.
          </p>

          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </StaffShell>
    );
  }

  let content;

  switch (section) {
    case "dashboard":
      content = (
        <StaffDashboard reservations={reservations} rooms={rooms} onSectionChange={changeSection} />
      );
      break;

    case "reservations":
      content = <StaffReservations reservations={reservations} />;
      break;

    case "schedule":
      content = <StaffRoomSchedule reservations={reservations} />;
      break;

    case "sessions":
      content = (
        <StaffRoomSessions reservations={reservations} onViewPayment={handleRestrictedPayment} />
      );
      break;

    case "orders":
      content = <StaffFoodOrders orders={orders} onViewPayment={handleRestrictedPayment} />;
      break;

    default:
      content = (
        <StaffDashboard reservations={reservations} rooms={rooms} onSectionChange={changeSection} />
      );
  }

  return (
    <StaffShell section={section} onSectionChange={changeSection}>
      <div className="space-y-6">{content}</div>
    </StaffShell>
  );
}
