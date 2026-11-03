import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Filter, LayoutGrid, List, Search, Eye, Pencil } from "lucide-react";

import { StatusBadge, statusLabel } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { durationHours, errMsg, fmtDate, fmtTime, overlaps, peso } from "@/lib/afterglow";
import { roomsQuery } from "@/lib/queries";

import type { Database } from "@/integrations/supabase/types";
import { useProfiles, type ResRow, type ResStatus } from "./shared";
import { ReservationDetail, dateCls, fmtStamp, selectCls } from "./ReservationDetail";

type Mode = "all" | "sessions";
type ViewMode = "list" | "grid";

const RESERVATION_STATUSES: ResStatus[] = ["pending", "approved", "rejected", "cancelled"];

const SESSION_STATUSES: ResStatus[] = ["approved", "checked_in", "completed"];

const BLOCKING: ResStatus[] = ["approved", "checked_in"];

export function ReservationManager({ res, mode }: { res: ResRow[]; mode: Mode }) {
  const qc = useQueryClient();
  const { data: profiles = {} } = useProfiles();
  const { data: rooms = [] } = useQuery(roomsQuery);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | ResStatus>("all");
  const [date, setDate] = useState("");
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

  // Filtered and sorted reservations
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();

    return res
      .filter((r) => allowedStatuses.includes(r.status))
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => !date || r.booking_date === date)
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
  }, [res, allowedStatuses, status, date, room, q, sort, profiles]);

  // Reset pagination when search or filters change
  useEffect(() => {
    setPage(1);
  }, [q, status, date, room, sort]);

  // Pagination calculations
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

  // Check for room booking conflicts
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

  // Update reservation
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

    await qc.invalidateQueries({ queryKey: ["admin-res"] });

    return true;
  };

  // Approve reservation
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

  // Check out customer
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

  // No action buttons inside the reservation details panel
  const actions = (_r: ResRow) => null;

  // Status column and session actions
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
        return (
          <Button size="sm" onClick={() => void update(r.id, { status: "checked_in" })}>
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
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

          {/* Booking date */}
          <Input
            id={`${mode}-date`}
            type="date"
            className={`${dateCls} w-auto min-w-[150px] [color-scheme:white]`}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          {/* Filter */}
          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <Filter className="mr-2 h-4 w-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Grid / List toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-1">
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

                    {/* Narrow Date Submitted column */}
                    <td className="w-[130px] max-w-[130px] p-3 text-xs text-muted-foreground">
                      <span className="block truncate" title={fmtStamp(r.created_at)}>
                        {fmtStamp(r.created_at)}
                      </span>
                    </td>

                    {/* View and Edit actions only */}
                    <td className="p-3">
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
                      </div>
                    </td>

                    {/* Status */}
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

                      {statusDisplay(r)}
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

                    {/* Grid actions: Details and Edit only */}
                    <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                      <Button size="sm" variant="outline" onClick={() => setOpen(r)}>
                        <Eye className="mr-1.5 h-4 w-4" />
                        Details
                      </Button>

                      <Button size="sm" variant="secondary" onClick={() => setMoving(r)}>
                        <Pencil className="mr-1.5 h-4 w-4" />
                        Edit
                      </Button>
                    </div>
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
            {/* Status */}
            <div>
              <Label htmlFor={`${mode}-status`}>Status</Label>

              <select
                id={`${mode}-status`}
                className={selectCls + " mt-1 block w-full"}
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="all">All statuses</option>

                {allowedStatuses.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>

            {/* Room */}
            <div>
              <Label htmlFor={`${mode}-room`}>Room</Label>

              <select
                id={`${mode}-room`}
                className={selectCls + " mt-1 block w-full"}
                value={room}
                onChange={(e) => setRoom(e.target.value)}
              >
                <option value="all">All rooms</option>

                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort by */}
            <div>
              <Label htmlFor={`${mode}-sort`}>Sort by</Label>

              <select
                id={`${mode}-sort`}
                className={selectCls + " mt-1 block w-full"}
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
              >
                <option value="submitted">Date submitted</option>
                <option value="booking">Booking date</option>
              </select>
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
              {/* Change room */}
              <div>
                <Label htmlFor={`${mode}-mv-room`}>Change room</Label>

                <select
                  id={`${mode}-mv-room`}
                  name="room"
                  defaultValue={moving.room_id}
                  className={selectCls + " block w-full"}
                >
                  {rooms
                    .filter((r) => r.is_active && !r.maintenance_status)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {r.capacity} pax · {peso(r.hourly_rate)}/hr
                      </option>
                    ))}
                </select>
              </div>

              {/* Change booking date */}
              <div>
                <Label htmlFor={`${mode}-mv-date`}>Booking date</Label>

                <Input
                  id={`${mode}-mv-date`}
                  name="date"
                  type="date"
                  className={dateCls}
                  defaultValue={moving.booking_date}
                  required
                />
              </div>

              {/* Change booking time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
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

                <div>
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

              {/* Edit dialog buttons */}
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
