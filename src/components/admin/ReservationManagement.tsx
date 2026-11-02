import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StatusBadge, statusLabel } from "@/components/StatusBadge";
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

    await qc.invalidateQueries({ queryKey: ["admin-res"] });

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

  const cancel = async (r: ResRow) => {
    const why = window.prompt("Reason for cancelling?", "Cancelled by admin");

    if (why === null) return;

    await update(r.id, {
      status: "cancelled",
      rejection_reason: why.trim() || null,
    });
  };

  const actions = (r: ResRow) => (
    <>
      {mode === "all" && r.status === "pending" && (
        <>
          <Button size="sm" onClick={() => void approve(r)}>
            Approve
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setReason("");
              setRejecting(r);
            }}
          >
            Reject
          </Button>
        </>
      )}

      {mode === "sessions" && r.status === "approved" && (
        <Button size="sm" onClick={() => void update(r.id, { status: "checked_in" })}>
          Check in
        </Button>
      )}

      {mode === "sessions" && r.status === "checked_in" && (
        <Button size="sm" onClick={() => void checkout(r)}>
          Check out
        </Button>
      )}

      {mode === "sessions" &&
        r.payment_status === "unpaid" &&
        ["approved", "checked_in", "completed"].includes(r.status) && (
          <Button
            size="sm"
            variant="amber"
            onClick={() => void update(r.id, { payment_status: "paid" })}
          >
            Mark paid
          </Button>
        )}

      {mode === "all" && ["pending", "approved"].includes(r.status) && (
        <>
          <Button size="sm" variant="outline" onClick={() => setMoving(r)}>
            Change room / time
          </Button>

          <Button size="sm" variant="outline" onClick={() => void cancel(r)}>
            Cancel booking
          </Button>
        </>
      )}
    </>
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
    "Status",
    "Submitted",
  ];

  return (
    <div className="mt-4 space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold">{title}</h2>

        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="min-w-56 flex-1">
          <Label htmlFor={`${mode}-q`}>Search</Label>

          <Input
            id={`${mode}-q`}
            placeholder="Reservation ID, name, email or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor={`${mode}-status`}>Status</Label>

          <select
            id={`${mode}-status`}
            className={selectCls + " block"}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="all">All statuses</option>

            {allowedStatuses.map((s) => (
              <option key={s} value={s}>
                {mode === "sessions" && s === "approved" ? "Upcoming" : statusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor={`${mode}-date`}>Booking date</Label>

          <Input
            id={`${mode}-date`}
            type="date"
            className={dateCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor={`${mode}-room`}>Room</Label>

          <select
            id={`${mode}-room`}
            className={selectCls + " block"}
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

        <div>
          <Label htmlFor={`${mode}-sort`}>Sort by</Label>

          <select
            id={`${mode}-sort`}
            className={selectCls + " block"}
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <option value="submitted">Date submitted</option>
            <option value="booking">Booking date</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-secondary/50 text-left text-muted-foreground">
            <tr>
              {headers.map((h) => (
                <th key={h} className="p-3 font-medium">
                  {h}
                </th>
              ))}
              <th className="p-3 font-medium">Action</th>
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

            {list.map((r) => {
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
                  <td className="p-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="p-3 text-muted-foreground">{fmtStamp(r.created_at)}</td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setOpen(r)}>
                      View details
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ReservationDetail
        r={open}
        onClose={() => setOpen(null)}
        actions={open ? actions(open) : undefined}
      />

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
              className="w-full"
              disabled={!reason.trim()}
              onClick={async () => {
                if (!rejecting) return;

                const ok = await update(rejecting.id, {
                  status: "rejected",
                  rejection_reason: reason.trim(),
                });

                if (ok) setRejecting(null);
              }}
            >
              Reject reservation
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change {moving?.reference_code}</DialogTitle>
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

                if (!rm) return;

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

                if (ok) setMoving(null);
              }}
            >
              <div>
                <Label htmlFor={`${mode}-mv-room`}>Room</Label>
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

              <div>
                <Label htmlFor={`${mode}-mv-date`}>Date</Label>
                <Input
                  id={`${mode}-mv-date`}
                  name="date"
                  type="date"
                  className={dateCls}
                  defaultValue={moving.booking_date}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor={`${mode}-mv-start`}>Start</Label>
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
                  <Label htmlFor={`${mode}-mv-end`}>End</Label>
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

              <Button type="submit" className="w-full">
                Save changes
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
