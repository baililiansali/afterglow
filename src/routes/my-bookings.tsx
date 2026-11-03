import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Search, SlidersHorizontal, X, CalendarDays, CheckCircle2, Wallet } from "lucide-react";

import { PageHeader, RequireAuth, useRedirectAdmin } from "@/components/SiteChrome";
import { StatusBadge } from "@/components/StatusBadge";
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

    if (statusFilter === "approved" && !["approved", "checked_in"].includes(r.status)) {
      return false;
    }

    if (statusFilter === "past" && r.status !== "completed") return false;

    if (statusFilter === "cancelled" && !["cancelled", "rejected"].includes(r.status)) {
      return false;
    }

    if (paymentMethodFilter !== "all" && r.payment_method !== paymentMethodFilter) {
      return false;
    }

    return true;
  });

  const sortedData = filteredData?.sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();

    return dateB - dateA;
  });

  const hasActiveFilters = search || statusFilter !== "all" || paymentMethodFilter !== "all";

  const summaryCards = [
    {
      label: "Upcoming",
      value: (data ?? []).filter((b) => ["pending", "approved", "checked_in"].includes(b.status))
        .length,
      icon: CalendarDays,
    },
    {
      label: "Completed",
      value: (data ?? []).filter((b) => b.status === "completed").length,
      icon: CheckCircle2,
    },
    {
      label: "Paid",
      value: peso(
        (data ?? [])
          .filter((b) => b.payment_status === "paid")
          .reduce((s, b) => s + Number(b.room_total), 0),
      ),
      icon: Wallet,
    },
  ];

  return (
    <div>
      <PageHeader eyebrow="Account" title="My bookings" />

      <div className="mx-auto max-w-3xl space-y-6 px-4">
        {/* Overview cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {summaryCards.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.label} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">{item.label}</p>

                    <p className="mt-2 font-display text-2xl font-bold tabular-nums">
                      {item.value}
                    </p>
                  </div>

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Search and filters */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              placeholder="Search reservation ID or room..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-background pl-9"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
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
                <Button variant="outline" size="sm" className="gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {hasActiveFilters && <span className="flex h-2 w-2 rounded-full bg-primary" />}
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-64 p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-2">
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
                      <option value="all">All methods</option>
                      <option value="gcash">GCash</option>
                      <option value="cash">Cash</option>
                    </select>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading bookings...</p>
        )}

        {/* Empty state */}
        {sortedData?.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <p className="text-muted-foreground">No bookings found.</p>

            {hasActiveFilters && (
              <Button variant="outline" className="mt-4" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        )}

        {/* Booking cards */}
        {sortedData?.map((r) => {
          const foodOrders = r.food_orders ?? [];

          const activeFoodOrders = foodOrders.filter((o) => o.status !== "cancelled");

          const foodTotal = activeFoodOrders.reduce((s, o) => s + Number(o.food_subtotal), 0);

          const roomTotal = Number(r.room_total);
          const grandTotal = roomTotal + foodTotal;

          const isPaid = r.payment_status === "paid";
          const canCancel = r.status === "pending" || r.status === "approved";

          const isCompleted = r.status === "completed";

          return (
            <div key={r.id} className="overflow-hidden rounded-xl border border-border bg-card">
              {/* Booking header */}
              <div className="border-b border-border p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-bold">
                      {r.rooms?.name ?? "Unknown Room"}
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {fmtDate(r.booking_date)} · {fmtTime(r.start_time)} – {fmtTime(r.end_time)}
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">{r.guest_count} guests</p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <StatusBadge status={r.status} />

                    <p className="text-xs text-muted-foreground">
                      Ref: <span className="font-medium text-foreground">{r.reference_code}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Completed billing statement */}
              {isCompleted ? (
                <div className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-base font-bold">Final Billing Statement</h3>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Your completed reservation and food orders
                      </p>
                    </div>

                    <StatusBadge status="paid" />
                  </div>

                  <BookingDetails
                    roomNumber={r.rooms?.room_number}
                    roomName={r.rooms?.name}
                    date={fmtDate(r.booking_date)}
                    time={`${fmtTime(r.start_time)} – ${fmtTime(r.end_time)}`}
                    guests={r.guest_count}
                  />

                  <div className="rounded-lg border border-border bg-background/40 p-3 sm:p-4">
                    <ReceiptTable>
                      <ReceiptRow
                        name={`Room Charge (${r.rooms?.room_number ?? "Room"})`}
                        quantity={1}
                        amount={roomTotal}
                      />

                      {activeFoodOrders.flatMap((o) =>
                        (o.food_order_items ?? []).map((i) => (
                          <ReceiptRow
                            key={i.id}
                            name={i.item_name_snapshot}
                            quantity={i.quantity}
                            amount={Number(i.line_total)}
                          />
                        )),
                      )}
                    </ReceiptTable>

                    <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
                      <SummaryRow label="Room subtotal" amount={roomTotal} />
                      <SummaryRow label="Food & drinks" amount={foodTotal} />

                      <div className="flex items-center justify-between border-t border-border pt-3 text-base font-bold">
                        <span>Grand Total Paid</span>
                        <span className="text-accent">{peso(grandTotal)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>Payment method: {formatPaymentMethod(r.payment_method)}</span>
                    <span>Payment status: {isPaid ? "Paid" : "Unpaid"}</span>
                  </div>
                </div>
              ) : (
                /* Active booking receipt */
                <div className="space-y-5 p-4 sm:p-5">
                  {/* Reservation details */}
                  <div>
                    <div className="mb-3">
                      <h3 className="font-display text-base font-bold">Reservation Details</h3>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Booking information and room charges
                      </p>
                    </div>

                    <BookingDetails
                      roomNumber={r.rooms?.room_number}
                      roomName={r.rooms?.name}
                      date={fmtDate(r.booking_date)}
                      time={`${fmtTime(r.start_time)} – ${fmtTime(r.end_time)}`}
                      guests={r.guest_count}
                    />

                    <div className="mt-4 rounded-lg border border-border bg-background/40 p-3 sm:p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="font-semibold">Room Reservation Receipt</p>

                        <span className="text-xs text-muted-foreground">
                          {formatPaymentMethod(r.payment_method)}
                        </span>
                      </div>

                      <ReceiptTable>
                        <ReceiptRow
                          name={`Room Charge (${r.rooms?.room_number ?? "Room"})`}
                          quantity={1}
                          amount={roomTotal}
                        />
                      </ReceiptTable>

                      <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                        <SummaryRow label="Room subtotal" amount={roomTotal} />

                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Payment status</span>

                          <span
                            className={
                              isPaid
                                ? "font-semibold text-emerald-600 dark:text-emerald-400"
                                : "font-semibold text-amber-600 dark:text-amber-400"
                            }
                          >
                            {isPaid ? "Paid" : "Unpaid"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Food orders */}
                  {foodOrders.length > 0 && (
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-display text-base font-bold">Food & Drinks</h3>

                        <p className="mt-1 text-xs text-muted-foreground">
                          Your food and beverage orders for this booking
                        </p>
                      </div>

                      {foodOrders.map((o) => {
                        const items = o.food_order_items ?? [];

                        const subtotal = items.reduce((s, i) => s + Number(i.line_total), 0);

                        const cancelled = o.status === "cancelled";

                        return (
                          <div
                            key={o.id}
                            className="rounded-lg border border-border bg-background/40 p-3 sm:p-4"
                          >
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold">
                                  {o.order_type === "pre_order" ? "Pre-order" : "In-room Order"}
                                </p>

                                <p className="mt-1 text-xs text-muted-foreground">
                                  Order Ref: {o.reference_code}
                                </p>
                              </div>

                              <StatusBadge status={o.status} />
                            </div>

                            <ReceiptTable>
                              {items.map((i) => (
                                <ReceiptRow
                                  key={i.id}
                                  name={i.item_name_snapshot}
                                  quantity={i.quantity}
                                  amount={Number(i.line_total)}
                                />
                              ))}
                            </ReceiptTable>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">
                                  Payment method: {formatPaymentMethod(o.payment_method)}
                                </p>

                                {cancelled && (
                                  <p className="text-xs text-destructive">
                                    This order was cancelled.
                                  </p>
                                )}
                              </div>

                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Order subtotal</p>

                                <p className="font-semibold">{peso(subtotal)}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Total summary */}
                  <div className="rounded-lg border border-border bg-secondary/20 p-4">
                    <div className="space-y-2 text-sm">
                      <SummaryRow label="Room subtotal" amount={roomTotal} />
                      <SummaryRow label="Food & drinks" amount={foodTotal} />

                      <div className="flex items-center justify-between border-t border-border pt-3 text-base font-bold">
                        <span>Current Total</span>
                        <span className="text-accent">{peso(grandTotal)}</span>
                      </div>
                    </div>

                    <p className="mt-2 text-xs text-muted-foreground">
                      Cancelled food orders are excluded from the current total.
                    </p>
                  </div>
                </div>
              )}

              {/* Rejection reason */}
              {r.status === "rejected" && r.rejection_reason && (
                <div className="border-t border-border bg-secondary/10 p-4">
                  <p className="text-sm font-semibold">Rejection reason</p>
                  <p className="mt-1 text-sm text-muted-foreground">{r.rejection_reason}</p>
                </div>
              )}

              {/* Booking actions */}
              {(canCancel || r.status === "checked_in") && (
                <div className="space-y-3 border-t border-border bg-secondary/10 p-4">
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

/* Booking information */
function BookingDetails({
  roomNumber,
  roomName,
  date,
  time,
  guests,
}: {
  roomNumber: string | number | null;
  roomName: string | null;
  date: string;
  time: string;
  guests: number;
}) {
  const details = [
    {
      label: "Room",
      value: roomName ?? "Unknown Room",
    },
    {
      label: "Room number",
      value: roomNumber ?? "—",
    },
    {
      label: "Booking date",
      value: date,
    },
    {
      label: "Time",
      value: time,
    },
    {
      label: "Guests",
      value: `${guests} guests`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-background/40 p-3 sm:grid-cols-3 sm:p-4">
      {details.map((item) => (
        <div key={item.label} className="min-w-0">
          <p className="text-xs text-muted-foreground">{item.label}</p>

          <p className="mt-1 truncate text-sm font-medium" title={String(item.value)}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/* Receipt table */
function ReceiptTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_5.5rem] gap-2 border-b border-border pb-2 text-xs font-semibold text-muted-foreground sm:grid-cols-[minmax(0,1fr)_3rem_6rem]">
        <span>Item</span>
        <span className="text-center">Qty</span>
        <span className="text-right">Amount</span>
      </div>

      {children}
    </div>
  );
}

/* Receipt item row */
function ReceiptRow({
  name,
  quantity,
  amount,
}: {
  name: string;
  quantity: number;
  amount: number;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_5.5rem] items-start gap-2 py-1.5 text-sm sm:grid-cols-[minmax(0,1fr)_3rem_6rem]">
      <span className="min-w-0 break-words">{name}</span>

      <span className="text-center text-muted-foreground">{quantity}</span>

      <span className="text-right tabular-nums">{peso(amount)}</span>
    </div>
  );
}

/* Receipt summary row */
function SummaryRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{peso(amount)}</span>
    </div>
  );
}

/* Payment method label */
function formatPaymentMethod(method: string | null) {
  if (method === "gcash") return "GCash";
  if (method === "cash") return "Cash";

  return "Not specified";
}

/* In-room food ordering */
function InRoomOrder({ reservationId }: { reservationId: string }) {
  const cart = useCart();
  const qc = useQueryClient();

  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash">("cash");
  const [payerName, setPayerName] = useState("");
  const [payerAccount, setPayerAccount] = useState("");

  const send = async () => {
    if (cart.count === 0) {
      return void toast.error("Your cart is empty.");
    }

    if (paymentMethod === "gcash") {
      if (payerName.trim().length < 2) {
        return void toast.error("Enter the e-wallet account name.");
      }

      if (!/^[0-9+ -]{7,20}$/.test(payerAccount.trim())) {
        return void toast.error("Enter a valid e-wallet account number.");
      }
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
    setPayerName("");
    setPayerAccount("");

    toast.success("Order sent to the kitchen!");

    qc.invalidateQueries({ queryKey: ["my-bookings"] });
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-display text-base font-bold">Order Food & Drinks</h3>

        <p className="mt-1 text-xs text-muted-foreground">
          Order additional food and beverages during your session.
        </p>
      </div>

      {cart.count === 0 ? (
        <Button asChild variant="outline" className="w-full">
          <Link to="/menu">Add food from the menu</Link>
        </Button>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-background/40 p-3 text-sm">
            <p className="font-semibold">Current Cart</p>

            <ul className="mt-2 space-y-2">
              {cart.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    {i.quantity}× {i.name}
                  </span>

                  <span className="shrink-0 tabular-nums">{peso(i.price * i.quantity)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex justify-between border-t border-border pt-3 font-semibold">
              <span>Cart total</span>

              <span>
                {peso(cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0))}
              </span>
            </div>
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
