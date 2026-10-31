import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { PageHeader, RequireAuth, useRedirectAdmin } from "@/components/SiteChrome";
import { StatusBadge, PaymentMethodBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, fmtDate, fmtTime, peso } from "@/lib/afterglow";
import { useAuth } from "@/lib/auth";
import { cartPayload, useCart } from "@/lib/cart";

export const Route = createFileRoute("/my-bookings")({
  head: () => ({
    meta: [
      { title: "My Bookings — Afterglow" },
      { name: "description", content: "Track your karaoke bookings and food orders." },
      { property: "og:title", content: "My Bookings — Afterglow" },
      { property: "og:description", content: "Track your karaoke bookings and food orders." },
    ],
  }),
  component: MyBookingsPage,
});

function MyBookingsPage() {
  useRedirectAdmin();
  return (
    <RequireAuth>
      <MyBookings />
    </RequireAuth>
  );
}

function MyBookings() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["my-bookings"],
    enabled: !!user,
    queryFn: async () => {
      await supabase.rpc("expire_no_show_reservations");
      const { data, error } = await supabase
        .from("reservations")
        .select("*, rooms(name, room_number), food_orders(*, food_order_items(*))")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
  });

  const cancel = async (id: string) => {
    if (!confirm("Cancel this booking?")) return;
    const { error } = await supabase.rpc("cancel_my_reservation", {
      _reservation_id: id,
    });
    if (error) return void toast.error(errMsg(error));
    toast.success("Booking cancelled");
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
  };

  if (!user) {
    return <div className="mx-auto max-w-4xl px-4 py-20 text-muted-foreground">Loading…</div>;
  }

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPaymentMethodFilter("all");
  };

  const filteredData = data?.filter((r) => {
    if (search) {
      const term = search.toLowerCase();
      const ref = r.reference_code.toLowerCase();
      const roomName = (r.rooms?.name ?? "").toLowerCase();
      if (!ref.includes(term) && !roomName.includes(term)) return false;
    }

    if (statusFilter === "pending" && r.status !== "pending") return false;
    if (statusFilter === "approved" && !["approved", "checked_in"].includes(r.status))
      return false;
    if (statusFilter === "past" && r.status !== "completed") return false;
    if (statusFilter === "cancelled" && !["cancelled", "rejected"].includes(r.status)) return false;

    if (paymentMethodFilter !== "all" && r.payment_method !== paymentMethodFilter) return false;

    return true;
  });

  const sortedData = filteredData?.sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA;
  });

  const gridCols = "grid grid-cols-[1fr_3rem_5rem] gap-4";
  const hasActiveFilters = search || statusFilter !== "all" || paymentMethodFilter !== "all";

  return (
    <div>
      <PageHeader eyebrow="Account" title="My bookings" />

      <div className="mx-auto max-w-3xl space-y-6 px-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "Upcoming",
              value: (data ?? []).filter((b) =>
                ["pending", "approved", "checked_in"].includes(b.status),
              ).length,
            },
            {
              label: "Completed",
              value: (data ?? []).filter((b) => b.status === "completed").length,
            },
            {
              label: "Paid",
              value: peso(
                (data ?? [])
                  .filter((b) => b.payment_status === "paid")
                  .reduce((s, b) => s + Number(b.room_total), 0),
              ),
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="font-display text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by Ref or Room..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card"
            />
          </div>

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-muted-foreground"
              >
                Reset filter
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 bg-card">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {hasActiveFilters && <span className="flex h-2 w-2 rounded-full bg-primary" />}
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-64 p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <span className="text-sm font-semibold">Filters</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <X className="mr-1 h-3 w-3" />
                      Clear all
                    </Button>
                  </div>

                  <div>
                    <DropdownMenuLabel className="px-0 text-xs font-semibold text-muted-foreground">
                      Booking Status
                    </DropdownMenuLabel>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
                    >
                      <option value="all">All bookings</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="past">Completed</option>
                      <option value="cancelled">Cancelled or rejected</option>
                    </select>
                  </div>

                  <DropdownMenuSeparator />

                  <div>
                    <DropdownMenuLabel className="px-0 text-xs font-semibold text-muted-foreground">
                      Payment Method
                    </DropdownMenuLabel>
                    <select
                      value={paymentMethodFilter}
                      onChange={(e) => setPaymentMethodFilter(e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="all">All Methods</option>
                      <option value="gcash">GCash</option>
                      <option value="cash">Cash</option>
                    </select>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {isLoading && <p className="text-muted-foreground">Loading...</p>}

        {sortedData?.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <p className="text-muted-foreground">No bookings found.</p>
            {hasActiveFilters && (
              <Button variant="outline" className="mt-4" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </div>
        )}

        {sortedData?.map((r) => {
          const foodTotal = (r.food_orders ?? [])
            .filter((o) => o.status !== "cancelled")
            .reduce((s, o) => s + Number(o.food_subtotal), 0);
          const grandTotal = Number(r.room_total) + foodTotal;

          const isPaid = r.payment_status === "paid" || r.payment_method === "gcash";
          const displayStatus = isPaid ? "paid" : "unpaid";
          const canCancel = r.status === "pending" || r.status === "approved";

          return (
            <div key={r.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border p-6 pb-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-xl font-bold">
                      {r.rooms?.name ?? "Unknown Room"}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {fmtDate(r.booking_date)} · {fmtTime(r.start_time)} - {fmtTime(r.end_time)}
                    </p>
                    <p className="text-sm text-muted-foreground">{r.guest_count} guests</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Ref: {r.reference_code}
                    </p>
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      <StatusBadge status={r.status} />

                      {r.status !== "cancelled" && r.status !== "completed" && (
                        <StatusBadge status={displayStatus} />
                      )}

                      <PaymentMethodBadge method={r.payment_method} />
                    </div>
                  </div>
                </div>
              </div>

              {r.status === "completed" ? (
                <div className="p-6 pt-4 text-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-display text-base font-bold">Final Billing Statement</p>
                    <span className="rotate-[-4deg] rounded-md border-2 border-chart-4 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-chart-4">
                      Completed &amp; Settled
                    </span>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Checked out · {fmtDate(r.booking_date)} · {fmtTime(r.start_time)} -{" "}
                    {fmtTime(r.end_time)} · {r.guest_count} guests
                  </p>
                  <div className={`${gridCols} mb-2 border-b border-border pb-2 font-semibold text-muted-foreground`}>
                    <span>Item</span>
                    <span className="text-center">Qty</span>
                    <span className="text-right">Price</span>
                  </div>
                  <div className={`${gridCols} py-1`}>
                    <span>Room Charge ({r.rooms?.room_number})</span>
                    <span className="text-center">1</span>
                    <span className="text-right">{peso(r.room_total)}</span>
                  </div>
                  {(r.food_orders ?? [])
                    .filter((o) => o.status !== "cancelled")
                    .flatMap((o) => o.food_order_items ?? [])
                    .map((i) => (
                      <div key={i.id} className={`${gridCols} py-1`}>
                        <span className="text-muted-foreground">{i.item_name_snapshot}</span>
                        <span className="text-center">{i.quantity}</span>
                        <span className="text-right text-muted-foreground">{peso(i.line_total)}</span>
                      </div>
                    ))}
                  <div className="mt-4 flex flex-col items-end gap-1 border-t border-border pt-3">
                    <div className="flex w-56 justify-between text-muted-foreground">
                      <span>Room subtotal</span>
                      <span>{peso(r.room_total)}</span>
                    </div>
                    <div className="flex w-56 justify-between text-muted-foreground">
                      <span>Food &amp; drinks</span>
                      <span>{peso(foodTotal)}</span>
                    </div>
                    <div className="flex w-56 justify-between pt-1 text-base font-bold text-accent">
                      <span>Grand Total Paid</span>
                      <span>{peso(grandTotal)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 p-6 pt-4 text-sm">
                  <div className="rounded-lg border border-border bg-background/40 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-semibold">Room Reservation Receipt</p>
                      <span className="text-xs text-muted-foreground">
                        {r.payment_method === "gcash"
                          ? isPaid ? "Paid via GCash" : "GCash · Unpaid"
                          : isPaid ? "Paid · Cash" : "Unpaid · Cash at counter"}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Room Charge ({r.rooms?.room_number})</span>
                      <span>{peso(r.room_total)}</span>
                    </div>
                    <div className="mt-2 flex justify-between border-t border-border pt-2 font-bold text-accent">
                      <span>Room subtotal</span>
                      <span>{peso(r.room_total)}</span>
                    </div>
                  </div>

                  {(r.food_orders ?? []).length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Food &amp; Drinks Orders
                      </p>
                      {r.food_orders!.map((o) => {
                        const sub = (o.food_order_items ?? []).reduce(
                          (s, i) => s + Number(i.line_total),
                          0,
                        );
                        return (
                          <div key={o.id} className="rounded-lg border border-border bg-background/40 p-4">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-muted-foreground">
                                {o.order_type === "pre_order" ? "Pre-order" : "In-room Order"} ·{" "}
                                {o.reference_code}
                              </p>
                              <div className="flex gap-2">
                                <StatusBadge status={o.status} />
                                <PaymentMethodBadge method={o.payment_method} />
                              </div>
                            </div>
                            {(o.food_order_items ?? []).map((i) => (
                              <div key={i.id} className={`${gridCols} py-1`}>
                                <span className="text-muted-foreground">{i.item_name_snapshot}</span>
                                <span className="text-center">{i.quantity}</span>
                                <span className="text-right text-muted-foreground">{peso(i.line_total)}</span>
                              </div>
                            ))}
                            <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
                              <span>Order subtotal</span>
                              <span>{peso(sub)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}


              {r.status === "rejected" && r.rejection_reason && (
                <p className="border-t border-border p-4 text-sm text-muted-foreground">
                  Reason: {r.rejection_reason}
                </p>
              )}
              {(canCancel || r.status === "checked_in") && (
                <div className="border-t border-border bg-secondary/10 p-4">
                  {canCancel && (
                    <Button
                      variant="outline"
                      className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => cancel(r.id)}
                    >
                      Cancel Booking
                    </Button>
                  )}

                  {r.status === "checked_in" && <InRoomOrder reservationId={r.id} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InRoomOrder({ reservationId }: { reservationId: string }) {
  const cart = useCart();
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  // ADDED: Payment method selection
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash">("cash");
  const [payerName, setPayerName] = useState("");
  const [payerAccount, setPayerAccount] = useState("");

  const send = async () => {
    if (paymentMethod === "gcash") {
      if (payerName.trim().length < 2) return void toast.error("Enter the e-wallet account name.");
      if (!/^[0-9+ -]{7,20}$/.test(payerAccount.trim()))
        return void toast.error("Enter a valid e-wallet account number.");
    }
    setBusy(true);
    const { error } = await supabase.rpc("create_in_room_order", {
      _reservation_id: reservationId,
      _items: cartPayload(cart.items),
      _notes: notes,
      _payment_method: paymentMethod,
      _payer_name: payerName.trim(),
      _payer_account: payerAccount.trim(),
    });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    cart.clear();
    setNotes("");
    toast.success("Order sent to the kitchen!");
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
  };

  return (
    <div className="space-y-3">
      {cart.count === 0 ? (
        <Button asChild variant="outline" className="w-full">
          <Link to="/menu">Add food from the menu</Link>
        </Button>
      ) : (
        <>
          <div className="rounded-lg bg-background p-3 text-sm">
            <p className="font-medium text-muted-foreground">Current Cart:</p>
            <ul className="mt-1">
              {cart.items.map((i) => (
                <li key={i.id} className="flex justify-between">
                  <span>
                    {i.quantity}× {i.name}
                  </span>
                  <span>{peso(i.price * i.quantity)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Payment method</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={`rounded-md border px-3 py-2 text-sm transition ${
                  paymentMethod === "cash"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:border-primary/60"
                }`}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("gcash")}
                className={`rounded-md border px-3 py-2 text-sm transition ${
                  paymentMethod === "gcash"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:border-primary/60"
                }`}
              >
                GCash
              </button>
            </div>
            {paymentMethod === "cash" ? (
              <p className="text-xs text-muted-foreground">
                Pay in cash at the counter when the food is delivered.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="GCash account name"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  className="bg-background"
                />
                <Input
                  placeholder="GCash account number"
                  value={payerAccount}
                  onChange={(e) => setPayerAccount(e.target.value)}
                  className="bg-background"
                />
              </div>
            )}
          </div>

          <Textarea
            placeholder="Notes for the kitchen (optional)"
            maxLength={300}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="bg-background"
          />
          <Button variant="glow" className="w-full" onClick={send} disabled={busy}>
            {busy ? "Sending…" : "Send Order to Room"}
          </Button>
        </>
      )}
    </div>
  );
}
