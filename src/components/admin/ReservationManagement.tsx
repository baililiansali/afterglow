import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Filter,
  LayoutGrid,
  List,
  Search,
  Eye,
  Pencil,
  CalendarDays,
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  CreditCard,
} from "lucide-react";

import { format, parseISO } from "date-fns";

import { StatusBadge, statusLabel } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { Calendar } from "@/components/ui/calendar";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { durationHours, errMsg, fmtDate, fmtTime, overlaps, peso } from "@/lib/afterglow";

import { roomsQuery } from "@/lib/queries";

import type { Database } from "@/integrations/supabase/types";

import { useProfiles, type ResRow, type ResStatus } from "./shared";

import { ReservationDetail, dateCls, fmtStamp } from "./ReservationDetail";

type Mode = "all" | "sessions";
type ViewMode = "list" | "grid";

type ReservationManagerProps = {
  res: ResRow[];
  mode: Mode;
  onViewPayment?: (reservationId: string) => void;
};

const RESERVATION_STATUSES: ResStatus[] = ["pending", "rejected", "cancelled"];

const SESSION_STATUSES: ResStatus[] = ["approved", "checked_in", "completed"];

const BLOCKING: ResStatus[] = ["approved", "checked_in"];

const dropdownItemClass = "cursor-pointer";

/**
 * Gets the current date and time in Philippine time.
 */
function getManilaDateTime() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

/**
 * Converts a Date to YYYY-MM-DD using local date values.
 */
function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Determines whether a reservation can be checked in.
 */
function canCheckIn(r: ResRow): boolean {
  const now = getManilaDateTime();

  const currentDateTime = `${now.date} ${now.time}`;
  const startDateTime = `${r.booking_date} ${r.start_time}`;
  const endDateTime = `${r.booking_date} ${r.end_time}`;

  return currentDateTime >= startDateTime && currentDateTime < endDateTime;
}

/**
 * Date input with a custom calendar icon.
 * The native picker remains clickable.
 */
function CustomDateInput({
  id,
  value,
  onChange,
  min,
  max,
  className,
  defaultValue,
  name,
  required,
}: {
  id: string;
  value?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  className?: string;
  defaultValue?: string;
  name?: string;
  required?: boolean;
}) {
  return (
    <div className="relative">
      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-white" />

      <Input
        id={id}
        name={name}
        type="date"
        value={value}
        defaultValue={defaultValue}
        min={min}
        max={max}
        required={required}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className={`${className ?? dateCls} pl-10 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0`}
      />
    </div>
  );
}

