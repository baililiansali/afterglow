import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Filter,
  Eye,
  Pencil,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  Wallet,
  Music,
  Utensils,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/Pagination";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";
import { errMsg, fmtDate, peso } from "@/lib/afterglow";

import { useProfiles, type ResRow, type OrderRow } from "./shared";

type PaymentTab = "room" | "food";
type PaymentStatus = "all" | "paid" | "unpaid";
type PaymentMethod = "all" | "cash" | "gcash";
type ViewMode = "grid" | "list";

type FoodPaymentItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type TransactionRecord = {
  id: string;
  type: PaymentTab;
  reference: string;
  customer: string;
  email: string;
  phone: string;
  room: string;
  roomNumber: string;
  date: string;
  dateValue: string;
  amount: number;
  paymentStatus: "paid" | "unpaid";
  paymentMethod: "cash" | "gcash";
  payerName: string;
  payerAccount: string;
  paymentReference: string;
  reservationReference: string;
  recordStatus: string;
  foodItems: FoodPaymentItem[];
};

type PaymentsProps = {
  res: ResRow[];
  orders: OrderRow[];
  paymentTargetOrderId?: string | null;
  onPaymentTargetHandled?: () => void;
  paymentTargetReservationId?: string | null;
  onReservationPaymentTargetHandled?: () => void;
};

