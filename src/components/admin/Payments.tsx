import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

import {
  Filter,
  Eye,
  Pencil,
  Trash2,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  Wallet,
  Music,
  Utensils,
  CheckCircle2,
  Download,
  Image as ImageIcon,
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
import { calculateCollectedRevenue } from "@/lib/revenue";

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
  customerId: string;
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
  roomPaymentStatus: "paid" | "unpaid" | null;
  paymentMethod: "cash" | "gcash";
  payerName: string;
  payerAccount: string;
  paymentReference: string;
  reservationReference: string;
  recordStatus: string;
  foodItems: FoodPaymentItem[];
};

type PaymentProof = {
  id: string;
  status: string;
  storage_path: string;
  signedUrl: string;
};

type PaymentReceipt = {
  receiptNumber: string;
  reference: string;
  transactionType: "Room Reservation" | "Food Order";
  customer: string;
  room: string;
  amount: number;
  paymentMethod: "cash" | "gcash";
  payerName: string;
  paymentReference: string;
  issuedAt: string;
};

type PaymentsProps = {
  res: ResRow[];
  orders: OrderRow[];
  mode?: "admin" | "staff";
  paymentTargetOrderId?: string | null;
  onPaymentTargetHandled?: () => void;
  paymentTargetReservationId?: string | null;
  onReservationPaymentTargetHandled?: () => void;
};

function getPaymentStatus(paymentStatus: string | null | undefined): "paid" | "unpaid" {
  return paymentStatus === "paid" ? "paid" : "unpaid";
}

function getPaymentMethod(paymentMethod: string | null | undefined): "cash" | "gcash" {
  return paymentMethod === "gcash" ? "gcash" : "cash";
}