export function ReservationManager({ res, mode, onViewPayment }: ReservationManagerProps) {
  const qc = useQueryClient();

  const { data: profiles = {} } = useProfiles();
  const { data: rooms = [] } = useQuery(roomsQuery);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | ResStatus>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [room, setRoom] = useState("all");
  const [sort, setSort] = useState<"submitted" | "booking">("submitted");

  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("list");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [open, setOpen] = useState<ResRow | null>(null);
  const [rejecting, setRejecting] = useState<ResRow | null>(null);
  const [reason, setReason] = useState("");
  const [moving, setMoving] = useState<ResRow | null>(null);

  const title = mode === "sessions" ? "Room Sessions" : "Reservations";

  const description =
    mode === "sessions"
      ? "Manage approved bookings, customer check-ins, payments, and completed sessions."
      : "Review reservations, approve or reject requests, and manage booking details.";

  const allowedStatuses = mode === "sessions" ? SESSION_STATUSES : RESERVATION_STATUSES;

  const activeFilterCount = [status !== "all", room !== "all", sort !== "submitted"].filter(
    Boolean,
  ).length;

  const today = getManilaDateTime().date;

  const overviewRows = useMemo(() => {
    return res
      .filter((r) => allowedStatuses.includes(r.status))
      .filter((r) => !fromDate || r.booking_date >= fromDate)
      .filter((r) => !toDate || r.booking_date <= toDate);
  }, [res, allowedStatuses, fromDate, toDate]);

  const totalReservations = overviewRows.length;

  const pendingReservations = overviewRows.filter((r) => r.status === "pending").length;

  const approvedReservations = overviewRows.filter((r) => r.status === "approved").length;

  const unsuccessfulReservations = overviewRows.filter(
    (r) => r.status === "rejected" || r.status === "cancelled",
  ).length;

  const checkedInSessions = overviewRows.filter((r) => r.status === "checked_in").length;

  const completedSessions = overviewRows.filter((r) => r.status === "completed").length;

  const todaysSessions = overviewRows.filter((r) => r.booking_date === today).length;

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();

    return res
      .filter((r) => allowedStatuses.includes(r.status))
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => !fromDate || r.booking_date >= fromDate)
      .filter((r) => !toDate || r.booking_date <= toDate)
      .filter((r) => room === "all" || r.room_id === room)
      .filter((r) => {
        if (!s) return true;

        const p = profiles[r.user_id];

        return [r.reference_code, p?.full_name, p?.phone, p?.email].some((x) =>
          x?.toLowerCase().includes(s),
        );
      })
      .sort((a, b) =>
        sort === "submitted"
          ? b.created_at.localeCompare(a.created_at)
          : (b.booking_date + b.start_time).localeCompare(a.booking_date + a.start_time),
      );
  }, [res, allowedStatuses, status, fromDate, toDate, room, q, sort, profiles]);

  useEffect(() => {
    setPage(1);
  }, [q, status, fromDate, toDate, room, sort]);

  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, currentPage, pageSize]);

  const clearFilters = () => {
    setStatus("all");
    setRoom("all");
    setSort("submitted");
  };

  const conflict = (
    r: ResRow,
    roomId = r.room_id,
    start = r.start_time,
    end = r.end_time,
    day = r.booking_date,
  ) =>
    res.find(
      (o) =>
        o.id !== r.id &&
        o.room_id === roomId &&
        o.booking_date === day &&
        BLOCKING.includes(o.status) &&
        overlaps(start, end, o.start_time, o.end_time),
    );

  const update = async (
    id: string,
    patch: Database["public"]["Tables"]["reservations"]["Update"],
  ): Promise<boolean> => {
    const { data, error } = await supabase
      .from("reservations")
      .update(patch)
      .eq("id", id)
      .select("id");

    if (error) {
      toast.error(errMsg(error));
      return false;
    }

    if (!data?.length) {
      toast.error("That change didn't go through — refresh and try again.");
      return false;
    }

    toast.success("Reservation updated");
    setOpen(null);

    await qc.invalidateQueries({
      queryKey: ["admin-res"],
    });

    return true;
  };

  const approve = async (r: ResRow) => {
    const c = conflict(r);

    if (c) {
      toast.error(
        `Room already booked ${fmtTime(c.start_time)}–${fmtTime(
          c.end_time,
        )} (${c.reference_code}).`,
      );
      return;
    }

    await update(r.id, { status: "approved" });
  };

  const checkin = async (r: ResRow) => {
    if (r.status !== "approved") {
      toast.error("Only approved reservations can be checked in.");
      return;
    }

    if (!canCheckIn(r)) {
      const now = getManilaDateTime();

      const currentDateTime = `${now.date} ${now.time}`;
      const startDateTime = `${r.booking_date} ${r.start_time}`;
      const endDateTime = `${r.booking_date} ${r.end_time}`;

      if (currentDateTime < startDateTime) {
        toast.error("Check-in is not available yet. The reservation has not started.");
      } else if (currentDateTime >= endDateTime) {
        toast.error("This reservation has already expired.");
      } else {
        toast.error("Check-in is not available for this reservation.");
      }

      return;
    }

    await update(r.id, {
      status: "checked_in",
      checked_in_at: new Date().toISOString(),
    });
  };

  const checkout = async (r: ResRow) => {
    if (
      r.payment_status !== "paid" &&
      !window.confirm(
        `${r.reference_code} is still unpaid (${peso(r.room_total)}). Check out anyway?`,
      )
    ) {
      return;
    }

    await update(r.id, {
      status: "completed",
      checked_out_at: new Date().toISOString(),
    });
  };

  const actions = (_r: ResRow) => null;

  const viewPayment = (r: ResRow) => {
    if (!onViewPayment) {
      toast.error("Payment navigation is not configured.");
      return;
    }

    onViewPayment(r.id);
  };

  const statusDisplay = (r: ResRow) => {
    if (mode === "all" && r.status === "pending") {
      return (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" onClick={() => void approve(r)}>
            Approve
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-600 hover:border-red-400 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
            onClick={() => {
              setReason("");
              setRejecting(r);
            }}
          >
            Reject
          </Button>
        </div>
      );
    }

    if (mode === "sessions") {
      if (r.status === "approved") {
        const checkInAllowed = canCheckIn(r);

        return (
          <Button
            size="sm"
            disabled={!checkInAllowed}
            title={
              checkInAllowed
                ? "Check in customer"
                : "Check-in is available only during the reservation time"
            }
            onClick={() => void checkin(r)}
          >
            Check In
          </Button>
        );
      }

      if (r.status === "checked_in") {
        return (
          <Button size="sm" onClick={() => void checkout(r)}>
            Check Out
          </Button>
        );
      }

      if (r.status === "completed") {
        return (
          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            Checked Out
          </span>
        );
      }
    }

    return <StatusBadge status={r.status} />;
  };

  const listActions = (r: ResRow) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        title="View details"
        aria-label={`View ${r.reference_code} details`}
        onClick={() => setOpen(r)}
      >
        <Eye className="h-4 w-4" />
      </Button>

      {r.status === "pending" && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          title="Edit reservation"
          aria-label={`Edit ${r.reference_code}`}
          onClick={() => setMoving(r)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}

      {mode === "sessions" && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          title="View payment"
          aria-label={`View ${r.reference_code} payment`}
          onClick={() => viewPayment(r)}
        >
          <CreditCard className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  const gridActions = (r: ResRow) => (
    <div className="flex flex-wrap items-center justify-start gap-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1.5"
        title="View details"
        onClick={() => setOpen(r)}
      >
        <Eye className="h-4 w-4" />
        Details
      </Button>

      {r.status === "pending" && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1.5"
          title="Edit reservation"
          onClick={() => setMoving(r)}
        >
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      )}

      {mode === "sessions" && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1.5"
          title="View payment"
          onClick={() => viewPayment(r)}
        >
          <CreditCard className="h-4 w-4" />
          View Payment
        </Button>
      )}
    </div>
  );

  const headers = [
    "Reservation ID",
    "Customer",
    "Contact",
    "Room",
    "Date",
    "Start",
    "End",
    "Hrs",
    "Guests",
    "Total",
    "Date Submitted",
    "Action",
    "Status",
  ];

  return (
    <div className="mt-4 space-y-4">
      {/* Page heading */}
      <div>
        <h2 className="font-display text-xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {/* Reservation overview */}
      {mode === "all" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewCard
            title="Total Reservations"
            value={totalReservations}
            description="All reservation requests"
            icon={CalendarDays}
          />

          <OverviewCard
            title="Pending"
            value={pendingReservations}
            description="Awaiting approval"
            icon={Clock}
          />

          <OverviewCard
            title="Approved"
            value={approvedReservations}
            description="Confirmed bookings"
            icon={CheckCircle2}
          />

          <OverviewCard
            title="Rejected / Cancelled"
            value={unsuccessfulReservations}
            description="Unsuccessful bookings"
            icon={XCircle}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewCard
            title="Approved"
            value={approvedReservations}
            description="Awaiting check-in"
            icon={CalendarDays}
          />

          <OverviewCard
            title="Checked In"
            value={checkedInSessions}
            description="Currently ongoing"
            icon={Users}
          />

          <OverviewCard
            title="Completed"
            value={completedSessions}
            description="Finished sessions"
            icon={CheckCircle2}
          />

          <OverviewCard
            title="Today's Sessions"
            value={todaysSessions}
            description="Bookings scheduled today"
            icon={Clock}
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        {/* Search */}
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            id={`${mode}-q`}
            className="pl-9"
            placeholder="Search reservation ID, name, email or phone..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* DATE RANGE */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
          {/* From Date */}
          <div className="min-w-0 space-y-1 sm:w-[150px]">
            <Label htmlFor={`${mode}-from-date`} className="text-xs text-muted-foreground">
              From date
            </Label>
            <Input
              id={`${mode}-from-date`}
              type="date"
              className="h-10 w-full [color-scheme:dark]"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>

          {/* To Date */}
          <div className="min-w-0 space-y-1 sm:w-[150px]">
            <Label htmlFor={`${mode}-to-date`} className="text-xs text-muted-foreground">
              To date
            </Label>
            <Input
              id={`${mode}-to-date`}
              type="date"
              className="h-10 w-full [color-scheme:dark]"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
        </div>

        {/* Filter */}
        <Button variant="outline" onClick={() => setFilterOpen(true)} className="shrink-0">
          <Filter className="mr-2 h-4 w-4" />
          Filter
          {activeFilterCount > 0 && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>

        {/* Grid / List toggle */}
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-secondary/40 p-1">
          <Button
            size="sm"
            variant={view === "grid" ? "default" : "ghost"}
            onClick={() => setView("grid")}
          >
            <LayoutGrid className="mr-1.5 h-4 w-4" />
            Grid
          </Button>

          <Button
            size="sm"
            variant={view === "list" ? "default" : "ghost"}
            onClick={() => setView("list")}
          >
            <List className="mr-1.5 h-4 w-4" />
            List
          </Button>
        </div>
      </div>

      {/* Table view */}
      {view === "list" && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-secondary/50 text-left text-muted-foreground">
              <tr>
                {headers.map((h) => (
                  <th
                    key={h}
                    className={`p-3 font-medium ${
                      h === "Status" || h === "Action" ? "text-right" : ""
                    } ${h === "Status" ? "font-semibold text-foreground" : ""} ${
                      h === "Date Submitted" ? "w-[130px] max-w-[130px] text-xs" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={13} className="p-5 text-center text-muted-foreground">
                    No reservations match.
                  </td>
                </tr>
              )}

              {paginatedList.map((r) => {
                const p = profiles[r.user_id];

                return (
                  <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="p-3 font-medium">{r.reference_code}</td>
                    <td className="p-3">{p?.full_name ?? "Guest"}</td>
                    <td className="p-3">{p?.phone ?? "—"}</td>
                    <td className="p-3">{r.rooms?.name ?? "—"}</td>
                    <td className="p-3">{fmtDate(r.booking_date)}</td>
                    <td className="p-3">{fmtTime(r.start_time)}</td>
                    <td className="p-3">{fmtTime(r.end_time)}</td>
                    <td className="p-3">{durationHours(r.start_time, r.end_time)}</td>
                    <td className="p-3">{r.guest_count}</td>
                    <td className="p-3">{peso(r.room_total)}</td>

                    <td className="w-[130px] max-w-[130px] p-3 text-xs text-muted-foreground">
                      <span className="block truncate" title={fmtStamp(r.created_at)}>
                        {fmtStamp(r.created_at)}
                      </span>
                    </td>

                    <td className="p-3">{listActions(r)}</td>
                    <td className="p-3 text-right">{statusDisplay(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Grid view */}
      {view === "grid" && (
        <>
          {list.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No reservations match.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {paginatedList.map((r) => {
                const p = profiles[r.user_id];

                return (
                  <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{r.reference_code}</p>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {p?.full_name ?? "Guest"}
                        </p>
                      </div>

                      <div className="shrink-0">{statusDisplay(r)}</div>
                    </div>

                    <div className="my-4 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Room</p>
                        <p className="mt-1 font-medium">{r.rooms?.name ?? "—"}</p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">Contact</p>
                        <p className="mt-1 font-medium">{p?.phone ?? "—"}</p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="mt-1 font-medium">{fmtDate(r.booking_date)}</p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">Time</p>
                        <p className="mt-1 font-medium">
                          {fmtTime(r.start_time)} – {fmtTime(r.end_time)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">Duration</p>
                        <p className="mt-1 font-medium">
                          {durationHours(r.start_time, r.end_time)} hours
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">Guests</p>
                        <p className="mt-1 font-medium">{r.guest_count}</p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="mt-1 font-semibold">{peso(r.room_total)}</p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">Date Submitted</p>
                        <p
                          className="mt-1 truncate text-xs font-medium"
                          title={fmtStamp(r.created_at)}
                        >
                          {fmtStamp(r.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-border pt-3">{gridActions(r)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      <Pagination
        page={currentPage}
        pageSize={pageSize}
        totalItems={list.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {/* Filter modal */}
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reservation filters</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${mode}-status`}>Status</Label>

              <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                <SelectTrigger
                  id={`${mode}-status`}
                  className="h-10 w-full justify-between text-sm"
                >
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>

                <SelectContent position="popper" className="max-h-60">
                  <SelectItem value="all" className={dropdownItemClass}>
                    All statuses
                  </SelectItem>

                  {allowedStatuses.map((s) => (
                    <SelectItem key={s} value={s} className={dropdownItemClass}>
                      {statusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${mode}-room`}>Room</Label>

              <Select value={room} onValueChange={setRoom}>
                <SelectTrigger id={`${mode}-room`} className="h-10 w-full justify-between text-sm">
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>

                <SelectContent position="popper" className="max-h-60">
                  <SelectItem value="all" className={dropdownItemClass}>
                    All rooms
                  </SelectItem>

                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id} className={dropdownItemClass}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${mode}-sort`}>Sort by</Label>

              <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
                <SelectTrigger id={`${mode}-sort`} className="h-10 w-full justify-between text-sm">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>

                <SelectContent position="popper">
                  <SelectItem value="submitted" className={dropdownItemClass}>
                    Date submitted
                  </SelectItem>

                  <SelectItem value="booking" className={dropdownItemClass}>
                    Booking date
                  </SelectItem>
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

      {/* Reservation details */}
      <ReservationDetail
        r={open}
        onClose={() => setOpen(null)}
        actions={open ? actions(open) : undefined}
      />

      {/* Reject reservation dialog */}
      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.reference_code}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor={`${mode}-reject-reason`}>Reason (shown to the customer)</Label>

              <Textarea
                id={`${mode}-reject-reason`}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this reservation cannot be approved."
              />
            </div>

            <Button
              className="w-full border border-red-800 bg-red-700 text-white hover:bg-red-800"
              disabled={!reason.trim()}
              onClick={async () => {
                if (!rejecting) return;

                const ok = await update(rejecting.id, {
                  status: "rejected",
                  rejection_reason: reason.trim(),
                });

                if (ok) {
                  setRejecting(null);
                  setReason("");
                }
              }}
            >
              Reject reservation
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit reservation dialog */}
      <Dialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {moving?.reference_code}</DialogTitle>
          </DialogHeader>

          {moving && (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();

                if (moving.status !== "pending") {
                  toast.error("Only pending reservations can be edited.");
                  setMoving(null);
                  return;
                }

                const f = new FormData(e.currentTarget);

                const roomId = String(f.get("room"));
                const day = String(f.get("date"));
                const start = String(f.get("start")).slice(0, 5) + ":00";
                const end = String(f.get("end")).slice(0, 5) + ":00";

                const rm = rooms.find((x) => x.id === roomId);

                if (!rm) {
                  return void toast.error("Please select a valid room.");
                }

                if (!day) {
                  return void toast.error("Please select a booking date.");
                }

                if (end <= start) {
                  return void toast.error("End time must be after start time.");
                }

                if (moving.guest_count > rm.capacity) {
                  return void toast.error(`${rm.name} fits only ${rm.capacity} guests.`);
                }

                const c = conflict(moving, roomId, start, end, day);

                if (c) {
                  return void toast.error(
                    `Clashes with ${c.reference_code} (${fmtTime(
                      c.start_time,
                    )}–${fmtTime(c.end_time)}).`,
                  );
                }

                const rate = Number(rm.hourly_rate);

                const ok = await update(moving.id, {
                  room_id: roomId,
                  booking_date: day,
                  start_time: start,
                  end_time: end,
                  room_rate_snapshot: rate,
                  room_total: rate * durationHours(start, end),
                });

                if (ok) {
                  setMoving(null);
                }
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${mode}-mv-room`}>Change room</Label>

                <Select name="room" defaultValue={moving.room_id}>
                  <SelectTrigger
                    id={`${mode}-mv-room`}
                    className="h-10 w-full justify-between text-sm"
                  >
                    <SelectValue placeholder="Select a room" />
                  </SelectTrigger>

                  <SelectContent position="popper" className="max-h-60">
                    {rooms
                      .filter((r) => r.is_active && !r.maintenance_status)
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id} className={dropdownItemClass}>
                          {r.name} · {r.capacity} pax · {peso(r.hourly_rate)}/hr
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${mode}-mv-date`}>Booking date</Label>

                <CustomDateInput
                  id={`${mode}-mv-date`}
                  name="date"
                  defaultValue={moving.booking_date}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${mode}-mv-start`}>Start time</Label>

                  <Input
                    id={`${mode}-mv-start`}
                    name="start"
                    type="time"
                    step={3600}
                    className="[color-scheme:dark]"
                    defaultValue={moving.start_time.slice(0, 5)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${mode}-mv-end`}>End time</Label>

                  <Input
                    id={`${mode}-mv-end`}
                    name="end"
                    type="time"
                    step={3600}
                    className="[color-scheme:dark]"
                    defaultValue={moving.end_time.slice(0, 5)}
                    required
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                The price is recalculated using the selected room's hourly rate.
              </p>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => setMoving(null)}>
                  Cancel
                </Button>

                <Button type="submit">Save changes</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Overview card component.
function OverviewCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: number;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>

          <p className="mt-2 text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>

          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
