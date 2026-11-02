import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Filter, Eye, LayoutGrid, List, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { errMsg, fmtDate, peso } from "@/lib/afterglow";

import { useProfiles, type ResRow, type OrderRow } from "./shared";

type PaymentTab = "room" | "food";
type PaymentStatus = "all" | "paid" | "unpaid";
type PaymentMethod = "all" | "cash" | "gcash";
type ViewMode = "grid" | "list";

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
  amount: number;
  paymentStatus: "paid" | "unpaid";
  paymentMethod: "cash" | "gcash";
  payerName: string;
  payerAccount: string;
  paymentReference: string;
  reservationReference: string;
  recordStatus: string;
};

export function Payments({ res, orders }: { res: ResRow[]; orders: OrderRow[] }) {
  const qc = useQueryClient();
  const { data: profiles = {} } = useProfiles();

  const [activeTab, setActiveTab] = useState<PaymentTab>("room");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [status, setStatus] = useState<PaymentStatus>("all");
  const [method, setMethod] = useState<PaymentMethod>("all");

  const [draftStatus, setDraftStatus] = useState<PaymentStatus>("all");
  const [draftMethod, setDraftMethod] = useState<PaymentMethod>("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRecord | null>(null);

  const [editingTransaction, setEditingTransaction] = useState<TransactionRecord | null>(null);

  const [editStatus, setEditStatus] = useState<"paid" | "unpaid">("unpaid");
  const [editMethod, setEditMethod] = useState<"cash" | "gcash">("cash");

  const [saving, setSaving] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  const validReservations = res.filter((r) => !["rejected", "cancelled"].includes(r.status));

  const validOrders = orders.filter((o) => o.status !== "cancelled");

  // GCash transactions are always treated as paid.
  const getPaymentStatus = (paymentMethod: string, paymentStatus: string): "paid" | "unpaid" => {
    if (paymentMethod === "gcash") return "paid";
    return paymentStatus === "paid" ? "paid" : "unpaid";
  };

  // Revenue includes all GCash transactions as paid.
  const roomRevenue = validReservations
    .filter((r) => getPaymentStatus(r.payment_method, r.payment_status) === "paid")
    .reduce((total, r) => total + Number(r.room_total), 0);

  const foodRevenue = validOrders
    .filter((o) => getPaymentStatus(o.payment_method, o.payment_status) === "paid")
    .reduce((total, o) => total + Number(o.food_subtotal), 0);

  const totalRevenue = roomRevenue + foodRevenue;

  const normalizedSearch = search.trim().toLowerCase();

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
      amount: Number(r.room_total),
      paymentStatus: getPaymentStatus(r.payment_method, r.payment_status),
      paymentMethod: r.payment_method as "cash" | "gcash",
      payerName: r.payer_name ?? "",
      payerAccount: r.payer_account_number ?? "",
      paymentReference: r.payment_reference ?? "",
      reservationReference: r.reference_code,
      recordStatus: r.status,
    };
  });

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
    amount: Number(o.food_subtotal),
    paymentStatus: getPaymentStatus(o.payment_method, o.payment_status),
    paymentMethod: o.payment_method as "cash" | "gcash",
    payerName: o.payer_name ?? "",
    payerAccount: o.payer_account_number ?? "",
    paymentReference: o.payment_reference ?? "",
    reservationReference: o.reservations?.reference_code ?? "",
    recordStatus: o.status,
  }));

  const currentTransactions = activeTab === "room" ? roomTransactions : foodTransactions;

  const filteredTransactions = currentTransactions.filter((t) => {
    const matchesStatus = status === "all" || t.paymentStatus === status;
    const matchesMethod = method === "all" || t.paymentMethod === method;

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

    return matchesStatus && matchesMethod && matchesSearch;
  });

  const changeTab = (tab: PaymentTab) => {
    setActiveTab(tab);
    setStatus("all");
    setMethod("all");
    setDraftStatus("all");
    setDraftMethod("all");
    setSearch("");
  };

  const openFilters = () => {
    setDraftStatus(status);
    setDraftMethod(method);
    setFilterOpen(true);
  };

  const applyFilters = () => {
    setStatus(draftStatus);
    setMethod(draftMethod);
    setFilterOpen(false);
  };

  const clearFilters = () => {
    setStatus("all");
    setMethod("all");
    setDraftStatus("all");
    setDraftMethod("all");
  };

  const openEdit = (transaction: TransactionRecord) => {
    setEditingTransaction(transaction);
    setEditMethod(transaction.paymentMethod);
    setEditStatus(transaction.paymentMethod === "gcash" ? "paid" : transaction.paymentStatus);
  };

  // Save payment changes.
  const savePayment = async () => {
    if (!editingTransaction) return;

    setSaving(true);

    const table = editingTransaction.type === "room" ? "reservations" : "food_orders";

    // GCash always means paid.
    const finalStatus = editMethod === "gcash" ? "paid" : editStatus;

    const { data, error } = await supabase
      .from(table)
      .update({
        payment_status: finalStatus,
        payment_method: editMethod,
      })
      .eq("id", editingTransaction.id)
      .select("id");

    setSaving(false);

    if (error) {
      toast.error(errMsg(error));
      return;
    }

    if (!data?.length) {
      toast.error("Payment details were not updated.");
      return;
    }

    toast.success("Payment details updated successfully.");
    setEditingTransaction(null);

    qc.invalidateQueries({ queryKey: ["admin-res"] });
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  // Mark any unpaid transaction as paid, regardless of payment method.
  const markAsPaid = async (transaction: TransactionRecord) => {
    setMarkingPaidId(transaction.id);

    const table = transaction.type === "room" ? "reservations" : "food_orders";

    const { data, error } = await supabase
      .from(table)
      .update({ payment_status: "paid" })
      .eq("id", transaction.id)
      .select("id");

    setMarkingPaidId(null);

    if (error) {
      toast.error(errMsg(error));
      return;
    }

    if (!data?.length) {
      toast.error("Payment status was not updated.");
      return;
    }

    toast.success("Payment marked as paid.");

    qc.invalidateQueries({ queryKey: ["admin-res"] });
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  const hasActiveFilters = status !== "all" || method !== "all";

  const renderTransaction = (t: TransactionRecord) => (
    <div
      key={t.id}
      className={`rounded-xl border border-border bg-card ${
        viewMode === "grid"
          ? "flex flex-col gap-4 p-4"
          : "flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between"
      }`}
    >
      {/* TRANSACTION INFORMATION */}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold">{t.reference}</p>

        <div>
          <span
            className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${
              t.paymentMethod === "gcash"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {t.paymentMethod === "gcash" ? "GCash" : "Cash"}
          </span>
        </div>

        <p className="pt-1 text-sm font-medium">
          {t.customer} · {t.room}
          {t.roomNumber ? ` (${t.roomNumber})` : ""}
        </p>

        <p className="text-xs text-muted-foreground">
          {t.type === "room" ? "Reservation date" : "Submitted"}: {t.date}
        </p>

        <p className="text-xl font-bold">{peso(t.amount)}</p>
      </div>

      {/* ACTIONS */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 lg:min-w-[190px] lg:border-t-0 lg:pt-0">
        {/* DETAILS ON THE LEFT */}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-2"
          onClick={() => setSelectedTransaction(t)}
        >
          <Eye className="h-4 w-4" />
          Details
        </Button>

        {/* PAYMENT STATUS OR ACTION ON THE RIGHT */}
        <div className="flex items-center justify-end">
          {t.paymentStatus === "paid" ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              PAID
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="default"
              className="gap-1.5 font-bold"
              disabled={markingPaidId === t.id}
              onClick={() => markAsPaid(t)}
            >
              <CheckCircle2 className="h-4 w-4" />
              {markingPaidId === t.id ? "Saving..." : "Mark Paid"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mt-4 space-y-6">
      {/* PAGE HEADER */}
      <div>
        <h1 className="font-display text-2xl font-bold">Transactions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor and manage room reservation and food order payments.
        </p>
      </div>

      {/* REVENUE SUMMARY */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Collected</p>
          <p className="mt-1 font-display text-2xl font-bold">{peso(totalRevenue)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Room and food payments</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Room Revenue</p>
          <p className="mt-1 font-display text-2xl font-bold">{peso(roomRevenue)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Collected reservation payments</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Food Revenue</p>
          <p className="mt-1 font-display text-2xl font-bold">{peso(foodRevenue)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Collected food order payments</p>
        </div>
      </div>

      {/* MAIN TABS */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <Button
          type="button"
          variant={activeTab === "room" ? "default" : "outline"}
          onClick={() => changeTab("room")}
        >
          Room Payments
        </Button>

        <Button
          type="button"
          variant={activeTab === "food" ? "default" : "outline"}
          onClick={() => changeTab("food")}
        >
          Food Payments
        </Button>
      </div>

      {/* TRANSACTIONS */}
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold">
            {activeTab === "room" ? "Room Transactions" : "Food Transactions"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {activeTab === "room"
              ? "Manage payments collected for room reservations."
              : "Manage payments collected for food orders."}
          </p>
        </div>

        {/* SEARCH, FILTER, VIEW */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder={
              activeTab === "room"
                ? "Search reservation or customer..."
                : "Search order, reservation or customer..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:flex-1"
          />

          <Button type="button" variant="outline" onClick={openFilters} className="gap-2">
            <Filter className="h-4 w-4" />
            Filter
            {hasActiveFilters && (
              <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {(status !== "all" ? 1 : 0) + (method !== "all" ? 1 : 0)}
              </span>
            )}
          </Button>

          <div className="flex items-center rounded-md border border-border p-1">
            <Button
              type="button"
              size="icon"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              title="Grid view"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              size="icon"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              title="List view"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* FILTER MODAL */}
        <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-xl">Filter Transactions</DialogTitle>
              <DialogDescription>
                Select the payment status and method to display.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-3">
              <div className="space-y-2">
                <Label htmlFor="payment-status-filter">Payment Status</Label>
                <select
                  id="payment-status-filter"
                  value={draftStatus}
                  onChange={(e) => setDraftStatus(e.target.value as PaymentStatus)}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All Statuses</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-method-filter">Payment Method</Label>
                <select
                  id="payment-method-filter"
                  value={draftMethod}
                  onChange={(e) => setDraftMethod(e.target.value as PaymentMethod)}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All Methods</option>
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                </select>
              </div>
            </div>

            <DialogFooter className="flex flex-row justify-between gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={clearFilters}>
                Clear
              </Button>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setFilterOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={applyFilters}>
                  Apply Filters
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* TRANSACTION RECORDS */}
        {filteredTransactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="font-medium">No transactions found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try changing your search or filters.
            </p>
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3"
                : "flex flex-col gap-3"
            }
          >
            {filteredTransactions.map(renderTransaction)}
          </div>
        )}
      </div>

      {/* DETAILS DIALOG */}
      <Dialog
        open={!!selectedTransaction}
        onOpenChange={(open) => {
          if (!open) setSelectedTransaction(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          {selectedTransaction && (
            <>
              <DialogHeader>
                <DialogTitle>Transaction Details</DialogTitle>
                <DialogDescription>
                  Complete payment information for this transaction.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-3">
                <div className="rounded-xl bg-muted/50 p-4">
                  <p className="text-xs text-muted-foreground">Transaction Reference</p>
                  <p className="mt-1 font-semibold">{selectedTransaction.reference}</p>
                  <p className="mt-3 text-2xl font-bold">{peso(selectedTransaction.amount)}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {selectedTransaction.paymentStatus === "paid" ? (
                      <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-600">
                        PAID
                      </span>
                    ) : (
                      <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-600">
                        UNPAID
                      </span>
                    )}

                    <span className="rounded-md bg-background px-2 py-1 text-xs font-semibold">
                      {selectedTransaction.paymentMethod === "gcash" ? "GCash" : "Cash"}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold">Customer Information</h3>
                  <DetailRow label="Customer" value={selectedTransaction.customer} />
                  <DetailRow label="Email" value={selectedTransaction.email} />
                  <DetailRow label="Phone" value={selectedTransaction.phone} />
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold">
                    {selectedTransaction.type === "room"
                      ? "Reservation Information"
                      : "Food Order Information"}
                  </h3>
                  <DetailRow label="Reference" value={selectedTransaction.reservationReference} />
                  <DetailRow
                    label="Room"
                    value={`${selectedTransaction.room} ${
                      selectedTransaction.roomNumber ? `(${selectedTransaction.roomNumber})` : ""
                    }`}
                  />
                  <DetailRow
                    label={selectedTransaction.type === "room" ? "Reservation date" : "Submitted"}
                    value={selectedTransaction.date}
                  />
                  <DetailRow label="Record status" value={selectedTransaction.recordStatus} />
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold">Payment Information</h3>
                  <DetailRow
                    label="Payment method"
                    value={selectedTransaction.paymentMethod === "gcash" ? "GCash" : "Cash"}
                  />
                  <DetailRow
                    label="Payment status"
                    value={selectedTransaction.paymentStatus.toUpperCase()}
                  />
                  <DetailRow label="Payer name" value={selectedTransaction.payerName} />
                  <DetailRow label="Payer account" value={selectedTransaction.payerAccount} />
                  <DetailRow
                    label="Payment reference"
                    value={selectedTransaction.paymentReference}
                  />
                </div>
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
            <DialogDescription>Update the payment status and payment method.</DialogDescription>
          </DialogHeader>

          {editingTransaction && (
            <div className="space-y-5 py-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Transaction Reference</p>
                <p className="font-semibold">{editingTransaction.reference}</p>
                <p className="mt-1 text-sm">{editingTransaction.customer}</p>
                <p className="font-semibold">{peso(editingTransaction.amount)}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-payment-method">Payment Method</Label>
                <select
                  id="edit-payment-method"
                  value={editMethod}
                  onChange={(e) => {
                    const value = e.target.value as "cash" | "gcash";
                    setEditMethod(value);

                    // Selecting GCash automatically marks it paid.
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

            <Button type="button" onClick={savePayment} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