export function Payments({
  res,
  orders,
  paymentTargetOrderId,
  onPaymentTargetHandled,
  paymentTargetReservationId,
  onReservationPaymentTargetHandled,
}: PaymentsProps) {
  const qc = useQueryClient();
  const { data: profiles = {} } = useProfiles();

  const [activeTab, setActiveTab] = useState<PaymentTab>("room");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [status, setStatus] = useState<PaymentStatus>("all");
  const [method, setMethod] = useState<PaymentMethod>("all");

  const [draftStatus, setDraftStatus] = useState<PaymentStatus>("all");
  const [draftMethod, setDraftMethod] = useState<PaymentMethod>("all");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRecord | null>(null);

  const [editingTransaction, setEditingTransaction] = useState<TransactionRecord | null>(null);

  const [editStatus, setEditStatus] = useState<"paid" | "unpaid">("unpaid");
  const [editMethod, setEditMethod] = useState<"cash" | "gcash">("cash");

  const [saving, setSaving] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  const [focusedReservationId, setFocusedReservationId] = useState<string | null>(null);

  // Exclude rejected and cancelled reservations.
  const validReservations = res.filter((r) => !["rejected", "cancelled"].includes(r.status));

  // Exclude cancelled food orders.
  const validOrders = orders.filter((o) => o.status !== "cancelled");

  // Normalize payment status.
  const getPaymentStatus = (
    paymentMethod: string | null | undefined,
    paymentStatus: string | null | undefined,
  ): "paid" | "unpaid" => {
    if (paymentMethod === "gcash") return "paid";
    return paymentStatus === "paid" ? "paid" : "unpaid";
  };

  // Normalize payment method.
  const getPaymentMethod = (paymentMethod: string | null | undefined): "cash" | "gcash" => {
    return paymentMethod === "gcash" ? "gcash" : "cash";
  };

  // Revenue calculations.
  const roomRevenue = validReservations
    .filter((r) => getPaymentStatus(r.payment_method, r.payment_status) === "paid")
    .reduce((total, r) => total + Number(r.room_total ?? 0), 0);

  const foodRevenue = validOrders
    .filter((o) => getPaymentStatus(o.payment_method, o.payment_status) === "paid")
    .reduce((total, o) => total + Number(o.food_subtotal ?? 0), 0);

  const totalRevenue = roomRevenue + foodRevenue;

  const normalizedSearch = search.trim().toLowerCase();

  // Room transactions.
  const roomTransactions: TransactionRecord[] = validReservations.map((r) => {
    const profile = profiles[r.user_id];

    return {
      id: r.id,
      type: "room",
      reference: r.reference_code,
      customer: profile?.full_name ?? "Guest",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      room: r.rooms?.name ?? "Room",
      roomNumber: r.rooms?.room_number ?? "",
      date: fmtDate(r.booking_date),
      dateValue: String(r.booking_date ?? "").slice(0, 10),
      amount: Number(r.room_total ?? 0),
      paymentStatus: getPaymentStatus(r.payment_method, r.payment_status),
      paymentMethod: getPaymentMethod(r.payment_method),
      payerName: r.payer_name ?? "",
      payerAccount: r.payer_account_number ?? "",
      paymentReference: r.payment_reference ?? "",
      reservationReference: r.reference_code,
      recordStatus: r.status,
      foodItems: [],
    };
  });

  // Food transactions.
  const foodTransactions: TransactionRecord[] = validOrders.map((o) => ({
    id: o.id,
    type: "food",
    reference: o.reference_code,
    customer: o.profiles?.full_name ?? "Guest",
    email: o.profiles?.email ?? "",
    phone: o.profiles?.phone ?? "",
    room: o.reservations?.rooms?.name ?? "Room",
    roomNumber: o.reservations?.rooms?.room_number ?? "",
    date: new Date(o.submitted_at).toLocaleString("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    dateValue: new Date(o.submitted_at).toLocaleDateString("en-CA"),
    amount: Number(o.food_subtotal ?? 0),
    paymentStatus: getPaymentStatus(o.payment_method, o.payment_status),
    paymentMethod: getPaymentMethod(o.payment_method),
    payerName: o.payer_name ?? "",
    payerAccount: o.payer_account_number ?? "",
    paymentReference: o.payment_reference ?? "",
    reservationReference: o.reservations?.reference_code ?? "",
    recordStatus: o.status,
    foodItems: (o.food_order_items ?? []).map((item) => ({
      id: item.id,
      name: item.item_name_snapshot ?? "Food item",
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price_snapshot),
      lineTotal: Number(item.line_total),
    })),
  }));

  // Navigate to a specific food transaction.
  useEffect(() => {
    if (!paymentTargetOrderId) return;

    const targetOrder = validOrders.find((order) => order.id === paymentTargetOrderId);

    if (!targetOrder) return;

    setActiveTab("food");
    setViewMode("list");
    setFocusedOrderId(paymentTargetOrderId);
    setFocusedReservationId(null);

    setStatus("all");
    setMethod("all");
    setDraftStatus("all");
    setDraftMethod("all");
    setFromDate("");
    setToDate("");
    setSearch("");
    setCurrentPage(1);
    setSelectedTransaction(null);

    onPaymentTargetHandled?.();
  }, [paymentTargetOrderId, orders]);

  // Navigate to a specific room reservation payment.
  useEffect(() => {
    if (!paymentTargetReservationId) return;

    const targetReservation = validReservations.find(
      (reservation) => reservation.id === paymentTargetReservationId,
    );

    if (!targetReservation) return;

    setActiveTab("room");
    setViewMode("list");
    setFocusedReservationId(paymentTargetReservationId);
    setFocusedOrderId(null);

    setStatus("all");
    setMethod("all");
    setDraftStatus("all");
    setDraftMethod("all");
    setFromDate("");
    setToDate("");
    setSearch("");
    setCurrentPage(1);
    setSelectedTransaction(null);

    onReservationPaymentTargetHandled?.();
  }, [paymentTargetReservationId, res]);

  // Current transactions based on selected tab.
  const currentTransactions = activeTab === "room" ? roomTransactions : foodTransactions;

  // Search and filter transactions.
  const filteredTransactions = currentTransactions.filter((t) => {
    const matchesFocusedOrder =
      !focusedOrderId || (activeTab === "food" && t.id === focusedOrderId);

    const matchesFocusedReservation =
      !focusedReservationId || (activeTab === "room" && t.id === focusedReservationId);

    const matchesStatus = status === "all" || t.paymentStatus === status;
    const matchesMethod = method === "all" || t.paymentMethod === method;

    const matchesFromDate = !fromDate || t.dateValue >= fromDate;
    const matchesToDate = !toDate || t.dateValue <= toDate;

    const searchableValues = [
      t.reference,
      t.id,
      t.customer,
      t.email,
      t.phone,
      t.room,
      t.roomNumber,
      t.reservationReference,
    ];

    const matchesSearch =
      !normalizedSearch ||
      searchableValues.some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(normalizedSearch),
      );

    return (
      matchesFocusedOrder &&
      matchesFocusedReservation &&
      matchesStatus &&
      matchesMethod &&
      matchesFromDate &&
      matchesToDate &&
      matchesSearch
    );
  });

  // Pagination.
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));

  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Change payment tab.
  const changeTab = (tab: PaymentTab) => {
    setActiveTab(tab);
    setFocusedOrderId(null);
    setFocusedReservationId(null);

    setStatus("all");
    setMethod("all");
    setDraftStatus("all");
    setDraftMethod("all");
    setFromDate("");
    setToDate("");
    setSearch("");
    setCurrentPage(1);
  };

  const showAllFoodTransactions = () => {
    setFocusedOrderId(null);
    setStatus("all");
    setMethod("all");
    setDraftStatus("all");
    setDraftMethod("all");
    setFromDate("");
    setToDate("");
    setSearch("");
    setCurrentPage(1);
  };

  const showAllRoomTransactions = () => {
    setFocusedReservationId(null);
    setStatus("all");
    setMethod("all");
    setDraftStatus("all");
    setDraftMethod("all");
    setFromDate("");
    setToDate("");
    setSearch("");
    setCurrentPage(1);
  };

  // Open filters.
  const openFilters = () => {
    setDraftStatus(status);
    setDraftMethod(method);
    setFilterOpen(true);
  };

  // Apply filters.
  const applyFilters = () => {
    setStatus(draftStatus);
    setMethod(draftMethod);
    setCurrentPage(1);
    setFilterOpen(false);
  };

  // Clear filters.
  const clearFilters = () => {
    setStatus("all");
    setMethod("all");
    setDraftStatus("all");
    setDraftMethod("all");
    setFromDate("");
    setToDate("");
    setCurrentPage(1);
  };

  // Open edit payment dialog.
  const openEdit = (transaction: TransactionRecord) => {
    setEditingTransaction(transaction);
    setEditMethod(transaction.paymentMethod);
    setEditStatus(transaction.paymentMethod === "gcash" ? "paid" : transaction.paymentStatus);
  };

  // Save payment changes.
  const savePayment = async () => {
    if (!editingTransaction) return;

    setSaving(true);

    try {
      const table = editingTransaction.type === "room" ? "reservations" : "food_orders";

      const finalStatus = editMethod === "gcash" ? "paid" : editStatus;

      const { data, error } = await supabase
        .from(table)
        .update({
          payment_status: finalStatus,
          payment_method: editMethod,
        })
        .eq("id", editingTransaction.id)
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error("Payment details were not updated.");
      }

      toast.success("Payment details updated successfully.");
      setEditingTransaction(null);

      await qc.invalidateQueries({ queryKey: ["admin-res"] });
      await qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setSaving(false);
    }
  };

  // Mark transaction as paid.
  const markAsPaid = async (transaction: TransactionRecord) => {
    setMarkingPaidId(transaction.id);

    try {
      const table = transaction.type === "room" ? "reservations" : "food_orders";

      const { data, error } = await supabase
        .from(table)
        .update({ payment_status: "paid" })
        .eq("id", transaction.id)
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error("Payment status was not updated.");
      }

      toast.success("Payment marked as paid.");

      await qc.invalidateQueries({ queryKey: ["admin-res"] });
      await qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setMarkingPaidId(null);
    }
  };

  const hasActiveFilters = status !== "all" || method !== "all" || !!fromDate || !!toDate;

  const activeFilterCount =
    (status !== "all" ? 1 : 0) + (method !== "all" ? 1 : 0) + (fromDate ? 1 : 0) + (toDate ? 1 : 0);

  // Payment method badge.
  const PaymentMethodBadge = ({ paymentMethod }: { paymentMethod: "cash" | "gcash" }) => (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${
        paymentMethod === "gcash"
          ? "bg-primary/10 text-primary"
          : "bg-secondary text-muted-foreground"
      }`}
    >
      {paymentMethod === "gcash" ? "GCash" : "Cash"}
    </span>
  );

  // Paid status badge.
  const PaymentStatusBadge = ({ paymentStatus }: { paymentStatus: "paid" | "unpaid" }) =>
    paymentStatus === "paid" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600">
        Paid
      </span>
    ) : null;

  // Grid payment display.
  const GridPaymentDisplay = ({ transaction }: { transaction: TransactionRecord }) => {
    const isUpdating = markingPaidId === transaction.id;

    if (transaction.paymentStatus === "paid") {
      return <PaymentStatusBadge paymentStatus="paid" />;
    }

    return (
      <Button
        type="button"
        size="sm"
        className="ml-auto h-8 shrink-0 gap-1.5 px-3 text-xs"
        disabled={isUpdating}
        onClick={() => void markAsPaid(transaction)}
      >
        {isUpdating && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
        {isUpdating ? "Updating..." : "Mark Paid"}
      </Button>
    );
  };

  // Grid actions.
  const GridTransactionActions = ({ transaction }: { transaction: TransactionRecord }) => (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setSelectedTransaction(transaction)}
      >
        <Eye className="mr-1.5 h-4 w-4" />
        Details
      </Button>

      <Button type="button" size="sm" variant="outline" onClick={() => openEdit(transaction)}>
        <Pencil className="mr-1.5 h-4 w-4" />
        Edit
      </Button>
    </div>
  );

  // List actions.
  const ListTransactionActions = ({ transaction }: { transaction: TransactionRecord }) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => openEdit(transaction)}
        title="Edit payment"
        aria-label="Edit payment"
        className="text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <Pencil className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => setSelectedTransaction(transaction)}
        title="View details"
        aria-label="View transaction details"
        className="text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <Eye className="h-4 w-4" />
      </Button>
    </div>
  );

  // Grid transaction card.
  const renderGridCard = (t: TransactionRecord) => (
    <div
      key={t.id}
      className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{t.reference}</p>
          <p className="mt-1 truncate text-sm text-muted-foreground">{t.customer}</p>
        </div>

        <GridPaymentDisplay transaction={t} />
      </div>

      <div className="my-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Room</p>
          <p className="mt-1 font-medium">
            {t.room}
            {t.roomNumber ? ` (${t.roomNumber})` : ""}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Phone Number</p>
          <p className="mt-1 font-medium">{t.phone || "—"}</p>
        </div>

        <div className="col-span-2">
          <p className="text-xs text-muted-foreground">Email</p>
          <p className="mt-1 break-all font-medium">{t.email || "—"}</p>
        </div>

        {t.type === "food" && t.foodItems.length > 0 && (
          <div className="col-span-2 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <Utensils className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground">Food Ordered</p>
            </div>

            <div className="mt-3 space-y-3">
              {t.foodItems.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{item.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.quantity} × {peso(item.unitPrice)}
                    </p>
                  </div>

                  <p className="shrink-0 font-medium">{peso(item.lineTotal)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs text-muted-foreground">
            {t.type === "room" ? "Reservation Date" : "Order Submitted"}
          </p>
          <p className="mt-1 font-medium">{t.date || "—"}</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Payment Method</p>
          <div className="mt-1">
            <PaymentMethodBadge paymentMethod={t.paymentMethod} />
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Total Amount</p>
          <p className="mt-1 font-semibold">{peso(t.amount)}</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Transaction Type</p>
          <p className="mt-1 font-medium">
            {t.type === "room" ? "Room Reservation" : "Food Order"}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <GridTransactionActions transaction={t} />
      </div>
    </div>
  );

  // Table transaction row.
  const renderTableRow = (t: TransactionRecord) => (
    <tr
      key={t.id}
      className={`border-t border-border transition-colors hover:bg-secondary/30 ${
        focusedOrderId === t.id || focusedReservationId === t.id ? "bg-primary/5" : ""
      }`}
    >
      <td className="p-3">
        <p className="font-semibold">{t.reference}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.type === "room" ? "Room Reservation" : "Food Order"}
        </p>
      </td>

      <td className="p-3">
        <p className="font-medium">{t.customer}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t.email || "No email"}</p>
      </td>

      <td className="p-3">
        <p className="font-medium">{t.room}</p>
        {t.roomNumber && <p className="mt-1 text-xs text-muted-foreground">Room {t.roomNumber}</p>}
      </td>

      <td className="p-3">
        <p className="font-semibold tabular-nums">{peso(t.amount)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t.date}</p>
      </td>

      <td className="p-3">
        <span className="text-sm font-medium">
          {t.paymentMethod === "gcash" ? "GCash" : "Cash"}
        </span>
      </td>

      <td className="p-3">
        <ListTransactionActions transaction={t} />
      </td>

      <td className="p-3">
        {t.paymentStatus === "paid" ? (
          <PaymentStatusBadge paymentStatus="paid" />
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => void markAsPaid(t)}
            disabled={markingPaidId === t.id}
          >
            {markingPaidId === t.id && <RefreshCw className="h-4 w-4 animate-spin" />}
            <span className="ml-2">{markingPaidId === t.id ? "Saving..." : "Mark Paid"}</span>
          </Button>
        )}
      </td>
    </tr>
  );

  return (
    <div className="mt-4 space-y-5 text-foreground">
      {/* PAGE HEADER */}
      <div>
        <h1 className="font-display text-xl font-bold">Transactions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor and manage room reservation and food order payments.
        </p>
      </div>

      {/* REVENUE SUMMARY */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <RevenueCard
          label="Total Collected"
          value={totalRevenue}
          description="Room and food payments"
          icon={<Wallet className="h-5 w-5" />}
          accent="primary"
        />

        <RevenueCard
          label="Room Revenue"
          value={roomRevenue}
          description="Collected reservation payments"
          icon={<Music className="h-5 w-5" />}
          accent="accent"
        />

        <RevenueCard
          label="Food Revenue"
          value={foodRevenue}
          description="Collected food order payments"
          icon={<Utensils className="h-5 w-5" />}
          accent="chart"
        />
      </div>

      {/* MAIN TABS */}
      <div>
        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          <Button
            type="button"
            variant={activeTab === "room" ? "default" : "outline"}
            onClick={() => changeTab("room")}
          >
            <Music className="mr-2 h-4 w-4" />
            Room Payments
          </Button>

          <Button
            type="button"
            variant={activeTab === "food" ? "default" : "outline"}
            onClick={() => changeTab("food")}
          >
            <Utensils className="mr-2 h-4 w-4" />
            Food Payments
          </Button>
        </div>
      </div>

      {/* TRANSACTIONS */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {focusedReservationId && activeTab === "room" ? (
            <Button type="button" variant="outline" size="sm" onClick={showAllRoomTransactions}>
              Show All Room Transactions
            </Button>
          ) : focusedOrderId && activeTab === "food" ? (
            <Button type="button" variant="outline" size="sm" onClick={showAllFoodTransactions}>
              Show All Food Transactions
            </Button>
          ) : null}
        </div>

        {/* TOOLBAR */}
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-end">
            {/* SEARCH */}
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={
                  activeTab === "room"
                    ? "Search reservation or customer..."
                    : "Search order, reservation or customer..."
                }
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-10 w-full pl-9"
              />
            </div>

            {/* DATE RANGE */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
              <div className="min-w-0 space-y-1 sm:w-[150px]">
                <Label htmlFor="payment-from-date" className="text-xs text-muted-foreground">
                  From date
                </Label>
                <Input
                  id="payment-from-date"
                  type="date"
                  className="h-10 w-full [color-scheme:dark]"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(event) => {
                    setFromDate(event.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>

              <div className="min-w-0 space-y-1 sm:w-[150px]">
                <Label htmlFor="payment-to-date" className="text-xs text-muted-foreground">
                  To date
                </Label>
                <Input
                  id="payment-to-date"
                  type="date"
                  className="h-10 w-full [color-scheme:dark]"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(event) => {
                    setToDate(event.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>

            {/* FILTER AND CLEAR DATE */}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" className="h-10" onClick={openFilters}>
                <Filter className="mr-2 h-4 w-4" />
                Filter
                {hasActiveFilters && (
                  <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>

              {(fromDate || toDate) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 whitespace-nowrap text-muted-foreground hover:bg-secondary hover:text-foreground"
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                    setCurrentPage(1);
                  }}
                >
                  Clear dates
                </Button>
              )}
            </div>

            {/* GRID / LIST TOGGLE */}
            <div className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-border bg-secondary/40 p-1">
              <Button
                type="button"
                size="sm"
                className="h-8"
                variant={viewMode === "grid" ? "default" : "ghost"}
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="mr-1.5 h-4 w-4" />
                Grid
              </Button>

              <Button
                type="button"
                size="sm"
                className="h-8"
                variant={viewMode === "list" ? "default" : "ghost"}
                onClick={() => setViewMode("list")}
              >
                <List className="mr-1.5 h-4 w-4" />
                List
              </Button>
            </div>
          </div>
        </div>

        {/* FILTER DIALOG */}
        <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Transaction Filters</DialogTitle>
              <DialogDescription>
                Filter transactions by payment status and payment method.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* PAYMENT STATUS */}
              <div className="space-y-1.5">
                <Label htmlFor="payment-status-filter">Payment Status</Label>

                <Select
                  value={draftStatus}
                  onValueChange={(value) => setDraftStatus(value as PaymentStatus)}
                >
                  <SelectTrigger
                    id="payment-status-filter"
                    className="h-10 w-full justify-between text-sm"
                  >
                    <SelectValue placeholder="Select payment status" />
                  </SelectTrigger>

                  <SelectContent position="popper" className="max-h-60">
                    <SelectItem value="all" className="cursor-pointer">
                      All statuses
                    </SelectItem>
                    <SelectItem value="paid" className="cursor-pointer">
                      Paid
                    </SelectItem>
                    <SelectItem value="unpaid" className="cursor-pointer">
                      Unpaid
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* PAYMENT METHOD */}
              <div className="space-y-1.5">
                <Label htmlFor="payment-method-filter">Payment Method</Label>

                <Select
                  value={draftMethod}
                  onValueChange={(value) => setDraftMethod(value as PaymentMethod)}
                >
                  <SelectTrigger
                    id="payment-method-filter"
                    className="h-10 w-full justify-between text-sm"
                  >
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>

                  <SelectContent position="popper" className="max-h-60">
                    <SelectItem value="all" className="cursor-pointer">
                      All methods
                    </SelectItem>
                    <SelectItem value="cash" className="cursor-pointer">
                      Cash
                    </SelectItem>
                    <SelectItem value="gcash" className="cursor-pointer">
                      GCash
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ACTIONS */}
              <div className="flex justify-between gap-2 border-t border-border pt-4">
                <Button type="button" variant="ghost" onClick={clearFilters}>
                  Clear all
                </Button>

                <Button type="button" onClick={applyFilters}>
                  Apply filters
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* TRANSACTION RECORDS */}
        {filteredTransactions.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
            <p className="font-medium">No transactions found.</p>
            <p className="mt-1 text-xs">Try changing your search or filters.</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {paginatedTransactions.map(renderGridCard)}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[1100px] whitespace-nowrap text-sm">
              <thead className="bg-secondary/50 text-left text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Transaction</th>
                  <th className="p-3 font-medium">Customer</th>
                  <th className="p-3 font-medium">Room</th>
                  <th className="p-3 font-medium">Amount / Date</th>
                  <th className="p-3 font-medium">Method</th>
                  <th className="p-3 text-right font-medium">Actions</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>

              <tbody>{paginatedTransactions.map(renderTableRow)}</tbody>
            </table>
          </div>
        )}

        {/* PAGINATION */}
        {filteredTransactions.length > 0 && (
          <Pagination
            page={safeCurrentPage}
            pageSize={pageSize}
            totalItems={filteredTransactions.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            pageSizeOptions={[5, 10]}
            itemLabel="transactions"
          />
        )}
      </div>

      {/* TRANSACTION DETAILS DIALOG */}
      <Dialog
        open={!!selectedTransaction}
        onOpenChange={(open) => {
          if (!open) setSelectedTransaction(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-xl border-border bg-card sm:max-w-xl">
          {selectedTransaction && (
            <>
              <DialogHeader>
                <DialogTitle>Transaction Details</DialogTitle>
                <DialogDescription>
                  Complete payment information for this transaction.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-3">
                {/* PAYMENT SUMMARY */}
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <p className="text-xs text-muted-foreground">Transaction Reference</p>

                  <p className="mt-1 font-semibold">{selectedTransaction.reference}</p>

                  <p className="mt-3 font-display text-2xl font-bold">
                    {peso(selectedTransaction.amount)}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <PaymentStatusBadge paymentStatus={selectedTransaction.paymentStatus} />

                    <PaymentMethodBadge paymentMethod={selectedTransaction.paymentMethod} />
                  </div>
                </div>

                {/* CUSTOMER INFORMATION */}
                <section className="space-y-3">
                  <SectionHeading>Customer Information</SectionHeading>

                  <DetailRow label="Customer" value={selectedTransaction.customer} />

                  <DetailRow label="Email" value={selectedTransaction.email} />

                  <DetailRow label="Phone" value={selectedTransaction.phone} />
                </section>

                {/* RESERVATION OR FOOD ORDER INFORMATION */}
                <section className="space-y-3">
                  <SectionHeading>
                    {selectedTransaction.type === "room"
                      ? "Reservation Information"
                      : "Food Order Information"}
                  </SectionHeading>

                  <DetailRow label="Reference" value={selectedTransaction.reservationReference} />

                  <DetailRow
                    label="Room"
                    value={`${selectedTransaction.room} ${
                      selectedTransaction.roomNumber ? `(${selectedTransaction.roomNumber})` : ""
                    }`}
                  />

                  <DetailRow
                    label={selectedTransaction.type === "room" ? "Reservation Date" : "Submitted"}
                    value={selectedTransaction.date}
                  />

                  <DetailRow label="Record Status" value={selectedTransaction.recordStatus} />
                </section>

                {/* FOOD ORDERED */}
                {selectedTransaction.type === "food" && (
                  <section className="space-y-3">
                    <SectionHeading>Food Ordered</SectionHeading>

                    {selectedTransaction.foodItems.length > 0 ? (
                      <div className="rounded-xl border border-border bg-card p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <Utensils className="h-4 w-4 text-muted-foreground" />
                          <p className="text-sm font-semibold">
                            Order Items ({selectedTransaction.foodItems.length})
                          </p>
                        </div>

                        <div className="space-y-4">
                          {selectedTransaction.foodItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
                            >
                              <div className="min-w-0">
                                <p className="font-medium">{item.name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {item.quantity} × {peso(item.unitPrice)}
                                </p>
                              </div>

                              <p className="shrink-0 text-sm font-semibold">
                                {peso(item.lineTotal)}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                          <span className="text-sm font-semibold">Order Total</span>
                          <span className="font-display text-lg font-bold">
                            {peso(selectedTransaction.amount)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                        No food item details available for this order.
                      </p>
                    )}
                  </section>
                )}

                {/* PAYMENT INFORMATION */}
                <section className="space-y-3">
                  <SectionHeading>Payment Information</SectionHeading>

                  <DetailRow
                    label="Payment Method"
                    value={selectedTransaction.paymentMethod === "gcash" ? "GCash" : "Cash"}
                  />

                  <DetailRow
                    label="Payment Status"
                    value={selectedTransaction.paymentStatus.toUpperCase()}
                  />

                  <DetailRow label="Payer Name" value={selectedTransaction.payerName} />

                  <DetailRow label="Payer Account" value={selectedTransaction.payerAccount} />

                  <DetailRow
                    label="Payment Reference"
                    value={selectedTransaction.paymentReference}
                  />
                </section>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    openEdit(selectedTransaction);
                    setSelectedTransaction(null);
                  }}
                >
                  Edit Payment
                </Button>

                <Button type="button" onClick={() => setSelectedTransaction(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* EDIT PAYMENT DIALOG */}
      <Dialog
        open={!!editingTransaction}
        onOpenChange={(open) => {
          if (!open && !saving) setEditingTransaction(null);
        }}
      >
        <DialogContent className="rounded-xl border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
            <DialogDescription>Update the payment status and payment method.</DialogDescription>
          </DialogHeader>

          {editingTransaction && (
            <div className="space-y-5 py-3">
              <div className="rounded-xl border border-border bg-secondary/30 p-4">
                <p className="text-xs text-muted-foreground">Transaction Reference</p>

                <p className="mt-1 font-semibold">{editingTransaction.reference}</p>

                <p className="mt-1 text-sm text-muted-foreground">{editingTransaction.customer}</p>

                <p className="mt-2 font-display text-xl font-bold">
                  {peso(editingTransaction.amount)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-payment-method">Payment Method</Label>

                <select
                  id="edit-payment-method"
                  value={editMethod}
                  onChange={(e) => {
                    const value = e.target.value as "cash" | "gcash";

                    setEditMethod(value);

                    if (value === "gcash") {
                      setEditStatus("paid");
                    }
                  }}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  disabled={saving}
                >
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-payment-status">Payment Status</Label>

                <select
                  id="edit-payment-status"
                  value={editMethod === "gcash" ? "paid" : editStatus}
                  onChange={(e) => setEditStatus(e.target.value as "paid" | "unpaid")}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  disabled={saving || editMethod === "gcash"}
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                </select>

                {editMethod === "gcash" && (
                  <p className="text-xs font-medium text-emerald-600">
                    GCash payments are automatically marked as paid.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingTransaction(null)}
              disabled={saving}
            >
              Cancel
            </Button>

            <Button type="button" onClick={() => void savePayment()} disabled={saving}>
              {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* REUSABLE COMPONENTS */

function RevenueCard({
  label,
  value,
  description,
  icon,
  accent,
}: {
  label: string;
  value: number;
  description: string;
  icon: ReactNode;
  accent: "primary" | "accent" | "chart";
}) {
  const accentStyles = {
    primary: "bg-primary/15 text-primary",
    accent: "bg-accent/15 text-accent",
    chart: "bg-chart-4/15 text-chart-4",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>

          <p className="mt-2 font-display text-2xl font-bold tabular-nums">{peso(value)}</p>

          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>

        <div className={`rounded-lg p-3 ${accentStyles[accent]}`}>{icon}</div>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-accent">
      {children}
    </h3>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border pb-2 sm:flex-row sm:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>

      <span className="break-all text-sm font-medium sm:text-right">{value || "—"}</span>
    </div>
  );
}
