import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ReceiptText } from "lucide-react";

import { StatusBadge, PaymentMethodBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { errMsg, peso } from "@/lib/afterglow";

import type { OrderRow, FoStatus } from "./shared";
import { dateCls, fmtStamp, selectCls } from "./ReservationDetail";

const ORDER_STATUSES: FoStatus[] = ["pending", "confirmed", "served", "cancelled"];

const STATUS_LABELS: Record<FoStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  served: "Served",
  cancelled: "Cancelled",
};

type PaymentStatus = "paid" | "unpaid";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function totalQuantity(order: OrderRow) {
  return order.food_order_items.reduce((sum, item) => sum + item.quantity, 0);
}

function orderCustomer(order: OrderRow) {
  return order.profiles?.full_name || "Guest";
}

export function Orders({ orders }: { orders: OrderRow[] }) {
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | FoStatus>("all");
  const [payment, setPayment] = useState<"all" | PaymentStatus>("all");
  const [date, setDate] = useState("");
  const [sort, setSort] = useState<"submitted" | "booking">("submitted");

  const [openId, setOpenId] = useState<string | null>(null);

  const [selectedStatuses, setSelectedStatuses] = useState<Record<string, FoStatus>>({});

  const [selectedPayments, setSelectedPayments] = useState<Record<string, PaymentStatus>>({});

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const open = orders.find((order) => order.id === openId) ?? null;

  const list = useMemo(() => {
    const search = q.trim().toLowerCase();

    return orders
      .filter((order) => status === "all" || order.status === status)
      .filter((order) => payment === "all" || order.payment_status === payment)
      .filter((order) => !date || (order.submitted_at || order.created_at).slice(0, 10) === date)
      .filter((order) => {
        if (!search) return true;

        const profile = order.profiles;
        const reservation = order.reservations;

        return [
          order.reference_code,
          reservation?.reference_code,
          profile?.full_name,
          profile?.email,
          profile?.phone,
        ].some((value) => value?.toLowerCase().includes(search));
      })
      .sort((a, b) =>
        sort === "submitted"
          ? (b.submitted_at || b.created_at).localeCompare(a.submitted_at || a.created_at)
          : (b.reservations?.booking_date ?? "").localeCompare(a.reservations?.booking_date ?? ""),
      );
  }, [orders, q, status, payment, date, sort]);

  // Update food order status.
  const updateStatus = async (order: OrderRow) => {
    const newStatus = selectedStatuses[order.id] ?? order.status;

    if (newStatus === order.status) return;

    // An order must be paid before it can be served.
    if (newStatus === "served" && order.payment_status !== "paid") {
      toast.error("This food order must be paid before it can be marked as served.");
      return;
    }

    if (
      newStatus === "cancelled" &&
      !window.confirm(`Are you sure you want to cancel food order ${order.reference_code}?`)
    ) {
      return;
    }

    setUpdatingId(order.id);

    try {
      const updateData =
        newStatus === "served"
          ? {
              status: newStatus,
              served_at: new Date().toISOString(),
            }
          : {
              status: newStatus,
            };

      const { data, error } = await supabase
        .from("food_orders")
        .update(updateData)
        .eq("id", order.id)
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error("The order could not be updated. Refresh and try again.");
      }

      toast.success(`Food order status updated to ${STATUS_LABELS[newStatus]}.`);

      setSelectedStatuses((previous) => {
        const updated = { ...previous };
        delete updated[order.id];
        return updated;
      });

      await qc.invalidateQueries({
        queryKey: ["admin-orders"],
      });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setUpdatingId(null);
    }
  };

  // Update food order payment independently.
  const updatePayment = async (order: OrderRow) => {
    const newPayment = selectedPayments[order.id] ?? order.payment_status;

    if (newPayment === order.payment_status) return;

    // A served order cannot be changed back to unpaid.
    if (newPayment === "unpaid" && order.status === "served") {
      toast.error("A served food order cannot be marked as unpaid.");
      return;
    }

    setUpdatingId(order.id);

    try {
      const { data, error } = await supabase
        .from("food_orders")
        .update({ payment_status: newPayment })
        .eq("id", order.id)
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error("Food order payment could not be updated. Refresh and try again.");
      }

      toast.success(
        newPayment === "paid" ? "Food order payment recorded." : "Food order marked as unpaid.",
      );

      setSelectedPayments((previous) => {
        const updated = { ...previous };
        delete updated[order.id];
        return updated;
      });

      await qc.invalidateQueries({
        queryKey: ["admin-orders"],
      });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setUpdatingId(null);
    }
  };

  const clearFilters = () => {
    setQ("");
    setStatus("all");
    setPayment("all");
    setDate("");
    setSort("submitted");
  };

  return (
    <div className="mt-4 space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold">Food Orders</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review food orders, manage their status, and record food payments.
        </p>
      </div>

      {/* Search and filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="min-w-56 flex-1">
          <Label htmlFor="orders-search">Search</Label>
          <Input
            id="orders-search"
            placeholder="Order ID, reservation ID, name, email or phone"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="orders-status">Status</Label>
          <select
            id="orders-status"
            className={selectCls + " block"}
            value={status}
            onChange={(event) => setStatus(event.target.value as "all" | FoStatus)}
          >
            <option value="all">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="orders-payment">Payment</Label>
          <select
            id="orders-payment"
            className={selectCls + " block"}
            value={payment}
            onChange={(event) => setPayment(event.target.value as "all" | PaymentStatus)}
          >
            <option value="all">All payments</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        <div>
          <Label htmlFor="orders-date">Submitted date</Label>
          <Input
            id="orders-date"
            type="date"
            className={dateCls}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="orders-sort">Sort by</Label>
          <select
            id="orders-sort"
            className={selectCls + " block"}
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
          >
            <option value="submitted">Date submitted</option>
            <option value="booking">Booking date</option>
          </select>
        </div>

        <Button variant="outline" onClick={clearFilters}>
          Clear filters
        </Button>
      </div>

      {/* Orders table */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Orders</h3>
        <p className="text-sm text-muted-foreground">{list.length} result(s)</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-secondary/50 text-left text-muted-foreground">
            <tr>
              {[
                "Order ID",
                "Customer",
                "Contact",
                "Room",
                "Booking date",
                "Items",
                "Total",
                "Status",
                "Payment",
                "Submitted",
                "Action",
              ].map((header) => (
                <th key={header} className="p-3 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={11} className="p-5 text-center text-muted-foreground">
                  No food orders match your filters.
                </td>
              </tr>
            )}

            {list.map((order) => {
              const roomInfo = order.reservations?.rooms;

              return (
                <tr key={order.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="p-3 font-medium">{order.reference_code}</td>

                  <td className="p-3">{orderCustomer(order)}</td>

                  <td className="p-3">{order.profiles?.phone || order.profiles?.email || "—"}</td>

                  <td className="p-3">{roomInfo?.name ?? "—"}</td>

                  <td className="p-3">{formatDate(order.reservations?.booking_date)}</td>

                  <td className="p-3">{totalQuantity(order)}</td>

                  <td className="p-3 font-medium">{peso(order.food_subtotal)}</td>

                  <td className="p-3">
                    <StatusBadge status={order.status} />
                  </td>

                  <td className="p-3">
                    <StatusBadge status={order.payment_status} />
                  </td>

                  <td className="p-3 text-muted-foreground">
                    {fmtStamp(order.submitted_at || order.created_at)}
                  </td>

                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setOpenId(order.id)}>
                      View details
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Order details and management */}
      <Dialog
        open={!!open}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenId(null);
        }}
      >
        {open && (
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ReceiptText className="h-5 w-5" />
                Food order details
              </DialogTitle>
              <DialogDescription>{open.reference_code}</DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              {/* Customer and reservation information */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-medium">{orderCustomer(open)}</p>
                  {open.profiles?.email && (
                    <p className="text-xs text-muted-foreground">{open.profiles.email}</p>
                  )}
                </div>

                <div>
                  <p className="text-muted-foreground">Contact number</p>
                  <p className="font-medium">{open.profiles?.phone || "—"}</p>
                </div>

                <div>
                  <p className="text-muted-foreground">Room</p>
                  <p className="font-medium">
                    {open.reservations?.rooms
                      ? `${open.reservations.rooms.room_number} · ${open.reservations.rooms.name}`
                      : "—"}
                  </p>
                </div>

                <div>
                  <p className="text-muted-foreground">Reservation ID</p>
                  <p className="font-medium">{open.reservations?.reference_code ?? "—"}</p>
                </div>

                <div>
                  <p className="text-muted-foreground">Order type</p>
                  <p className="font-medium">
                    {open.order_type === "pre_order" ? "Pre-order" : "In-room order"}
                  </p>
                </div>

                <div>
                  <p className="text-muted-foreground">Submitted</p>
                  <p className="font-medium">
                    {formatDateTime(open.submitted_at || open.created_at)}
                  </p>
                </div>
              </div>

              {/* Ordered items */}
              <div>
                <h3 className="mb-3 font-semibold">Ordered items</h3>

                <div className="space-y-3">
                  {open.food_order_items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium">{item.item_name_snapshot}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × {peso(item.unit_price_snapshot)}
                        </p>
                      </div>

                      <p className="font-medium">{peso(item.line_total)}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex justify-between border-t border-border pt-3 font-semibold">
                  <span>Food subtotal</span>
                  <span className="text-primary">{peso(open.food_subtotal)}</span>
                </div>
              </div>

              {/* Special instructions */}
              {open.special_instructions && (
                <div className="rounded-lg bg-secondary/50 p-3">
                  <p className="text-sm font-semibold">Special instructions</p>
                  <p className="mt-1 text-sm text-muted-foreground">{open.special_instructions}</p>
                </div>
              )}

              {/* Order status management */}
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">Order status</h3>
                  <StatusBadge status={open.status} />
                </div>

                <Label htmlFor="food-order-status">Change order status</Label>

                <select
                  id="food-order-status"
                  className={selectCls + " block w-full"}
                  value={selectedStatuses[open.id] ?? open.status}
                  disabled={updatingId === open.id}
                  onChange={(event) =>
                    setSelectedStatuses((previous) => ({
                      ...previous,
                      [open.id]: event.target.value as FoStatus,
                    }))
                  }
                >
                  {ORDER_STATUSES.map((s) => (
                    <option
                      key={s}
                      value={s}
                      disabled={s === "served" && open.payment_status !== "paid"}
                    >
                      {STATUS_LABELS[s]}
                      {s === "served" && open.payment_status !== "paid"
                        ? " (Payment required)"
                        : ""}
                    </option>
                  ))}
                </select>

                {open.payment_status !== "paid" && (
                  <p className="text-xs text-muted-foreground">
                    The order must be marked as Paid before it can be marked as Served.
                  </p>
                )}

                <Button
                  size="sm"
                  className="w-full"
                  disabled={
                    updatingId === open.id ||
                    (selectedStatuses[open.id] ?? open.status) === open.status ||
                    ((selectedStatuses[open.id] ?? open.status) === "served" &&
                      open.payment_status !== "paid")
                  }
                  onClick={() => void updateStatus(open)}
                >
                  {updatingId === open.id ? "Updating..." : "Save order status"}
                </Button>
              </div>

              {/* Food order payment management */}
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">Food order payment</h3>
                  <StatusBadge status={open.payment_status} />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Payment method:</span>
                  <PaymentMethodBadge method={open.payment_method} />
                </div>

                {open.payer_name && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Payer: </span>
                    {open.payer_name}
                  </p>
                )}

                {open.payer_account_number && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Account number: </span>
                    {open.payer_account_number}
                  </p>
                )}

                {open.payment_reference && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Payment reference: </span>
                    {open.payment_reference}
                  </p>
                )}

                <div>
                  <Label htmlFor="food-payment-status">Update food payment status</Label>

                  <select
                    id="food-payment-status"
                    className={selectCls + " mt-1 block w-full"}
                    value={selectedPayments[open.id] ?? open.payment_status}
                    disabled={updatingId === open.id}
                    onChange={(event) =>
                      setSelectedPayments((previous) => ({
                        ...previous,
                        [open.id]: event.target.value as PaymentStatus,
                      }))
                    }
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={
                    updatingId === open.id ||
                    (selectedPayments[open.id] ?? open.payment_status) === open.payment_status ||
                    ((selectedPayments[open.id] ?? open.payment_status) === "unpaid" &&
                      open.status === "served")
                  }
                  onClick={() => void updatePayment(open)}
                >
                  {updatingId === open.id ? "Updating..." : "Save food payment status"}
                </Button>

                {open.status === "served" && (
                  <p className="text-xs text-muted-foreground">
                    A served order cannot be marked as Unpaid.
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  This payment applies only to this food order. Reservation payment is managed
                  separately under Reservations & Rooms.
                </p>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
