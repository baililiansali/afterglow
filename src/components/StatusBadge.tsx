import { cn } from "@/lib/utils";

const tone: Record<string, string> = {
  pending: "bg-accent/15 text-accent border-accent/30",
  approved: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  confirmed: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  checked_in: "bg-primary/15 text-primary border-primary/30",
  preparing: "bg-primary/15 text-primary border-primary/30",
  ready: "bg-glow/15 text-glow border-glow/30",
  served: "bg-muted text-muted-foreground border-border",
  completed: "bg-muted text-muted-foreground border-border",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  paid: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  unpaid: "bg-muted text-muted-foreground border-border",
};

export function statusLabel(status: string) {
  return status === "completed" ? "checked out" : status.replace("_", " ");
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        tone[status] ?? tone["served"],
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

export function paymentMethodLabel(method: string | null | undefined) {
  return method === "gcash" ? "GCash / e-wallet" : "Cash at counter";
}

export function PaymentMethodBadge({ method }: { method: string | null | undefined }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
      {paymentMethodLabel(method)}
    </span>
  );
}
