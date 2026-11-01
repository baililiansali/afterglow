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

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-1.5 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

export function ReservationDetail({
  r,
  onClose,
  actions,
}: {
  r: ResRow | null;
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  const { data: profiles = {} } = useProfiles();
  const p = r ? profiles[r.user_id] : undefined;
  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {r && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {r.reference_code} <StatusBadge status={r.status} />
              </DialogTitle>
            </DialogHeader>
            <div>
              <p className="mb-1 mt-2 text-xs uppercase tracking-wider text-accent">Customer</p>
              <Row k="Name" v={p?.full_name ?? "Guest"} />
              <Row k="Email" v={p?.email ?? "—"} />
              <Row k="Contact number" v={p?.phone ?? "—"} />
              <p className="mb-1 mt-4 text-xs uppercase tracking-wider text-accent">Booking</p>
              <Row k="Room" v={`${r.rooms?.name ?? "—"} (#${r.rooms?.room_number ?? "—"})`} />
              <Row k="Date" v={fmtDate(r.booking_date)} />
              <Row k="Time" v={`${fmtTime(r.start_time)} – ${fmtTime(r.end_time)}`} />
              <Row k="Duration" v={`${durationHours(r.start_time, r.end_time)} hrs`} />
              <Row k="Guests" v={r.guest_count} />
              <Row k="Hourly rate" v={peso(r.room_rate_snapshot)} />
              <Row k="Total price" v={<b>{peso(r.room_total)}</b>} />
              <Row k="Payment" v={<span className="inline-flex gap-1"><PaymentMethodBadge method={r.payment_method} /><StatusBadge status={r.payment_status} /></span>} />
              <Row k="Submitted" v={fmtStamp(r.created_at)} />
              {r.rejection_reason && <Row k="Reason" v={r.rejection_reason} />}
              <p className="mb-1 mt-4 text-xs uppercase tracking-wider text-accent">Notes / requests</p>
              <p className="text-sm italic text-muted-foreground">
                {r.special_requests || "None"}
              </p>
            </div>
            {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
