import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Search,
  Filter,
  X,
  CalendarDays,
  CheckCircle2,
  Wallet,
  CreditCard,
  Upload,
  Clock,
  Loader2,
  Receipt,
  Utensils,
  Download,
  ArrowUpDown,
} from "lucide-react";
import jsPDF from "jspdf";

import { PageHeader, RequireAuth, useRedirectAdmin } from "@/components/SiteChrome";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";

import { supabase } from "@/integrations/supabase/client";
import { errMsg, fmtDate, fmtTime, peso } from "@/lib/afterglow";
import { useAuth } from "@/lib/auth";
import { cartPayload, useCart } from "@/lib/cart";

export const Route = createFileRoute("/my-bookings")({
  head: () => ({
    meta: [
      { title: "Transactions — SONARA" },
      {
        name: "description",
        content: "Manage your room reservations, food orders, payments, and receipts.",
      },
      { property: "og:title", content: "Transactions — SONARA" },
      {
        property: "og:description",
        content: "Manage your room reservations, food orders, payments, and receipts.",
      },
    ],
  }),
  component: MyBookingsPage,
});

const MAX_PROOF_SIZE = 5 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = ["image/jpeg", "image/png", "image/webp"];

type TransactionTab = "rooms" | "food" | "receipts";
type PaymentTarget = "reservation" | "food_order";
type ReceiptSortOrder = "desc" | "asc";