export function Payments({
  res,
  orders,
  mode = "admin",
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

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [search, setSearch] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRecord | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TransactionRecord | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<TransactionRecord | null>(null);
  const [paymentReceipt, setPaymentReceipt] = useState<PaymentReceipt | null>(null);

  const [editMethod, setEditMethod] = useState<"cash" | "gcash">("cash");
  const [editPayerName, setEditPayerName] = useState("");
  const [editPayerAccount, setEditPayerAccount] = useState("");
  const [editPaymentReference, setEditPaymentReference] = useState("");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [acceptingPayment, setAcceptingPayment] = useState(false);

  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  const [focusedReservationId, setFocusedReservationId] = useState<string | null>(null);

  const validReservations = useMemo(
    () => res.filter((r) => !["rejected", "cancelled"].includes(r.status)),
    [res],
  );
  const validOrders = useMemo(() => orders.filter((o) => o.status !== "cancelled"), [orders]);

  const paymentProofQuery = useQuery({
    queryKey: ["transaction-payment-proof", selectedTransaction?.type, selectedTransaction?.id],
    enabled: Boolean(selectedTransaction && selectedTransaction.paymentMethod === "gcash"),
    refetchOnMount: "always",
    queryFn: async (): Promise<PaymentProof | null> => {
      if (!selectedTransaction) return null;

      const { data, error } =
        selectedTransaction.type === "room"
          ? await supabase
              .from("payment_proofs")
              .select("id, status, storage_path")
              .eq("reservation_id", selectedTransaction.id)
              .limit(10)
          : await supabase
              .from("payment_proofs")
              .select("id, status, storage_path")
              .eq("food_order_id", selectedTransaction.id)
              .limit(10);

      if (error) throw error;

      const proof = data?.find((item) => item.status === "pending") ?? data?.[0];
      let storagePath = proof?.storage_path;

      if (!storagePath) {
        const targetType = selectedTransaction.type === "room" ? "reservation" : "food_order";
        const proofFolder = `${selectedTransaction.customerId}/${targetType}/${selectedTransaction.id}`;
        const { data: files, error: listError } = await supabase.storage
          .from("payment-proofs")
          .list(proofFolder, {
            limit: 100,
            sortBy: { column: "created_at", order: "desc" },
          });

        if (listError) throw listError;

        const uploadedFile = files?.find((file) => file.id && file.name);
        if (!uploadedFile) return null;

        storagePath = `${proofFolder}/${uploadedFile.name}`;
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(storagePath, 60 * 60);

      if (signedError) throw signedError;

      return {
        id: proof?.id ?? storagePath,
        status: proof?.status ?? "pending",
        storage_path: storagePath,
        signedUrl: signedData.signedUrl,
      };
    },
  });

  const { roomRevenue, foodRevenue, totalRevenue } = calculateCollectedRevenue(
    validReservations,
    validOrders,
  );
  const normalizedSearch = search.trim().toLowerCase();

  const roomTransactions: TransactionRecord[] = validReservations.map((r) => {
    const profile = profiles[r.user_id];

    return {
      id: r.id,
      customerId: r.user_id,
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
      paymentStatus: getPaymentStatus(r.payment_status),
      roomPaymentStatus: null,
      paymentMethod: getPaymentMethod(r.payment_method),
      payerName: r.payer_name ?? "",
      payerAccount: r.payer_account_number ?? "",
      paymentReference: r.payment_reference ?? "",
      reservationReference: r.reference_code,
      recordStatus: r.status,
      foodItems: [],
    };
  });

  const foodTransactions = useMemo(() => {
    const reservationsById = new Map(
      validReservations.map((reservation) => [reservation.id, reservation]),
    );

    return validOrders.map((o): TransactionRecord => ({
      id: o.id,
      customerId: o.user_id,
      type: "food",
      reference: o.reference_code,
      customer: o.profiles?.full_name ?? "Guest",
      email: o.profiles?.email ?? "",
      phone: o.profiles?.phone ?? "",
      room: o.reservations?.rooms?.name ?? "Room",
      roomNumber: o.reservations?.rooms?.room_number ?? "",
      date: new Date(o.submitted_at ?? o.created_at).toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      dateValue: new Date(o.submitted_at ?? o.created_at).toLocaleDateString("en-CA"),
      amount: Number(o.food_subtotal ?? 0),
      paymentStatus: getPaymentStatus(o.payment_status),
      roomPaymentStatus: getPaymentStatus(
        reservationsById.get(o.reservation_id ?? "")?.payment_status,
      ),
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
  }, [validOrders, validReservations]);

  useEffect(() => {
    if (!paymentTargetOrderId) return;

    const targetTransaction = foodTransactions.find(
      (transaction) => transaction.id === paymentTargetOrderId,
    );
    if (!targetTransaction) return;

    setActiveTab("food");
    setViewMode("list");
    setFocusedOrderId(paymentTargetOrderId);
    setFocusedReservationId(null);
    resetFilters();
    setSelectedTransaction(targetTransaction);
    onPaymentTargetHandled?.();
  }, [paymentTargetOrderId, foodTransactions, onPaymentTargetHandled]);

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
    resetFilters();
    setSelectedTransaction(null);
    onReservationPaymentTargetHandled?.();
  }, [paymentTargetReservationId, validReservations, onReservationPaymentTargetHandled]);

  function resetFilters() {
    setStatus("all");
    setMethod("all");
    setFromDate("");
    setToDate("");
    setSearch("");
    setCurrentPage(1);
  }

  const currentTransactions = activeTab === "room" ? roomTransactions : foodTransactions;

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

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const changeTab = (tab: PaymentTab) => {
    setActiveTab(tab);
    setFocusedOrderId(null);
    setFocusedReservationId(null);
    resetFilters();
  };

  const clearFilters = () => {
    setStatus("all");
    setMethod("all");
    setFromDate("");
    setToDate("");
    setCurrentPage(1);
  };

  const openEdit = (transaction: TransactionRecord) => {
    setEditingTransaction(transaction);
    setEditMethod(transaction.paymentMethod);
    setEditPayerName(transaction.payerName);
    setEditPayerAccount(transaction.payerAccount);
    setEditPaymentReference(transaction.paymentReference);
  };

  const openPaymentReceipt = (transaction: TransactionRecord) => {
    const issuedAt = new Date();
    const safeReference = transaction.reference.replace(/[^a-zA-Z0-9-]/g, "-");

    setPaymentReceipt({
      receiptNumber: `SON-${safeReference}`,
      reference: transaction.reference,
      transactionType: transaction.type === "room" ? "Room Reservation" : "Food Order",
      customer: transaction.customer,
      room: `${transaction.room}${transaction.roomNumber ? ` (${transaction.roomNumber})` : ""}`,
      amount: transaction.amount,
      paymentMethod: transaction.paymentMethod,
      payerName: transaction.payerName,
      paymentReference: transaction.paymentReference,
      issuedAt: issuedAt.toISOString(),
    });
  };

  const acceptPayment = async (transaction: TransactionRecord) => {
    if (transaction.paymentStatus === "paid" || acceptingPayment) return;

    if (transaction.type === "food" && transaction.roomPaymentStatus !== "paid") {
      toast.error("Accept the linked room payment before accepting food payment.");
      return;
    }

    if (
      transaction.paymentMethod === "gcash" &&
      (!paymentProofQuery.data || paymentProofQuery.isLoading || paymentProofQuery.isError)
    ) {
      toast.error("Load and review the uploaded GCash proof before accepting this payment.");
      return;
    }

    if (
      !window.confirm(
        `Confirm receipt of ${peso(transaction.amount)} for ${transaction.reference}?`,
      )
    ) {
      return;
    }

    setAcceptingPayment(true);

    try {
      const { data, error } = await supabase.rpc("accept_payment", {
        _target_type: transaction.type === "room" ? "reservation" : "food_order",
        _target_id: transaction.id,
      });

      if (error) throw error;

      if (!data?.length) {
        throw new Error("Payment was not accepted. It may already be paid; refresh and try again.");
      }

      setSelectedTransaction(null);
      openPaymentReceipt(transaction);
      await refreshTransactions();
      toast.success("Payment accepted. Receipt is ready to export.");
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setAcceptingPayment(false);
    }
  };

  const exportPaymentReceipt = () => {
    if (!paymentReceipt) return;

    try {
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const left = 20;
      let y = 24;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text("SONARA", left, y);
      y += 9;
      pdf.setFontSize(13);
      pdf.text("PAYMENT RECEIPT", left, y);
      y += 10;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const rows = [
        ["Receipt No.", paymentReceipt.receiptNumber],
        ["Issued", new Date(paymentReceipt.issuedAt).toLocaleString("en-PH")],
        ["Transaction", paymentReceipt.transactionType],
        ["Reference", paymentReceipt.reference],
        ["Customer", paymentReceipt.customer || "Guest"],
        ["Room", paymentReceipt.room || "N/A"],
        ["Payment Method", paymentReceipt.paymentMethod === "gcash" ? "GCash" : "Cash"],
        ["Payer Name", paymentReceipt.payerName || "N/A"],
        ["Payment Reference", paymentReceipt.paymentReference || "N/A"],
      ];

      for (const [label, value] of rows) {
        const valueLines = pdf.splitTextToSize(String(value), 120);
        pdf.setTextColor(110, 116, 113);
        pdf.text(label, left, y);
        pdf.setTextColor(25, 30, 28);
        pdf.text(valueLines, left + 46, y);
        y += Math.max(8, valueLines.length * 5);
      }

      y += 4;
      pdf.setDrawColor(220, 224, 220);
      pdf.line(left, y, 190, y);
      y += 10;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Amount received", left, y);
      pdf.text(`PHP ${paymentReceipt.amount.toFixed(2)}`, 190, y, { align: "right" });
      y += 16;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(110, 116, 113);
      pdf.text("System-generated payment acknowledgment.", left, y);

      const safeReceiptNumber = paymentReceipt.receiptNumber.replace(/[^a-zA-Z0-9-_]/g, "-");
      pdf.save(`SONARA-${safeReceiptNumber}.pdf`);
    } catch (error) {
      toast.error(`Unable to export receipt: ${errMsg(error)}`);
    }
  };

  const savePayment = async () => {
    if (!editingTransaction) return;

    setSaving(true);

    try {
      const table = editingTransaction.type === "room" ? "reservations" : "food_orders";

      const { data, error } = await supabase
        .from(table)
        .update({
          payment_method: editMethod,
          payer_name: editPayerName.trim() || null,
          payer_account_number: editPayerAccount.trim() || null,
          payment_reference: editPaymentReference.trim() || null,
        })
        .eq("id", editingTransaction.id)
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error("Transaction details were not updated.");
      }

      toast.success("Transaction updated successfully.");
      setEditingTransaction(null);

      await refreshTransactions();
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteTransaction = async () => {
    if (!deletingTransaction) return;

    setDeleting(true);

    try {
      const table = deletingTransaction.type === "room" ? "reservations" : "food_orders";

      const { data, error } = await supabase
        .from(table)
        .delete()
        .eq("id", deletingTransaction.id)
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error("Transaction could not be deleted.");
      }

      toast.success("Transaction record deleted successfully.");

      setDeletingTransaction(null);
      setSelectedTransaction(null);

      await refreshTransactions();
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setDeleting(false);
    }
  };

  const refreshTransactions = async () => {
    const reservationQueryKey = mode === "staff" ? "staff-reservations" : "admin-res";
    const ordersQueryKey = mode === "staff" ? "staff-orders" : "admin-orders";

    await Promise.all([
      qc.invalidateQueries({ queryKey: [reservationQueryKey] }),
      qc.invalidateQueries({ queryKey: [ordersQueryKey] }),
    ]);
  };

  const hasActiveFilters = status !== "all" || method !== "all" || !!fromDate || !!toDate;

  const activeFilterCount =
    (status !== "all" ? 1 : 0) + (method !== "all" ? 1 : 0) + (fromDate ? 1 : 0) + (toDate ? 1 : 0);

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

  const PaymentStatusBadge = ({ paymentStatus }: { paymentStatus: "paid" | "unpaid" }) => (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        paymentStatus === "paid"
          ? "bg-emerald-500/10 text-emerald-600"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {paymentStatus === "paid" ? "Paid" : "Unpaid"}
    </span>
  );

  const TransactionActions = ({ transaction }: { transaction: TransactionRecord }) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => setSelectedTransaction(transaction)}
        title="View transaction"
        aria-label="View transaction"
        className="text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <Eye className="h-4 w-4" />
      </Button>

      {mode === "admin" && (
        <>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => openEdit(transaction)}
            title="Edit transaction"
            aria-label="Edit transaction"
            className="text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setDeletingTransaction(transaction)}
            title="Delete transaction"
            aria-label="Delete transaction"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );

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
        <PaymentStatusBadge paymentStatus={t.paymentStatus} />
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

      <div className="flex justify-end border-t border-border pt-3">
        <TransactionActions transaction={t} />
      </div>
    </div>
  );

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
        <PaymentMethodBadge paymentMethod={t.paymentMethod} />
      </td>

      <td className="p-3">
        <PaymentStatusBadge paymentStatus={t.paymentStatus} />
      </td>

      <td className="p-3">
        <TransactionActions transaction={t} />
      </td>
    </tr>
  );

  return (
    <div className="mt-4 space-y-5 text-foreground">
      {/* PAGE HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage transaction records and monitor business revenue.
          </p>
        </div>
      </div>

      {/* REVENUE SUMMARY */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <RevenueCard
          label="Total Collected"
          value={totalRevenue}
          description="Paid room and food transactions"
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

      {/* TRANSACTION TABS */}
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

      {/* FOCUSED TRANSACTION */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {focusedReservationId && activeTab === "room" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFocusedReservationId(null);
              resetFilters();
            }}
          >
            Show All Room Transactions
          </Button>
        ) : focusedOrderId && activeTab === "food" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFocusedOrderId(null);
              resetFilters();
            }}
          >
            Show All Food Transactions
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            {filteredTransactions.length} transaction
            {filteredTransactions.length !== 1 ? "s" : ""} found
          </p>
        )}
      </div>

      {/* TOOLBAR */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="relative min-w-0 flex-1 xl:min-w-[200px]">
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

          <div className="flex flex-wrap items-end gap-2 xl:shrink-0">
            <div className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>Filter</span>
              {hasActiveFilters && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </div>

            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as PaymentStatus);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger
                aria-label="Filter by payment status"
                className="h-10 w-[130px] justify-between text-sm"
              >
                <SelectValue placeholder="Payment status" />
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-60">
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={method}
              onValueChange={(value) => {
                setMethod(value as PaymentMethod);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger
                aria-label="Filter by payment method"
                className="h-10 w-[130px] justify-between text-sm"
              >
                <SelectValue placeholder="Payment method" />
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-60">
                <SelectItem value="all">All methods</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="gcash">GCash</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10 whitespace-nowrap text-muted-foreground hover:bg-secondary hover:text-foreground"
                onClick={clearFilters}
              >
                Clear
              </Button>
            )}
          </div>

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

      {/* TRANSACTION RECORDS */}
      {filteredTransactions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
          <Wallet className="mx-auto mb-3 h-8 w-8 opacity-50" />
          <p className="font-medium">No transactions found.</p>
          <p className="mt-1 text-xs">Try changing your search or filters.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 text-right font-medium">Actions</th>
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

      {/* TRANSACTION DETAILS */}
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
                <DialogDescription>Complete information for this transaction.</DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-3">
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

                <section className="space-y-3">
                  <SectionHeading>Customer Information</SectionHeading>
                  <DetailRow label="Customer" value={selectedTransaction.customer} />
                  <DetailRow label="Email" value={selectedTransaction.email} />
                  <DetailRow label="Phone" value={selectedTransaction.phone} />
                </section>

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
                  {selectedTransaction.type === "food" && (
                    <DetailRow
                      label="Room Payment Status"
                      value={selectedTransaction.roomPaymentStatus?.toUpperCase() ?? "UNVERIFIED"}
                    />
                  )}
                </section>

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
                  {selectedTransaction.type === "food" &&
                    selectedTransaction.roomPaymentStatus !== "paid" && (
                      <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                        The room payment must be verified before food payment can be accepted.
                      </p>
                    )}
                  <DetailRow label="Payer Name" value={selectedTransaction.payerName} />
                  <DetailRow label="Payer Account" value={selectedTransaction.payerAccount} />
                  <DetailRow
                    label="Payment Reference"
                    value={selectedTransaction.paymentReference}
                  />
                </section>

                {selectedTransaction.paymentMethod === "gcash" && (
                  <section className="space-y-3">
                    <SectionHeading>Uploaded Payment Proof</SectionHeading>

                    {paymentProofQuery.isLoading ? (
                      <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/20 p-5 text-sm text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Loading GCash screenshot...
                      </div>
                    ) : paymentProofQuery.isError ? (
                      <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                        Unable to load payment proof: {errMsg(paymentProofQuery.error)}
                      </p>
                    ) : paymentProofQuery.data ? (
                      <a
                        href={paymentProofQuery.data.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block overflow-hidden rounded-lg border border-border bg-secondary/20"
                      >
                        <img
                          src={paymentProofQuery.data.signedUrl}
                          alt={`GCash payment proof for ${selectedTransaction.reference}`}
                          className="max-h-[420px] w-full object-contain"
                        />
                        <span className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                          <ImageIcon className="h-4 w-4" />
                          Open uploaded screenshot
                        </span>
                      </a>
                    ) : (
                      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                        No GCash screenshot has been uploaded for this transaction.
                      </p>
                    )}
                  </section>
                )}
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                {mode === "admin" && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      setDeletingTransaction(selectedTransaction);
                      setSelectedTransaction(null);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  {selectedTransaction.paymentStatus === "unpaid" && (
                    <Button
                      type="button"
                      onClick={() => void acceptPayment(selectedTransaction)}
                      disabled={
                        acceptingPayment ||
                        (selectedTransaction.type === "food" &&
                          selectedTransaction.roomPaymentStatus !== "paid") ||
                        (selectedTransaction.paymentMethod === "gcash" &&
                          (paymentProofQuery.isLoading ||
                            paymentProofQuery.isError ||
                            !paymentProofQuery.data))
                      }
                    >
                      {acceptingPayment ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      {acceptingPayment ? "Accepting..." : "Accept Payment"}
                    </Button>
                  )}
                  {selectedTransaction.paymentStatus === "paid" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSelectedTransaction(null);
                        openPaymentReceipt(selectedTransaction);
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      View Receipt
                    </Button>
                  )}
                  <Button type="button" onClick={() => setSelectedTransaction(null)}>
                    Close
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* PAYMENT RECEIPT */}
      <Dialog
        open={!!paymentReceipt}
        onOpenChange={(open) => {
          if (!open) setPaymentReceipt(null);
        }}
      >
        <DialogContent className="rounded-xl border-border bg-card sm:max-w-md">
          {paymentReceipt && (
            <>
              <DialogHeader>
                <DialogTitle>Payment Receipt</DialogTitle>
                <DialogDescription>
                  Payment was accepted. Download a copy for your records.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4">
                <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <p className="font-display text-lg font-bold">SONARA</p>
                    <p className="text-xs text-muted-foreground">Payment acknowledgment</p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>

                <DetailRow label="Receipt No." value={paymentReceipt.receiptNumber} />
                <DetailRow
                  label="Issued"
                  value={new Date(paymentReceipt.issuedAt).toLocaleString("en-PH")}
                />
                <DetailRow label="Transaction" value={paymentReceipt.transactionType} />
                <DetailRow label="Reference" value={paymentReceipt.reference} />
                <DetailRow label="Customer" value={paymentReceipt.customer || "Guest"} />
                <DetailRow label="Room" value={paymentReceipt.room || "—"} />
                <DetailRow
                  label="Payment Method"
                  value={paymentReceipt.paymentMethod === "gcash" ? "GCash" : "Cash"}
                />
                <DetailRow label="Payer Name" value={paymentReceipt.payerName} />
                <DetailRow label="Payment Reference" value={paymentReceipt.paymentReference} />
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="font-semibold">Amount Received</span>
                  <span className="font-display text-xl font-bold">
                    {peso(paymentReceipt.amount)}
                  </span>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  System-generated payment acknowledgment.
                </p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPaymentReceipt(null)}>
                  Close
                </Button>
                <Button type="button" onClick={exportPaymentReceipt}>
                  <Download className="mr-2 h-4 w-4" />
                  Export PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* EDIT TRANSACTION */}
      <Dialog
        open={!!editingTransaction}
        onOpenChange={(open) => {
          if (!open && !saving) setEditingTransaction(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-xl border-border bg-card sm:max-w-xl">
          {editingTransaction && (
            <>
              <DialogHeader>
                <DialogTitle>Edit Transaction</DialogTitle>
                <DialogDescription>
                  Update transaction and payer information. Use Accept Payment after verifying
                  funds.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-3">
                {/* TRANSACTION SUMMARY */}
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <p className="text-xs text-muted-foreground">Transaction Reference</p>
                  <p className="mt-1 font-semibold">{editingTransaction.reference}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {editingTransaction.customer}
                  </p>
                  <p className="mt-3 font-display text-2xl font-bold">
                    {peso(editingTransaction.amount)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <PaymentStatusBadge paymentStatus={editingTransaction.paymentStatus} />
                    <PaymentMethodBadge paymentMethod={editingTransaction.paymentMethod} />
                  </div>
                </div>

                {/* TRANSACTION INFORMATION */}
                <section className="space-y-3">
                  <SectionHeading>Transaction Information</SectionHeading>
                  <DetailRow
                    label="Transaction Type"
                    value={editingTransaction.type === "room" ? "Room Reservation" : "Food Order"}
                  />
                  <DetailRow
                    label="Reservation Reference"
                    value={editingTransaction.reservationReference}
                  />
                  <DetailRow
                    label="Room"
                    value={`${editingTransaction.room} ${
                      editingTransaction.roomNumber ? `(${editingTransaction.roomNumber})` : ""
                    }`}
                  />
                  <DetailRow
                    label={editingTransaction.type === "room" ? "Reservation Date" : "Submitted"}
                    value={editingTransaction.date}
                  />
                </section>

                {/* PAYMENT INFORMATION */}
                <section className="space-y-3">
                  <SectionHeading>Payment Information</SectionHeading>

                  <div className="space-y-2">
                    <Label htmlFor="edit-payment-method">Payment Method</Label>
                    <Select
                      value={editMethod}
                      onValueChange={(value) => setEditMethod(value as "cash" | "gcash")}
                      disabled={saving}
                    >
                      <SelectTrigger id="edit-payment-method" className="h-10 w-full">
                        <SelectValue placeholder="Select payment method" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="gcash">GCash</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-payer-name">Payer Name</Label>
                    <Input
                      id="edit-payer-name"
                      value={editPayerName}
                      onChange={(e) => setEditPayerName(e.target.value)}
                      placeholder="Enter payer name"
                      disabled={saving}
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-payer-account">Payer Account Number</Label>
                    <Input
                      id="edit-payer-account"
                      value={editPayerAccount}
                      onChange={(e) => setEditPayerAccount(e.target.value)}
                      placeholder="Enter account number"
                      disabled={saving}
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-payment-reference">Payment Reference</Label>
                    <Input
                      id="edit-payment-reference"
                      value={editPaymentReference}
                      onChange={(e) => setEditPaymentReference(e.target.value)}
                      placeholder="Enter payment reference"
                      disabled={saving}
                      className="h-10"
                    />
                  </div>
                </section>
              </div>

              <DialogFooter className="flex-col gap-2 border-t border-border pt-4 sm:flex-row">
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
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION */}
      <Dialog
        open={!!deletingTransaction}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeletingTransaction(null);
        }}
      >
        <DialogContent className="rounded-xl border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Transaction?</DialogTitle>
            <DialogDescription>
              This will permanently delete the associated{" "}
              {deletingTransaction?.type === "room" ? "reservation" : "food order"} record, not just
              hide it from this page.
            </DialogDescription>
          </DialogHeader>

          {deletingTransaction && (
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <p className="font-semibold">{deletingTransaction.reference}</p>
              <p className="mt-1 text-sm text-muted-foreground">{deletingTransaction.customer}</p>
              <p className="mt-2 font-display text-xl font-bold">
                {peso(deletingTransaction.amount)}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingTransaction(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deleteTransaction()}
              disabled={deleting}
            >
              {deleting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {deleting ? "Deleting..." : "Delete Transaction"}
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
