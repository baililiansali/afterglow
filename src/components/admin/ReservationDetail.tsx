
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { StatusBadge, PaymentMethodBadge } from "@/components/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { durationHours, fmtDate, fmtTime, peso } from "@/lib/afterglow";
import { supabase } from "@/integrations/supabase/client";
import { useProfiles, type ResRow } from "./shared";

// =====================================================
// STYLES
// =====================================================

export const selectCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm [color-scheme:dark]";

export const dateCls =
  "w-40 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:invert";

// =====================================================
// DATE FORMAT
// =====================================================

export function fmtStamp(ts: string | null | undefined) {
  if (!ts) return "—";

  return new Date(ts).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// =====================================================
// PAYMENT PROOF TYPE
// =====================================================

type PaymentProof = {
  id: string;
  storage_path: string;
  payment_reference: string;
  payer_name: string;
  payer_account_number: string;
  status: string;
  signedUrl: string;
};

// =====================================================
// PAYMENT PROOF QUERY
// =====================================================

function useReservationPaymentProof(reservationId: string | undefined) {
  return useQuery({
    queryKey: ["reservation-payment-proof", reservationId],
    enabled: !!reservationId,
    refetchOnMount: "always",

    queryFn: async (): Promise<PaymentProof | null> => {
      if (!reservationId) return null;

      const { data, error } = await supabase
        .from("payment_proofs")
        .select(
          `
            id,
            storage_path,
            payment_reference,
            payer_name,
            payer_account_number,
            status
          `,
        )
        .eq("reservation_id", reservationId)
        .limit(10);

      if (error) throw error;

      if (!data || data.length === 0) {
        return null;
      }

      // Prefer the proof that is still awaiting verification.
      const proof = data.find((item) => item.status === "pending") ?? data[0];

      // Generate a temporary URL for the private screenshot.
      const { data: signedData, error: signedError } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(proof.storage_path, 3600);

      if (signedError) throw signedError;

      return {
        ...proof,
        signedUrl: signedData.signedUrl,
      };
    },
  });
}

// =====================================================
// DETAIL ROW
// =====================================================

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
      <span className="shrink-0 text-sm text-muted-foreground">
        {label}
      </span>

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

// =====================================================
// SECTION HEADING
// =====================================================

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-accent">
      {children}
    </h3>
  );
}

// =====================================================
// DETAIL SECTION
// =====================================================

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <SectionHeading>{title}</SectionHeading>

      <div className="divide-y divide-border/60">{children}</div>
    </section>
  );
}

// =====================================================
// PAYMENT PROOF SECTION
// =====================================================

function PaymentProofSection({
  reservationId,
}: {
  reservationId: string;
}) {
  const {
    data: proof,
    isLoading,
    isError,
    error,
  } = useReservationPaymentProof(reservationId);

  return (
    <DetailSection title="Uploaded Payment Proof">
      {isLoading && (
        <div className="py-4 text-sm text-muted-foreground">
          Loading payment proof...
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">
            Unable to load payment proof.
          </p>

          <p className="mt-1 break-words text-xs text-muted-foreground">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      )}

      {!isLoading && !isError && !proof && (
        <div className="rounded-lg border border-border bg-secondary/30 p-4">
          <p className="text-sm font-medium">
            No payment screenshot found.
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            The customer has not submitted a GCash payment proof for this
            reservation.
          </p>
        </div>
      )}

      {proof && (
        <div className="space-y-4">
          <DetailRow
            label="Payer name"
            value={proof.payer_name || "—"}
          />

          <DetailRow
            label="GCash account number"
            value={proof.payer_account_number || "—"}
          />

          <DetailRow
            label="Transaction reference"
            value={proof.payment_reference || "—"}
          />

          <DetailRow
            label="Proof status"
            value={<StatusBadge status={proof.status} />}
          />

          <div className="space-y-2 pt-2">
            <div>
              <p className="text-sm font-semibold">
                Payment Screenshot
              </p>

              <p className="text-xs text-muted-foreground">
                Review this screenshot before manually verifying the payment.
              </p>
            </div>

            <a
              href={proof.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group block overflow-hidden rounded-lg border border-border bg-secondary/30"
            >
              <img
                src={proof.signedUrl}
                alt="Customer GCash payment screenshot"
                className="max-h-[420px] w-full object-contain transition-opacity group-hover:opacity-90"
              />

              <div className="flex items-center justify-center gap-2 border-t border-border bg-secondary/50 px-3 py-3 text-sm font-medium">
                Open Full Screenshot
                <span aria-hidden="true">↗</span>
              </div>
            </a>
          </div>
        </div>
      )}
    </DetailSection>
  );
}

// =====================================================
// RESERVATION DETAIL
// =====================================================

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
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-xl border-border bg-card sm:max-w-xl">
        {r && (
          <div className="space-y-5">
            {/* Header */}
            <DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-bold">
                    Reservation Details
                  </DialogTitle>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.reference_code}
                  </p>
                </div>

                <StatusBadge status={r.status} />
              </div>
            </DialogHeader>

            {/* Booking Summary */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Reserved room
                  </p>

                  <p className="mt-1 text-lg font-semibold">
                    {r.rooms?.name ?? "—"}
                  </p>

                  <p className="text-sm text-muted-foreground">
                    Room #{r.rooms?.room_number ?? "—"}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    Total price
                  </p>

                  <p className="mt-1 text-xl font-bold">
                    {peso(r.room_total)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Date
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {fmtDate(r.booking_date)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">
                    Time
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {fmtTime(r.start_time)} – {fmtTime(r.end_time)}
                  </p>
                </div>
              </div>
            </div>

            {/* Customer Information */}
            <DetailSection title="Customer Information">
              <DetailRow
                label="Full name"
                value={p?.full_name ?? "Guest"}
              />

              <DetailRow
                label="Email address"
                value={p?.email ?? "—"}
              />

              <DetailRow
                label="Contact number"
                value={p?.phone ?? "—"}
              />
            </DetailSection>

            {/* Booking Information */}
            <DetailSection title="Booking Information">
              <DetailRow
                label="Duration"
                value={`${durationHours(r.start_time, r.end_time)} hours`}
              />

              <DetailRow
                label="Number of guests"
                value={r.guest_count}
              />

              <DetailRow
                label="Hourly rate"
                value={peso(r.room_rate_snapshot)}
              />

              <DetailRow
                label="Submitted"
                value={fmtStamp(r.created_at)}
              />

              {r.rejection_reason && (
                <DetailRow
                  label="Rejection reason"
                  value={r.rejection_reason}
                />
              )}
            </DetailSection>

            {/* Payment Information */}
            <DetailSection title="Payment Information">
              <DetailRow
                label="Payment method"
                value={<PaymentMethodBadge method={r.payment_method} />}
              />

              <DetailRow
                label="Payment status"
                value={<StatusBadge status={r.payment_status} />}
              />

              <DetailRow
                label="Room total"
                value={peso(r.room_total)}
                bold
              />
            </DetailSection>

            {/* GCash Payment Proof */}
            {r.payment_method === "gcash" && (
              <PaymentProofSection reservationId={r.id} />
            )}

            {/* Notes and Special Requests */}
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