function toLocalDateString(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

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

  const [activeTab, setActiveTab] = useState<TransactionTab>("rooms");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [receiptSortOrder, setReceiptSortOrder] = useState<ReceiptSortOrder>("desc");
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);

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

  const reservationIds = (data ?? []).map((reservation) => reservation.id);

  const { data: receipts, isLoading: receiptsLoading } = useQuery({
    queryKey: ["my-session-receipts", reservationIds],
    enabled: !!user && reservationIds.length > 0,
    queryFn: async () => {
      const db = supabase as any;

      const { data, error } = await db
        .from("session_receipts")
        .select("*")
        .in("reservation_id", reservationIds);

      if (error) throw error;

      return (data ?? []) as SessionReceipt[];
    },
  });

  const cancel = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this booking?")) return;

    const { error } = await supabase.rpc("cancel_my_reservation", {
      _reservation_id: id,
    });

    if (error) return void toast.error(errMsg(error));

    toast.success("Booking cancelled.");
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
  };

  if (!user) {
    return <div className="mx-auto max-w-4xl px-4 py-20 text-muted-foreground">Loading…</div>;
  }

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPaymentStatusFilter("all");
    setPaymentMethodFilter("all");
    setFromDate("");
    setToDate("");
  };

  const allReservations = data ?? [];

  const allFoodOrders = allReservations.flatMap((reservation) =>
    (reservation.food_orders ?? []).map((order) => ({
      ...order,
      reservation,
    })),
  );

  const filteredReservations = allReservations.filter((reservation) => {
    if (search) {
      const term = search.toLowerCase();
      const reference = reservation.reference_code.toLowerCase();
      const roomName = (reservation.rooms?.name ?? "").toLowerCase();

      if (!reference.includes(term) && !roomName.includes(term)) return false;
    }

    if (fromDate && reservation.booking_date < fromDate) return false;
    if (toDate && reservation.booking_date > toDate) return false;

    if (statusFilter === "pending" && reservation.status !== "pending") {
      return false;
    }

    if (statusFilter === "approved" && !["approved", "checked_in"].includes(reservation.status)) {
      return false;
    }

    if (statusFilter === "past" && reservation.status !== "completed") {
      return false;
    }

    if (
      statusFilter === "cancelled" &&
      !["cancelled", "rejected", "no_show"].includes(reservation.status)
    ) {
      return false;
    }

    if (paymentStatusFilter !== "all" && reservation.payment_status !== paymentStatusFilter) {
      return false;
    }

    if (paymentMethodFilter !== "all" && reservation.payment_method !== paymentMethodFilter) {
      return false;
    }

    return true;
  });

  const filteredFoodOrders = allFoodOrders.filter((order) => {
    if (search) {
      const term = search.toLowerCase();
      const orderReference = order.reference_code.toLowerCase();
      const reservationReference = order.reservation.reference_code.toLowerCase();

      if (!orderReference.includes(term) && !reservationReference.includes(term)) {
        return false;
      }
    }

    if (fromDate && order.reservation.booking_date < fromDate) return false;
    if (toDate && order.reservation.booking_date > toDate) return false;

    if (statusFilter !== "all" && order.status !== statusFilter) {
      return false;
    }

    if (paymentStatusFilter !== "all" && order.payment_status !== paymentStatusFilter) {
      return false;
    }

    if (paymentMethodFilter !== "all" && order.payment_method !== paymentMethodFilter) {
      return false;
    }

    return true;
  });

  const sortedReservations = [...filteredReservations].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const sortedFoodOrders = [...filteredFoodOrders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const sortedReceipts = [...(receipts ?? [])]
    .filter((receipt) => {
      if (search) {
        const term = search.toLowerCase();
        const snapshot = receipt.receipt_snapshot ?? {};
        const reservation = snapshot.reservation ?? {};
        const roomName = reservation.room?.name ?? "";
        const reservationReference = reservation.reference_code ?? "";

        const matchesSearch = [receipt.receipt_number, reservationReference, roomName].some(
          (value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(term),
        );

        if (!matchesSearch) return false;
      }

      if (fromDate || toDate) {
        const issuedDate = receipt.issued_at ? toLocalDateString(receipt.issued_at) : "";

        if (!issuedDate) return false;
        if (fromDate && issuedDate < fromDate) return false;
        if (toDate && issuedDate > toDate) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.issued_at).getTime();
      const dateB = new Date(b.issued_at).getTime();

      return receiptSortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

  const hasActiveFilters =
    !!search ||
    !!fromDate ||
    !!toDate ||
    (activeTab !== "receipts" &&
      (statusFilter !== "all" || paymentStatusFilter !== "all" || paymentMethodFilter !== "all"));

  const activeFilterCount = [
    activeTab !== "receipts" && statusFilter !== "all",
    activeTab !== "receipts" && paymentStatusFilter !== "all",
    activeTab !== "receipts" && paymentMethodFilter !== "all",
  ].filter(Boolean).length;

  const roomPaidTotal = allReservations
    .filter((reservation) => reservation.payment_status === "paid")
    .reduce((sum, reservation) => sum + Number(reservation.room_total), 0);

  const foodPaidTotal = allFoodOrders
    .filter((order) => order.payment_status === "paid")
    .reduce((sum, order) => sum + Number(order.food_subtotal), 0);

  const summaryCards = [
    {
      label: "Reservations",
      value: allReservations.length,
      icon: CalendarDays,
    },
    {
      label: "Food Orders",
      value: allFoodOrders.length,
      icon: Utensils,
    },
    {
      label: "Total Paid",
      value: peso(roomPaidTotal + foodPaidTotal),
      icon: Wallet,
    },
  ];

  return (
    <div>
      <PageHeader eyebrow="Account" title="Transactions" />

      <div className="mx-auto max-w-3xl space-y-6 px-4">
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

        <div className="grid grid-cols-3 rounded-xl border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab("rooms");
              setStatusFilter("all");
              setPaymentStatusFilter("all");
              setPaymentMethodFilter("all");
            }}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-3 text-xs font-semibold transition sm:flex-row sm:gap-2 sm:text-sm ${
              activeTab === "rooms"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            <span>Reservations</span>
            <span className="text-xs opacity-75">({allReservations.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("food");
              setStatusFilter("all");
              setPaymentStatusFilter("all");
              setPaymentMethodFilter("all");
            }}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-3 text-xs font-semibold transition sm:flex-row sm:gap-2 sm:text-sm ${
              activeTab === "food"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            }`}
          >
            <Utensils className="h-4 w-4" />
            <span>Food Orders</span>
            <span className="text-xs opacity-75">({allFoodOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("receipts");
              setStatusFilter("all");
              setPaymentStatusFilter("all");
              setPaymentMethodFilter("all");
            }}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-3 text-xs font-semibold transition sm:flex-row sm:gap-2 sm:text-sm ${
              activeTab === "receipts"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            }`}
          >
            <Receipt className="h-4 w-4" />
            <span>Receipts</span>
            <span className="text-xs opacity-75">({receipts?.length ?? 0})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              placeholder={
                activeTab === "rooms"
                  ? "Search reservation ID or room..."
                  : activeTab === "food"
                    ? "Search food order or reservation ID..."
                    : "Search receipt or reservation ID..."
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 bg-background pl-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
            <div className="min-w-0 space-y-1 sm:w-[150px]">
              <label
                htmlFor="my-bookings-from-date"
                className="block text-xs text-muted-foreground"
              >
                From date
              </label>

              <Input
                id="my-bookings-from-date"
                type="date"
                className="h-10 w-full [color-scheme:dark]"
                value={fromDate}
                max={toDate || undefined}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </div>

            <div className="min-w-0 space-y-1 sm:w-[150px]">
              <label htmlFor="my-bookings-to-date" className="block text-xs text-muted-foreground">
                To date
              </label>

              <Input
                id="my-bookings-to-date"
                type="date"
                className="h-10 w-full [color-scheme:dark]"
                value={toDate}
                min={fromDate || undefined}
                onChange={(event) => setToDate(event.target.value)}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2">
            {activeTab !== "receipts" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 gap-2 px-3">
                    <Filter className="h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="flex h-2 w-2 rounded-full bg-primary" />
                    )}
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-64 p-2">
                  <div className="flex items-center justify-between px-2 py-2">
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

                  <DropdownMenuSeparator />

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer">
                      {activeTab === "rooms" ? "Reservation Status" : "Food Order Status"}
                    </DropdownMenuSubTrigger>

                    <DropdownMenuSubContent className="w-52">
                      {(activeTab === "rooms"
                        ? [
                            { value: "all", label: "All statuses" },
                            { value: "pending", label: "Pending" },
                            { value: "approved", label: "Approved" },
                            { value: "past", label: "Completed" },
                            { value: "cancelled", label: "Cancelled" },
                          ]
                        : [
                            { value: "all", label: "All statuses" },
                            { value: "pending", label: "Pending" },
                            { value: "confirmed", label: "Confirmed" },
                            { value: "served", label: "Served" },
                            { value: "cancelled", label: "Cancelled" },
                          ]
                      ).map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onSelect={() => setStatusFilter(option.value)}
                          className="cursor-pointer justify-between"
                        >
                          <span>{option.label}</span>
                          {statusFilter === option.value && (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer">
                      Payment Status
                    </DropdownMenuSubTrigger>

                    <DropdownMenuSubContent className="w-48">
                      {[
                        { value: "all", label: "All payment statuses" },
                        { value: "paid", label: "Paid" },
                        { value: "unpaid", label: "Unpaid" },
                      ].map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onSelect={() => setPaymentStatusFilter(option.value)}
                          className="cursor-pointer justify-between"
                        >
                          <span>{option.label}</span>
                          {paymentStatusFilter === option.value && (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer">
                      Payment Method
                    </DropdownMenuSubTrigger>

                    <DropdownMenuSubContent className="w-44">
                      {[
                        { value: "all", label: "All methods" },
                        { value: "gcash", label: "GCash" },
                        { value: "cash", label: "Cash" },
                      ].map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onSelect={() => setPaymentMethodFilter(option.value)}
                          className="cursor-pointer justify-between"
                        >
                          <span>{option.label}</span>
                          {paymentMethodFilter === option.value && (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 gap-2 px-3">
                    <ArrowUpDown className="h-4 w-4" />
                    Filters
                    <span className="flex h-2 w-2 rounded-full bg-primary" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-64 p-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-sm font-semibold">Filters</span>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReceiptSortOrder("desc")}
                        className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <X className="mr-1 h-3 w-3" />
                        Clear all
                      </Button>
                    </div>

                    <div>
                      <DropdownMenuLabel className="px-0 text-xs font-semibold text-muted-foreground">
                        Issue Date
                      </DropdownMenuLabel>

                      <div className="mt-1 space-y-1">
                        <DropdownMenuItem
                          onSelect={() => setReceiptSortOrder("asc")}
                          className="cursor-pointer justify-between"
                        >
                          <span>Ascending (Oldest First)</span>
                          {receiptSortOrder === "asc" && (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onSelect={() => setReceiptSortOrder("desc")}
                          className="cursor-pointer justify-between"
                        >
                          <span>Descending (Newest First)</span>
                          {receiptSortOrder === "desc" && (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                        </DropdownMenuItem>
                      </div>
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {isLoading && (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading transactions...</p>
        )}

        {!isLoading && activeTab === "rooms" && (
          <div className="space-y-4">
            {sortedReservations.length === 0 ? (
              <EmptyState
                message="No room reservations found."
                hasFilters={hasActiveFilters}
                onClear={clearFilters}
              />
            ) : (
              sortedReservations.map((reservation) => {
                const roomTotal = Number(reservation.room_total);
                const isPaid = reservation.payment_status === "paid";

                const canCancel =
                  reservation.status === "pending" || reservation.status === "approved";

                const isCompleted = reservation.status === "completed";

                const isCancelled = ["cancelled", "rejected", "no_show"].includes(
                  reservation.status,
                );

                const showPaymentAction = reservation.payment_method === "gcash" && !isPaid;

                const sessionReceipt = (receipts ?? []).find(
                  (receipt) => receipt.reservation_id === reservation.id,
                );

                return (
                  <div
                    key={reservation.id}
                    className="overflow-hidden rounded-xl border border-border bg-card"
                  >
                    <div className="border-b border-border p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="font-display text-lg font-bold text-accent">
                            {reservation.rooms?.name ?? "Unknown Room"}
                          </h2>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {fmtDate(reservation.booking_date)} · {fmtTime(reservation.start_time)}{" "}
                            – {fmtTime(reservation.end_time)}
                          </p>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {reservation.guest_count} guests
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <StatusBadge status={reservation.status} />

                          <p className="text-xs text-muted-foreground">
                            Ref:{" "}
                            <span className="font-medium text-foreground">
                              {reservation.reference_code}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {isCompleted ? (
                      <div className="p-4 sm:p-5">
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                          <div className="flex items-center gap-2 font-semibold">
                            <Receipt className="h-4 w-4 text-emerald-600" />
                            Final e-receipt
                          </div>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {sessionReceipt
                              ? "Your complete receipt is available in the Receipts tab."
                              : "Your final receipt will appear here after checkout and full payment."}
                          </p>

                          {sessionReceipt && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-3"
                              onClick={() => {
                                setActiveTab("receipts");
                                setExpandedReceiptId(sessionReceipt.id);
                              }}
                            >
                              <Receipt className="mr-2 h-4 w-4" />
                              View Receipt
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-5 p-4 sm:p-5">
                          <div>
                            <SectionHeading>Reservation Details</SectionHeading>

                            <p className="mt-1 text-xs text-muted-foreground">
                              Booking information and room charges
                            </p>

                            <div className="mt-3">
                              <BookingDetails
                                roomNumber={reservation.rooms?.room_number}
                                roomName={reservation.rooms?.name}
                                date={fmtDate(reservation.booking_date)}
                                time={`${fmtTime(reservation.start_time)} – ${fmtTime(reservation.end_time)}`}
                                guests={reservation.guest_count}
                              />
                            </div>
                          </div>

                          <div className="rounded-lg border border-border bg-background/40 p-3 sm:p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <p className="font-semibold">Room Reservation Payment</p>
                              <StatusBadge status={reservation.payment_status} />
                            </div>

                            <ReceiptTable>
                              <ReceiptRow
                                name={`Room Charge (${reservation.rooms?.room_number ?? "Room"})`}
                                quantity={1}
                                amount={roomTotal}
                              />
                            </ReceiptTable>

                            <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                              <SummaryRow label="Room subtotal" amount={roomTotal} />

                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">Payment method</span>
                                <span className="font-medium">
                                  {formatPaymentMethod(reservation.payment_method)}
                                </span>
                              </div>

                              {isPaid && (
                                <p className="flex items-center gap-2 pt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="h-4 w-4" />
                                  Payment verified
                                </p>
                              )}

                              {!isPaid && reservation.payment_method === "cash" && (
                                <p className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                                  <Wallet className="h-4 w-4" />
                                  Pay at the venue.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {!isCancelled && (
                          <div className="space-y-3 border-t border-border bg-secondary/10 p-4">
                            <div
                              className={`grid grid-cols-1 gap-2 ${
                                canCancel && showPaymentAction ? "sm:grid-cols-2" : ""
                              }`}
                            >
                              {canCancel && (
                                <Button
                                  variant="outline"
                                  className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => cancel(reservation.id)}
                                >
                                  Cancel Booking
                                </Button>
                              )}

                              {showPaymentAction && (
                                <PaymentProofForm
                                  targetType="reservation"
                                  targetId={reservation.id}
                                  userId={user.id}
                                  paymentStatus={reservation.payment_status}
                                />
                              )}
                            </div>

                            {reservation.status === "checked_in" && (
                              <InRoomOrder reservationId={reservation.id} />
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {reservation.status === "rejected" && reservation.rejection_reason && (
                      <div className="border-t border-border bg-secondary/10 p-4">
                        <p className="text-sm font-semibold">Rejection reason</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {reservation.rejection_reason}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {!isLoading && activeTab === "food" && (
          <div className="space-y-4">
            {sortedFoodOrders.length === 0 ? (
              <EmptyState
                message="No food orders found."
                hasFilters={hasActiveFilters}
                onClear={clearFilters}
              />
            ) : (
              sortedFoodOrders.map((order) => {
                const items = order.food_order_items ?? [];
                const subtotal = Number(order.food_subtotal);
                const isPaid = order.payment_status === "paid";
                const cancelled = order.status === "cancelled";

                return (
                  <div
                    key={order.id}
                    className="overflow-hidden rounded-xl border border-border bg-card"
                  >
                    <div className="border-b border-border p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="font-display text-lg font-bold">
                            {order.order_type === "pre_order" ? "Pre-order" : "In-room Order"}
                          </h2>

                          <p className="mt-1 text-xs text-muted-foreground">
                            Order Ref: {order.reference_code}
                          </p>

                          <p className="mt-1 text-sm text-muted-foreground">
                            Room:{" "}
                            <span className="font-medium text-accent">
                              {order.reservation.rooms?.name ?? "Unknown Room"}
                            </span>
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            Reservation Ref: {order.reservation.reference_code}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <StatusBadge status={order.status} />
                          <StatusBadge status={order.payment_status} />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 p-4 sm:p-5">
                      <div>
                        <SectionHeading>Order Details</SectionHeading>

                        <div className="mt-3 rounded-lg border border-border bg-background/40 p-3 sm:p-4">
                          <ReceiptTable>
                            {items.map((item) => (
                              <ReceiptRow
                                key={item.id}
                                name={item.item_name_snapshot}
                                quantity={item.quantity}
                                amount={Number(item.line_total)}
                              />
                            ))}
                          </ReceiptTable>

                          <div className="mt-3 border-t border-border pt-3">
                            <SummaryRow label="Order subtotal" amount={subtotal} />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border bg-background/40 p-3 sm:p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold">Food Order Payment</p>
                          <StatusBadge status={order.payment_status} />
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Payment method</span>
                            <span className="font-medium">
                              {formatPaymentMethod(order.payment_method)}
                            </span>
                          </div>

                          <SummaryRow label="Amount due" amount={subtotal} />
                        </div>

                        {isPaid && (
                          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" />
                            Payment verified
                          </p>
                        )}

                        {!isPaid && !cancelled && (
                          <div className="mt-3">
                            {order.payment_method === "gcash" ? (
                              <PaymentProofForm
                                targetType="food_order"
                                targetId={order.id}
                                userId={user.id}
                                paymentStatus={order.payment_status}
                                roomPaymentStatus={order.reservation.payment_status}
                              />
                            ) : (
                              <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                                <Wallet className="h-4 w-4" />
                                {order.reservation.payment_status === "paid"
                                  ? "Pay at the venue"
                                  : "Room payment must be verified first"}
                              </div>
                            )}
                          </div>
                        )}

                        {cancelled && (
                          <p className="mt-3 text-xs text-destructive">
                            This food order was cancelled.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {!isLoading && activeTab === "receipts" && (
          <div className="space-y-4">
            {receiptsLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading receipts...</p>
            ) : sortedReceipts.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <Receipt className="h-6 w-6" />
                </div>

                <h3 className="mt-4 font-display font-semibold">
                  No final receipts available yet.
                </h3>

                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                  A final receipt appears after checkout once the room reservation and all
                  associated food orders are fully paid.
                </p>
              </div>
            ) : (
              sortedReceipts.map((receipt) => {
                const snapshot = receipt.receipt_snapshot ?? {};
                const reservation = snapshot.reservation ?? {};
                const isExpanded = expandedReceiptId === receipt.id;

                return (
                  <div
                    key={receipt.id}
                    className="overflow-hidden rounded-xl border border-border bg-card"
                  >
                    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <Receipt className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <p className="font-display font-bold">
                            {receipt.receipt_number || "Session Receipt"}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            Reservation: {reservation.reference_code ?? "—"}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            Issued{" "}
                            {receipt.issued_at
                              ? new Date(receipt.issued_at).toLocaleDateString()
                              : "—"}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                        <div className="sm:text-right">
                          <p className="text-xs text-muted-foreground">Total paid</p>
                          <p className="font-display text-lg font-bold tabular-nums text-accent">
                            {peso(Number(receipt.total_paid))}
                          </p>
                        </div>

                        <StatusBadge status="paid" />

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedReceiptId(isExpanded ? null : receipt.id)}
                        >
                          <Receipt className="mr-2 h-4 w-4" />
                          {isExpanded ? "Hide Receipt" : "View Receipt"}
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border bg-secondary/10 p-3 sm:p-5">
                        <FinalSessionReceipt receipt={receipt} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  message,
  hasFilters,
  onClear,
}: {
  message: string;
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center">
      <p className="text-muted-foreground">{message}</p>

      {hasFilters && (
        <Button variant="outline" className="mt-4" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

function PaymentProofForm({
  targetType,
  targetId,
  userId,
  paymentStatus,
  roomPaymentStatus,
}: {
  targetType: PaymentTarget;
  targetId: string;
  userId: string;
  paymentStatus: string;
  roomPaymentStatus?: string;
}) {
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payerName, setPayerName] = useState("");
  const [payerAccount, setPayerAccount] = useState("");
  const [reference, setReference] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  const proofQueryKey = ["payment-proofs", targetType, targetId];

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["public-payment-settings"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select(
          "ewallet_provider, ewallet_account_name, ewallet_account_number, ewallet_instructions",
        )
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      return data;
    },
  });

  const { data: proofs, isLoading: proofsLoading } = useQuery({
    queryKey: proofQueryKey,
    enabled: targetType !== "food_order" || roomPaymentStatus === "paid",
    queryFn: async () => {
      const query =
        targetType === "reservation"
          ? supabase.from("payment_proofs").select("id, status").eq("reservation_id", targetId)
          : supabase.from("payment_proofs").select("id, status").eq("food_order_id", targetId);

      const { data, error } = await query;

      if (error) throw error;

      return data ?? [];
    },
  });

  const hasPendingProof = (proofs ?? []).some((proof) => proof.status === "pending");
  const foodPaymentBlocked =
    targetType === "food_order" && roomPaymentStatus !== "paid";

  const submitPaymentProof = async () => {
    if (foodPaymentBlocked) {
      return void toast.error("Room payment must be verified before paying for food.");
    }

    if (paymentStatus === "paid") {
      return void toast.info("This transaction has already been paid.");
    }

    if (hasPendingProof) {
      return void toast.info("Your payment is already awaiting verification.");
    }

    if (payerName.trim().length < 2) {
      return void toast.error("Enter the GCash account name.");
    }

    if (!/^[0-9+ -]{7,20}$/.test(payerAccount.trim())) {
      return void toast.error("Enter a valid GCash account number.");
    }

    if (reference.trim().length < 4) {
      return void toast.error("Enter your GCash transaction reference.");
    }

    if (!proofFile) {
      return void toast.error("Please upload your payment screenshot.");
    }

    if (!ALLOWED_PROOF_TYPES.includes(proofFile.type)) {
      return void toast.error("Only JPG, PNG, and WEBP images are allowed.");
    }

    if (proofFile.size > MAX_PROOF_SIZE) {
      return void toast.error("Screenshot must not exceed 5 MB.");
    }

    setBusy(true);

    const extension =
      proofFile.type === "image/png" ? "png" : proofFile.type === "image/webp" ? "webp" : "jpg";

    const uploadId = crypto.randomUUID();
    const storagePath = `${userId}/${targetType}/${targetId}/${uploadId}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(storagePath, proofFile, {
        contentType: proofFile.type,
        upsert: false,
      });

    if (uploadError) {
      setBusy(false);
      return void toast.error(errMsg(uploadError));
    }

    const { error: submitError } = await supabase.rpc("submit_payment_proof", {
      _target_type: targetType,
      _target_id: targetId,
      _storage_path: storagePath,
      _payment_reference: reference.trim(),
      _payer_name: payerName.trim(),
      _payer_account_number: payerAccount.trim(),
    });

    if (submitError) {
      await supabase.storage.from("payment-proofs").remove([storagePath]);

      setBusy(false);
      return void toast.error(errMsg(submitError));
    }

    setBusy(false);
    setOpen(false);
    setProofFile(null);
    setReference("");
    setPayerName("");
    setPayerAccount("");

    toast.success("Payment proof submitted. Awaiting SONARA verification.");

    qc.invalidateQueries({ queryKey: ["my-bookings"] });
    qc.invalidateQueries({ queryKey: proofQueryKey });
  };

  if (paymentStatus === "paid") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" />
        Paid
      </div>
    );
  }

  if (foodPaymentBlocked) {
    return (
      <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-700 dark:text-amber-300">
        Room payment must be verified before paying for food.
      </div>
    );
  }

  if (proofsLoading) {
    return (
      <Button variant="outline" className="w-full" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Checking payment...
      </Button>
    );
  }

  if (hasPendingProof) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400">
        <Clock className="h-4 w-4" />
        Awaiting Verification
      </div>
    );
  }

  return (
    <>
      <Button variant="glow" className="w-full" onClick={() => setOpen(true)}>
        <CreditCard className="mr-2 h-4 w-4" />
        Pay Now
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="my-auto w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">Pay with GCash</h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Send your payment to SONARA, then submit your transaction details and screenshot.
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label="Close payment dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-border bg-secondary/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  SONARA GCash Details
                </p>

                {settingsLoading ? (
                  <p className="mt-3 text-sm text-muted-foreground">Loading payment details...</p>
                ) : settings ? (
                  <div className="mt-3 space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Payment provider</p>
                      <p className="font-semibold">{settings.ewallet_provider || "GCash"}</p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">Account name</p>
                      <p className="font-semibold">
                        {settings.ewallet_account_name || "Not configured"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">Account number</p>
                      <p className="font-semibold tabular-nums">
                        {settings.ewallet_account_number || "Not configured"}
                      </p>
                    </div>

                    {settings.ewallet_instructions && (
                      <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                        {settings.ewallet_instructions}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-destructive">
                    Unable to load GCash account details.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">GCash account name</label>

                  <Input
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    placeholder="Name used to send payment"
                    disabled={busy}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">GCash account number</label>

                  <Input
                    value={payerAccount}
                    onChange={(e) => setPayerAccount(e.target.value)}
                    placeholder="09XXXXXXXXX"
                    disabled={busy}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    GCash transaction reference
                  </label>

                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Enter transaction reference"
                    disabled={busy}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Payment screenshot</label>

                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background/50 px-4 py-6 text-center transition hover:border-primary">
                    <Upload className="mb-2 h-6 w-6 text-muted-foreground" />

                    <span className="text-sm font-medium">
                      {proofFile ? proofFile.name : "Choose payment screenshot"}
                    </span>

                    <span className="mt-1 text-xs text-muted-foreground">
                      JPG, PNG, or WEBP · Maximum 5 MB
                    </span>

                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setProofFile(file);
                      }}
                    />
                  </label>

                  {proofFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1 text-muted-foreground"
                      onClick={() => setProofFile(null)}
                      disabled={busy}
                    >
                      <X className="mr-1 h-3 w-3" />
                      Remove screenshot
                    </Button>
                  )}
                </div>
              </div>

              <p className="rounded-md bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                Your transaction will remain unpaid after submitting this form. SONARA must verify
                your payment before your payment status is updated.
              </p>

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                >
                  Close
                </Button>

                <Button
                  variant="glow"
                  className="flex-1"
                  onClick={submitPaymentProof}
                  disabled={busy || settingsLoading || !settings}
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Payment Proof"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type SessionReceipt = {
  id: string;
  receipt_number: string;
  reservation_id: string;
  room_subtotal: number;
  food_subtotal: number;
  grand_total: number;
  total_paid: number;
  payment_breakdown: any;
  receipt_snapshot: any;
  issued_at: string;
};

function FinalSessionReceipt({ receipt }: { receipt?: SessionReceipt }) {
  const [exporting, setExporting] = useState(false);

  if (!receipt) return null;

  const snapshot = receipt.receipt_snapshot ?? {};
  const reservation = snapshot.reservation ?? {};
  const room = reservation.room ?? {};
  const foodOrders = snapshot.food_orders ?? [];

  const handleExport = async () => {
    if (exporting) return;

    setExporting(true);

    toast.loading("Generating your PDF...", {
      id: "receipt-pdf",
    });

    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const margin = 18;
      const contentWidth = pageWidth - margin * 2;
      const rightEdge = pageWidth - margin;

      let y = 20;

      const colors = {
        dark: [25, 30, 28] as [number, number, number],
        muted: [110, 116, 113] as [number, number, number],
        accent: [68, 105, 77] as [number, number, number],
        border: [220, 224, 220] as [number, number, number],
        light: [244, 247, 244] as [number, number, number],
        success: [35, 125, 77] as [number, number, number],
      };

      const formatAmount = (amount: number) =>
        `PHP ${Number(amount || 0).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

      const addPageIfNeeded = (requiredHeight: number) => {
        if (y + requiredHeight > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
      };

      const addText = (
        value: string,
        x: number,
        positionY: number,
        options?: {
          size?: number;
          bold?: boolean;
          color?: [number, number, number];
          align?: "left" | "center" | "right";
        },
      ) => {
        pdf.setFont("helvetica", options?.bold ? "bold" : "normal");
        pdf.setFontSize(options?.size ?? 10);
        pdf.setTextColor(...(options?.color ?? colors.dark));
        pdf.text(value, x, positionY, {
          align: options?.align ?? "left",
        });
      };

      const addLine = (positionY: number) => {
        pdf.setDrawColor(...colors.border);
        pdf.setLineWidth(0.3);
        pdf.line(margin, positionY, rightEdge, positionY);
      };

      const addWrappedText = (
        value: string,
        x: number,
        positionY: number,
        maxWidth: number,
        options?: {
          size?: number;
          bold?: boolean;
          color?: [number, number, number];
        },
      ) => {
        pdf.setFont("helvetica", options?.bold ? "bold" : "normal");
        pdf.setFontSize(options?.size ?? 9);
        pdf.setTextColor(...(options?.color ?? colors.dark));

        const lines = pdf.splitTextToSize(value, maxWidth) as string[];
        pdf.text(lines, x, positionY);

        return lines.length * ((options?.size ?? 9) * 0.45);
      };

      const addSectionTitle = (title: string) => {
        addPageIfNeeded(12);
        y += 5;
        addText(title.toUpperCase(), margin, y, {
          size: 9,
          bold: true,
          color: colors.accent,
        });
        y += 5;
      };

      const addDetail = (label: string, value: string, x: number, positionY: number) => {
        addText(label, x, positionY, {
          size: 8,
          color: colors.muted,
        });

        addText(value || "—", x, positionY + 5, {
          size: 9,
          bold: true,
        });
      };

      pdf.setFillColor(...colors.dark);
      pdf.roundedRect(margin, y, contentWidth, 31, 2, 2, "F");

      addText("SONARA", margin + 8, y + 11, {
        size: 19,
        bold: true,
        color: [255, 255, 255],
      });

      addText("PRIVATE KARAOKE LOUNGE", margin + 8, y + 17, {
        size: 7,
        color: [220, 230, 220],
      });

      addText("Where Voices Come Together.", margin + 8, y + 23, {
        size: 8,
        color: [220, 230, 220],
      });

      addText("OFFICIAL RECEIPT", rightEdge - 8, y + 11, {
        size: 9,
        bold: true,
        color: [255, 255, 255],
        align: "right",
      });

      addText("FULLY PAID", rightEdge - 8, y + 18, {
        size: 8,
        bold: true,
        color: [160, 230, 180],
        align: "right",
      });

      y += 40;

      addText("SESSION RECEIPT", margin, y, {
        size: 13,
        bold: true,
      });

      y += 7;

      addText(receipt.receipt_number || "Session Receipt", margin, y, {
        size: 10,
        bold: true,
        color: colors.accent,
      });

      addText(
        `Issued: ${receipt.issued_at ? new Date(receipt.issued_at).toLocaleString("en-PH") : "—"}`,
        rightEdge,
        y,
        {
          size: 8,
          color: colors.muted,
          align: "right",
        },
      );

      y += 5;
      addLine(y);
      y += 7;

      addSectionTitle("Reservation Details");

      const colWidth = contentWidth / 2;

      addDetail("Room", room.name ?? "Karaoke Room", margin, y);
      addDetail("Room Number", String(room.room_number ?? "—"), margin + colWidth, y);

      y += 16;

      addDetail(
        "Booking Date",
        reservation.booking_date ? fmtDate(reservation.booking_date) : "—",
        margin,
        y,
      );

      addDetail("Guests", String(reservation.guest_count ?? "—"), margin + colWidth, y);

      y += 16;

      addDetail("Reservation Reference", reservation.reference_code ?? "—", margin, y);

      y += 13;
      addLine(y);

      addSectionTitle("Itemized Charges");

      const itemColumn = margin;
      const quantityColumn = margin + contentWidth * 0.69;
      const amountColumn = rightEdge;

      const drawTableHeader = () => {
        pdf.setFillColor(...colors.light);
        pdf.rect(margin, y - 4, contentWidth, 9, "F");

        addText("ITEM", itemColumn + 2, y + 2, {
          size: 8,
          bold: true,
          color: colors.muted,
        });

        addText("QTY", quantityColumn, y + 2, {
          size: 8,
          bold: true,
          color: colors.muted,
          align: "center",
        });

        addText("AMOUNT", amountColumn - 2, y + 2, {
          size: 8,
          bold: true,
          color: colors.muted,
          align: "right",
        });

        y += 10;
      };

      const drawItem = (name: string, quantity: number, amount: number) => {
        const itemLines = pdf.splitTextToSize(name || "Item", contentWidth * 0.62) as string[];
        const rowHeight = Math.max(8, itemLines.length * 4.5 + 3);

        addPageIfNeeded(rowHeight + 4);

        if (y === margin) {
          drawTableHeader();
        }

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.setTextColor(...colors.dark);
        pdf.text(itemLines, itemColumn + 2, y + 2);

        addText(String(quantity), quantityColumn, y + 2, {
          size: 8.5,
          align: "center",
        });

        addText(formatAmount(amount), amountColumn - 2, y + 2, {
          size: 8.5,
          align: "right",
        });

        y += rowHeight;
        addLine(y);
        y += 2;
      };

      drawTableHeader();

      drawItem(`Room Charge (${room.room_number ?? "Room"})`, 1, Number(receipt.room_subtotal));

      foodOrders.forEach((order: any) => {
        (order.items ?? []).forEach((item: any) => {
          drawItem(
            String(item.item_name ?? "Food item"),
            Number(item.quantity ?? 0),
            Number(item.line_total ?? 0),
          );
        });
      });

      addPageIfNeeded(45);

      y += 5;

      const addTotalRow = (
        label: string,
        amount: number,
        options?: {
          bold?: boolean;
          color?: [number, number, number];
          size?: number;
        },
      ) => {
        addText(label, margin, y, {
          size: options?.size ?? 9,
          bold: options?.bold,
          color: options?.color ?? colors.muted,
        });

        addText(formatAmount(amount), rightEdge, y, {
          size: options?.size ?? 9,
          bold: options?.bold,
          color: options?.color ?? colors.dark,
          align: "right",
        });

        y += 7;
      };

      addTotalRow("Room Subtotal", Number(receipt.room_subtotal));
      addTotalRow("Food & Drinks", Number(receipt.food_subtotal));

      addLine(y);
      y += 7;

      addTotalRow("GRAND TOTAL", Number(receipt.grand_total), {
        bold: true,
        color: colors.dark,
        size: 11,
      });

      addTotalRow("TOTAL PAID", Number(receipt.total_paid), {
        bold: true,
        color: colors.success,
        size: 10,
      });

      const paymentBreakdown = receipt.payment_breakdown;

      if (paymentBreakdown) {
        const payments = Array.isArray(paymentBreakdown)
          ? paymentBreakdown
          : typeof paymentBreakdown === "object"
            ? Object.entries(paymentBreakdown).map(([method, amount]) => ({
                method,
                amount,
              }))
            : [];

        if (payments.length > 0) {
          addPageIfNeeded(18 + payments.length * 7);
          y += 3;

          addSectionTitle("Payment Breakdown");

          payments.forEach((payment: any) => {
            const method = String(payment.method ?? payment.payment_method ?? "Payment");
            const amount = Number(payment.amount ?? payment.total ?? payment.paid_amount ?? 0);

            addTotalRow(formatPaymentMethod(method.toLowerCase()), amount);
          });
        }
      }

      addPageIfNeeded(27);

      y += 8;

      pdf.setFillColor(...colors.light);
      pdf.roundedRect(margin, y, contentWidth, 19, 2, 2, "F");

      addText("PAYMENT VERIFIED — FULLY PAID", pageWidth / 2, y + 7, {
        size: 9,
        bold: true,
        color: colors.success,
        align: "center",
      });

      addText("Thank you for choosing SONARA.", pageWidth / 2, y + 13, {
        size: 8,
        color: colors.muted,
        align: "center",
      });

      y += 25;

      addText("This is a system-generated electronic receipt.", pageWidth / 2, y, {
        size: 7,
        color: colors.muted,
        align: "center",
      });

      const pageCount = pdf.getNumberOfPages();

      for (let page = 1; page <= pageCount; page++) {
        pdf.setPage(page);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(...colors.muted);

        pdf.text(
          `SONARA | ${receipt.receipt_number || "Session Receipt"} | Page ${page} of ${pageCount}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: "center" },
        );
      }

      const safeReceiptNumber = (receipt.receipt_number || "session-receipt").replace(
        /[^a-zA-Z0-9-_]/g,
        "-",
      );

      pdf.save(`SONARA-${safeReceiptNumber}.pdf`);

      toast.success("Receipt PDF downloaded successfully.", {
        id: "receipt-pdf",
      });
    } catch (error) {
      console.error("PDF export failed:", error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      toast.error(`PDF export failed: ${errorMessage}`, {
        id: "receipt-pdf",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-500/20 p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Receipt className="h-5 w-5" />
          </div>

          <div>
            <p className="font-display font-bold">Final E-Receipt</p>
            <p className="text-xs text-muted-foreground">Official session receipt</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status="paid" />

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export PDF
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            SONARA · Private Karaoke Lounge
          </p>

          <p className="mt-2 font-display text-xl font-bold">
            {receipt.receipt_number || "Session Receipt"}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Issued {receipt.issued_at ? new Date(receipt.issued_at).toLocaleString() : "—"}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-background/60 p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reservation
          </p>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Room</p>
              <p className="mt-1 font-semibold text-accent">{room.name ?? "Karaoke Room"}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Room number</p>
              <p className="mt-1 font-medium">{room.room_number ?? "—"}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Booking date</p>
              <p className="mt-1 font-medium">
                {reservation.booking_date ? fmtDate(reservation.booking_date) : "—"}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Guests</p>
              <p className="mt-1 font-medium">{reservation.guest_count ?? "—"}</p>
            </div>

            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Reservation ref</p>
              <p className="mt-1 font-medium">{reservation.reference_code ?? "—"}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Itemized Charges
          </p>

          <ReceiptTable>
            <ReceiptRow
              name={`Room Charge (${room.room_number ?? "Room"})`}
              quantity={1}
              amount={Number(receipt.room_subtotal)}
            />

            {foodOrders.flatMap((order: any) =>
              (order.items ?? []).map((item: any, index: number) => (
                <ReceiptRow
                  key={`${order.id}-${index}`}
                  name={item.item_name}
                  quantity={Number(item.quantity)}
                  amount={Number(item.line_total)}
                />
              )),
            )}
          </ReceiptTable>
        </div>

        <div className="space-y-2 border-t border-border pt-3 text-sm">
          <SummaryRow label="Room subtotal" amount={Number(receipt.room_subtotal)} />
          <SummaryRow label="Food & drinks" amount={Number(receipt.food_subtotal)} />

          <div className="flex items-center justify-between border-t border-border pt-3 text-base font-bold">
            <span>Grand Total</span>
            <span className="text-accent">{peso(Number(receipt.grand_total))}</span>
          </div>

          <div className="flex items-center justify-between text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <span>Total Paid</span>
            <span>{peso(Number(receipt.total_paid))}</span>
          </div>
        </div>

        <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="mr-1 inline h-4 w-4" />
            Fully paid
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Thank you for choosing SONARA. Where Voices Come Together.
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-accent">
      {children}
    </h3>
  );
}

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
    { label: "Room", value: roomName ?? "Unknown Room" },
    { label: "Room number", value: roomNumber ?? "—" },
    { label: "Booking date", value: date },
    { label: "Time", value: time },
    { label: "Guests", value: `${guests} guests` },
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

function SummaryRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{peso(amount)}</span>
    </div>
  );
}

function formatPaymentMethod(method: string | null) {
  if (method === "gcash") return "GCash";
  if (method === "cash") return "Cash";
  return "Not specified";
}

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
        <SectionHeading>Order Food & Drinks</SectionHeading>

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
              {cart.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    {item.quantity}× {item.name}
                  </span>

                  <span className="shrink-0 tabular-nums">{peso(item.price * item.quantity)}</span>
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