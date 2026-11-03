import type { ReactNode } from "react";

import { StatusBadge, PaymentMethodBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { durationHours, fmtDate, fmtTime, peso } from "@/lib/afterglow";
import { useProfiles, type ResRow } from "./shared";

export const selectCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm [color-scheme:dark]";

export const dateCls = "w-40 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:invert";

export function fmtStamp(ts: string | null | undefined) {
  if (!ts) return "—";

  return new Date(ts).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function DetailRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: ReactNode;
  bold?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>

      <span
        className={`min-w-0 text-right text-sm ${
          bold ? "font-semibold text-foreground" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>

      <div className="divide-y divide-border/60">{children}</div>
    </section>
  );
}

export function ReservationDetail({
  r,
  onClose,
  actions,
}: {
  r: ResRow | null;
  onClose: () => void;
  actions?: ReactNode;
}) {
  const { data: profiles = {} } = useProfiles();
  const p = r ? profiles[r.user_id] : undefined;

  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {r && (
          <div className="space-y-5">
            {/* Header */}
            <DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-bold">Reservation Details</DialogTitle>

                  <p className="mt-1 text-sm text-muted-foreground">{r.reference_code}</p>
                </div>

                <StatusBadge status={r.status} />
              </div>
            </DialogHeader>

            {/* Booking summary */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Reserved room</p>

                  <p className="mt-1 text-lg font-semibold">{r.rooms?.name ?? "—"}</p>

                  <p className="text-sm text-muted-foreground">
                    Room #{r.rooms?.room_number ?? "—"}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total price</p>

                  <p className="mt-1 text-xl font-bold">{peso(r.room_total)}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="mt-1 text-sm font-medium">{fmtDate(r.booking_date)}</p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Time</p>
                  <p className="mt-1 text-sm font-medium">
                    {fmtTime(r.start_time)} – {fmtTime(r.end_time)}
                  </p>
                </div>
              </div>
            </div>

            {/* Customer */}
            <DetailSection title="Customer Information">
              <DetailRow label="Full name" value={p?.full_name ?? "Guest"} />

              <DetailRow label="Email address" value={p?.email ?? "—"} />

              <DetailRow label="Contact number" value={p?.phone ?? "—"} />
            </DetailSection>

            {/* Booking */}
            <DetailSection title="Booking Information">
              <DetailRow
                label="Duration"
                value={`${durationHours(r.start_time, r.end_time)} hours`}
              />

              <DetailRow label="Number of guests" value={r.guest_count} />

              <DetailRow label="Hourly rate" value={peso(r.room_rate_snapshot)} />

              <DetailRow label="Submitted" value={fmtStamp(r.created_at)} />

              {r.rejection_reason && (
                <DetailRow label="Rejection reason" value={r.rejection_reason} />
              )}
            </DetailSection>

            {/* Payment */}
            <DetailSection title="Payment Information">
              <DetailRow
                label="Payment method"
                value={<PaymentMethodBadge method={r.payment_method} />}
              />

              <DetailRow label="Payment status" value={<StatusBadge status={r.payment_status} />} />

              <DetailRow label="Room total" value={peso(r.room_total)} bold />
            </DetailSection>

            {/* Special requests */}
            <DetailSection title="Notes and Special Requests">
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {r.special_requests || "No special requests provided."}
                </p>
              </div>
            </DetailSection>

            {/* Actions */}
            {actions && (
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                {actions}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
