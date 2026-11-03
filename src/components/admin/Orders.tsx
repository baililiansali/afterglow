import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Filter, LayoutGrid, List, Search, Plus, Trash2, Eye, Pencil } from "lucide-react";

import { StatusBadge, PaymentMethodBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { errMsg, peso, fmtDate } from "@/lib/afterglow";
import { menuQuery } from "@/lib/queries";

import type { OrderRow, FoStatus } from "./shared";
import { dateCls, fmtStamp, selectCls } from "./ReservationDetail";

type ViewMode = "list" | "grid";
type PaymentStatus = "paid" | "unpaid";
type SortMode = "submitted" | "booking";

type OrderItem = OrderRow["food_order_items"][number];

type EditableItem = {
  id: string;
  menu_item_id: string | null;
  item_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  isNew: boolean;
};

type AddOrderReservation = {
  id: string;
  reference_code: string;
  user_id: string;
  booking_date: string;
  status: string;
  customer_name: string;
};

const ORDER_STATUSES: FoStatus[] = [
  "pending",
  "confirmed",
  "served",
  "cancelled",
];

const STATUS_LABELS: Record<FoStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};

const ADD_ORDER_STATUSES = ["checked_in"];

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

function createEditableItems(items: OrderItem[]): EditableItem[] {
  return items.map((item) => ({
    id: item.id,
    menu_item_id: item.menu_item_id,
    item_name_snapshot: item.item_name_snapshot,
    unit_price_snapshot: Number(item.unit_price_snapshot),
    quantity: Number(item.quantity),
    isNew: false,
  }));
}

export function Orders({ orders }: { orders: OrderRow[] }) {
  const qc = useQueryClient();

  const { data: menuData } = useQuery(menuQuery);

  const { data: reservationOptions = [], isLoading: loadingReservations } = useQuery({
    queryKey: ["admin-order-reservations"],
    queryFn: async (): Promise<AddOrderReservation[]> => {
      const { data: reservations, error } = await supabase
        .from("reservations")
        .select("id, reference_code, user_id, booking_date, status")
        .in("status", ADD_ORDER_STATUSES)
        .order("booking_date", { ascending: false });

      if (error) throw error;

      if (!reservations?.length) return [];

      const userIds = [...new Set(reservations.map((reservation) => reservation.user_id))];

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      if (profileError) throw profileError;

      const profileMap = new Map(
        (profiles ?? []).map((profile) => [profile.id, profile.full_name || "Guest"]),
      );

      return reservations.map((reservation) => ({
        ...reservation,
        customer_name: profileMap.get(reservation.user_id) ?? "Guest",
      }));
    },
  });

  // Search and filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | FoStatus>("all");
  const [payment, setPayment] = useState<"all" | PaymentStatus>("all");
  const [date, setDate] = useState("");
  const [sort, setSort] = useState<SortMode>("submitted");

  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("list");
  const [open, setOpen] = useState<OrderRow | null>(null);

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Edit order states
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null);
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [selectedMenuItem, setSelectedMenuItem] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Add order states
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const [newReservationId, setNewReservationId] = useState("");
  const [newOrderItems, setNewOrderItems] = useState<EditableItem[]>([]);
  const [newSelectedMenuItem, setNewSelectedMenuItem] = useState("");
  const [newSpecialInstructions, setNewSpecialInstructions] = useState("");
  const [savingNewOrder, setSavingNewOrder] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const activeFilterCount = [status !== "all", payment !== "all", sort !== "submitted"].filter(
    Boolean,
  ).length;

  const availableMenuItems = useMemo(
    () => (menuData?.items ?? []).filter((item) => item.is_available),
    [menuData?.items],
  );

  // Filter food orders
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
  }, [orders, status, payment, date, q, sort]);

  useEffect(() => {
    setPage(1);
  }, [q, status, payment, date, sort]);

  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));

  const currentPage = Math.min(page, totalPages);

  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, currentPage, pageSize]);

  const clearFilters = () => {
    setStatus("all");
    setPayment("all");
    setSort("submitted");
  };

  const selectedReservation = reservationOptions.find(
    (reservation) => reservation.id === newReservationId,
  );

  const newOrderSubtotal = useMemo(
    () => newOrderItems.reduce((sum, item) => sum + item.unit_price_snapshot * item.quantity, 0),
    [newOrderItems],
  );

  // Cancel food order
  const cancelOrder = async (order: OrderRow) => {
    if (order.status === "cancelled") return;

    if (!window.confirm(`Are you sure you want to cancel food order ${order.reference_code}?`)) {
      return;
    }

    setUpdatingId(order.id);

    try {
      const { data, error } = await supabase
        .from("food_orders")
        .update({ status: "cancelled" })
        .eq("id", order.id)
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error("The food order could not be cancelled. Refresh and try again.");
      }

      toast.success("Food order cancelled.");

      if (open?.id === order.id) setOpen(null);
      if (editOrder?.id === order.id) setEditOrder(null);

      await qc.invalidateQueries({
        queryKey: ["admin-orders"],
      });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setUpdatingId(null);
    }
  };

  // Mark food order as paid
  const markPaid = async (order: OrderRow) => {
    if (order.payment_status === "paid") return;

    if (order.status === "cancelled") {
      toast.error("A cancelled food order cannot be marked as paid.");
      return;
    }

    setUpdatingId(order.id);

    try {
      const { data, error } = await supabase
        .from("food_orders")
        .update({ payment_status: "paid" })
        .eq("id", order.id)
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error("Food order payment could not be updated. Refresh and try again.");
      }

      toast.success("Food order payment recorded.");

      await qc.invalidateQueries({
        queryKey: ["admin-orders"],
      });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setUpdatingId(null);
    }
  };

  // Open Edit dialog
  const startEdit = (order: OrderRow) => {
    setEditOrder(order);
    setEditItems(createEditableItems(order.food_order_items));
    setSpecialInstructions(order.special_instructions ?? "");
    setSelectedMenuItem("");
  };

  // Add menu item to existing order
  const addMenuItem = () => {
    if (!selectedMenuItem) {
      toast.error("Please select a menu item.");
      return;
    }

    const menuItem = availableMenuItems.find((item) => item.id === selectedMenuItem);

    if (!menuItem) {
      toast.error("This menu item is no longer available.");
      return;
    }

    setEditItems((current) => {
      const existingIndex = current.findIndex((item) => item.menu_item_id === menuItem.id);

      if (existingIndex !== -1) {
        return current.map((item, index) =>
          index === existingIndex ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [
        ...current,
        {
          id: `new-${menuItem.id}-${Date.now()}`,
          menu_item_id: menuItem.id,
          item_name_snapshot: menuItem.name,
          unit_price_snapshot: Number(menuItem.price),
          quantity: 1,
          isNew: true,
        },
      ];
    });

    setSelectedMenuItem("");
  };

  const changeQuantity = (id: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 1) return;

    setEditItems((current) =>
      current.map((item) => (item.id === id ? { ...item, quantity } : item)),
    );
  };

  const removeItem = (id: string) => {
    setEditItems((current) => current.filter((item) => item.id !== id));
  };

  const editedSubtotal = useMemo(
    () =>
      editItems.reduce(
        (sum, item) => sum + Number(item.unit_price_snapshot) * Number(item.quantity),
        0,
      ),
    [editItems],
  );

  // Reset Add Order form
  const resetNewOrder = () => {
    setNewReservationId("");
    setNewOrderItems([]);
    setNewSelectedMenuItem("");
    setNewSpecialInstructions("");
  };

  // Add menu item to new order
  const addNewOrderItem = () => {
    if (!newSelectedMenuItem) {
      toast.error("Please select a menu item.");
      return;
    }

    const menuItem = availableMenuItems.find((item) => item.id === newSelectedMenuItem);

    if (!menuItem) {
      toast.error("This menu item is no longer available.");
      return;
    }

    setNewOrderItems((current) => {
      const existingIndex = current.findIndex((item) => item.menu_item_id === menuItem.id);

      if (existingIndex !== -1) {
        return current.map((item, index) =>
          index === existingIndex ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [
        ...current,
        {
          id: `new-${menuItem.id}-${Date.now()}`,
          menu_item_id: menuItem.id,
          item_name_snapshot: menuItem.name,
          unit_price_snapshot: Number(menuItem.price),
          quantity: 1,
          isNew: true,
        },
      ];
    });

    setNewSelectedMenuItem("");
  };

  const changeNewOrderQuantity = (id: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 1) return;

    setNewOrderItems((current) =>
      current.map((item) => (item.id === id ? { ...item, quantity } : item)),
    );
  };

  const removeNewOrderItem = (id: string) => {
    setNewOrderItems((current) => current.filter((item) => item.id !== id));
  };

  // Create new food order
  const saveNewOrder = async () => {
    if (!selectedReservation || selectedReservation.status !== "checked_in") {
      toast.error("Please select a checked-in reservation.");
      return;
    }

    if (newOrderItems.length === 0) {
      toast.error("Please add at least one food item.");
      return;
    }

    if (
      newOrderItems.some(
        (item) =>
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          !Number.isFinite(item.unit_price_snapshot) ||
          item.unit_price_snapshot < 0,
      )
    ) {
      toast.error("Please check the item quantities and prices.");
      return;
    }

    setSavingNewOrder(true);

    try {
      const referenceCode = `FO-${Date.now()}`;

      const { data: createdOrder, error: orderError } = await supabase
        .from("food_orders")
        .insert({
          reference_code: referenceCode,
          user_id: selectedReservation.user_id,
          reservation_id: selectedReservation.id,
          order_type: "in_room",
          food_subtotal: newOrderSubtotal,
          special_instructions: newSpecialInstructions.trim() || null,
          status: "pending",
          payment_status: "unpaid",
          payment_method: "cash",
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      const { error: itemsError } = await supabase.from("food_order_items").insert(
        newOrderItems.map((item) => ({
          food_order_id: createdOrder.id,
          menu_item_id: item.menu_item_id,
          item_name_snapshot: item.item_name_snapshot,
          unit_price_snapshot: item.unit_price_snapshot,
          quantity: item.quantity,
          line_total: item.unit_price_snapshot * item.quantity,
        })),
      );

      if (itemsError) {
        const { error: rollbackError } = await supabase
          .from("food_orders")
          .delete()
          .eq("id", createdOrder.id);

        if (rollbackError) {
          throw new Error(
            `The order was created, but its items could not be saved. Manual cleanup may be needed. ${errMsg(itemsError)}`,
          );
        }

        throw itemsError;
      }

      toast.success("Food order created successfully.");

      setAddOrderOpen(false);
      resetNewOrder();

      await qc.invalidateQueries({
        queryKey: ["admin-orders"],
      });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setSavingNewOrder(false);
    }
  };

  // Save edited food order
  const saveEdit = async () => {
    if (!editOrder) return;

    if (editItems.length === 0) {
      toast.error("A food order must contain at least one item.");
      return;
    }

    if (
      editItems.some(
        (item) =>
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          !Number.isFinite(item.unit_price_snapshot) ||
          item.unit_price_snapshot < 0,
      )
    ) {
      toast.error("Please check the item quantities and prices.");
      return;
    }

    setSavingEdit(true);

    try {
      const originalIds = new Set(editOrder.food_order_items.map((item) => item.id));

      const currentIds = new Set(editItems.filter((item) => !item.isNew).map((item) => item.id));

      const removedIds = [...originalIds].filter((id) => !currentIds.has(id));

      if (removedIds.length > 0) {
        const { error } = await supabase.from("food_order_items").delete().in("id", removedIds);

        if (error) throw error;
      }

      for (const item of editItems.filter((entry) => !entry.isNew)) {
        const { data, error } = await supabase
          .from("food_order_items")
          .update({
            quantity: item.quantity,
            line_total: item.unit_price_snapshot * item.quantity,
          })
          .eq("id", item.id)
          .select("id");

        if (error) throw error;

        if (!data?.length) {
          throw new Error(`Could not update ${item.item_name_snapshot}. Refresh and try again.`);
        }
      }

      const newItems = editItems.filter((item) => item.isNew);

      if (newItems.length > 0) {
        const { error } = await supabase.from("food_order_items").insert(
          newItems.map((item) => ({
            food_order_id: editOrder.id,
            menu_item_id: item.menu_item_id,
            item_name_snapshot: item.item_name_snapshot,
            unit_price_snapshot: item.unit_price_snapshot,
            quantity: item.quantity,
            line_total: item.unit_price_snapshot * item.quantity,
          })),
        );

        if (error) throw error;
      }

      const { data, error } = await supabase
        .from("food_orders")
        .update({
          food_subtotal: editedSubtotal,
          special_instructions: specialInstructions.trim() || null,
        })
        .eq("id", editOrder.id)
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error("The food order could not be updated. Refresh and try again.");
      }

      toast.success("Food order updated.");
      setEditOrder(null);

      await qc.invalidateQueries({
        queryKey: ["admin-orders"],
      });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setSavingEdit(false);
    }
  };

  // List view payment column
  const paymentDisplay = (order: OrderRow) => {
    const isUpdating = updatingId === order.id;

    if (order.status === "cancelled") {
      return <StatusBadge status="cancelled" />;
    }

    if (order.payment_status === "paid") {
      return <StatusBadge status="paid" />;
    }

    return (
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          className="bg-pink-600 text-white hover:bg-pink-700"
          disabled={isUpdating}
          onClick={() => void markPaid(order)}
        >
          {isUpdating ? "Updating..." : "Mark Paid"}
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
          disabled={isUpdating}
          onClick={() => void cancelOrder(order)}
        >
          Cancel
        </Button>
      </div>
    );
  };

  // Grid top-right: payment actions or payment badge
  const gridPaymentDisplay = (order: OrderRow) => {
    const isUpdating = updatingId === order.id;

    if (order.status === "cancelled") {
      return <StatusBadge status="cancelled" />;
    }

    if (order.payment_status === "paid") {
      return <StatusBadge status="paid" />;
    }

    return (
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <Button
          size="sm"
          className="bg-pink-600 text-white hover:bg-pink-700"
          disabled={isUpdating}
          onClick={() => void markPaid(order)}
        >
          {isUpdating ? "Updating..." : "Mark Paid"}
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
          disabled={isUpdating}
          onClick={() => void cancelOrder(order)}
        >
          Cancel
        </Button>
      </div>
    );
  };

  // Details and Edit actions
  const actionDisplay = (order: OrderRow) => {
    if (view === "list") {
      return (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            title="View details"
            aria-label="View details"
            onClick={() => setOpen(order)}
          >
            <Eye className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            title="Edit order"
            aria-label="Edit order"
            onClick={() => startEdit(order)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(order)}>
          <Eye className="mr-1.5 h-4 w-4" />
          Details
        </Button>

        <Button size="sm" variant="outline" onClick={() => startEdit(order)}>
          <Pencil className="mr-1.5 h-4 w-4" />
          Edit
        </Button>
      </div>
    );
  };

  const headers = [
    "Order ID",
    "Customer",
    "Phone",
    "Email",
    "Room",
    "Booking Date",
    "Items",
    "Total",
    "Submitted",
    "Action",
    "Payment",
  ];

  return (
    <div className="mt-4 space-y-4">
      {/* Page heading */}
      <div>
        <h2 className="font-display text-xl font-bold">Food Orders</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Review food orders, manage food items, and record food payments.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              id="orders-q"
              className="pl-9"
              placeholder="Search order ID, reservation ID, name, email or phone..."
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>

          <Input
            id="orders-date"
            type="date"
            className={`${dateCls} w-auto min-w-[150px] [color-scheme:white]`}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />

          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <Filter className="mr-2 h-4 w-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-1">
            <Button
              size="sm"
              variant={view === "grid" ? "default" : "ghost"}
              onClick={() => setView("grid")}
            >
              <LayoutGrid className="mr-1.5 h-4 w-4" />
              Grid
            </Button>

            <Button
              size="sm"
              variant={view === "list" ? "default" : "ghost"}
              onClick={() => setView("list")}
            >
              <List className="mr-1.5 h-4 w-4" />
              List
            </Button>
          </div>
          <Button className="w-auto shrink-0" onClick={() => setAddOrderOpen(true)}>
            Add Order
          </Button>
        </div>
      </div>

      {/* List view */}
      {view === "list" && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-secondary/50 text-left text-muted-foreground">
              <tr>
                {headers.map((header) => (
                  <th
                    key={header}
                    className={`p-3 font-medium ${
                      header === "Payment" || header === "Action" ? "text-right" : ""
                    }`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={headers.length} className="p-5 text-center text-muted-foreground">
                    No food orders match.
                  </td>
                </tr>
              )}

              {paginatedList.map((order) => (
                <tr key={order.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="p-3 font-medium">{order.reference_code}</td>

                  <td className="p-3">{orderCustomer(order)}</td>

                  <td className="p-3">{order.profiles?.phone || "—"}</td>

                  <td className="p-3">{order.profiles?.email || "—"}</td>

                  <td className="p-3">{order.reservations?.rooms?.name ?? "—"}</td>

                  <td className="p-3">
                    {order.reservations?.booking_date
                      ? fmtDate(order.reservations.booking_date)
                      : "—"}
                  </td>

                  <td className="p-3">{totalQuantity(order)}</td>

                  <td className="p-3 font-medium">{peso(order.food_subtotal)}</td>

                  <td className="p-3 text-muted-foreground">
                    {order.submitted_at || order.created_at
                      ? fmtDate(order.submitted_at || order.created_at)
                      : "—"}
                  </td>

                  <td className="p-3">{actionDisplay(order)}</td>

                  <td className="p-3 text-right">{paymentDisplay(order)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Grid view */}
      {view === "grid" && (
        <>
          {list.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No food orders match.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {paginatedList.map((order) => (
                <div key={order.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{order.reference_code}</p>

                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {orderCustomer(order)}
                      </p>
                    </div>

                    {gridPaymentDisplay(order)}
                  </div>

                  <div className="my-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Room</p>

                      <p className="mt-1 font-medium">{order.reservations?.rooms?.name ?? "—"}</p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">Phone Number</p>

                      <p className="mt-1 font-medium">{order.profiles?.phone || "—"}</p>
                    </div>

                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Email</p>

                      <p className="mt-1 break-all font-medium">{order.profiles?.email || "—"}</p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">Booking date</p>

                      <p className="mt-1 font-medium">
                        {order.reservations?.booking_date
                          ? fmtDate(order.reservations.booking_date)
                          : "—"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">Items</p>

                      <p className="mt-1 font-medium">{totalQuantity(order)}</p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>

                      <p className="mt-1 font-semibold">{peso(order.food_subtotal)}</p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">Submitted</p>

                      <p className="mt-1 font-medium">
                        {order.submitted_at || order.created_at
                          ? fmtDate(order.submitted_at || order.created_at)
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 border-t border-border pt-3">
                    {actionDisplay(order)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      <Pagination
        page={currentPage}
        pageSize={pageSize}
        totalItems={list.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {/* Add Food Order */}
      <Dialog
        open={addOrderOpen}
        onOpenChange={(isOpen) => {
          if (!savingNewOrder) {
            setAddOrderOpen(isOpen);

            if (!isOpen) resetNewOrder();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Food Order</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <section className="space-y-3">
              <h3 className="font-semibold">Reservation Information</h3>

              <div>
                <Label htmlFor="new-order-reservation">Select Reservation</Label>

                <select
                  id="new-order-reservation"
                  className={selectCls + " mt-1 block w-full"}
                  value={newReservationId}
                  onChange={(event) => setNewReservationId(event.target.value)}
                  disabled={loadingReservations}
                >
                  <option value="">
                    {loadingReservations ? "Loading reservations..." : "Select a reservation..."}
                  </option>

                  {reservationOptions.map((reservation) => (
                    <option key={reservation.id} value={reservation.id}>
                      {reservation.reference_code} · {reservation.customer_name} ·{" "}
                      {fmtDate(reservation.booking_date)} · Checked In
                    </option>
                  ))}
                </select>

                {!loadingReservations && reservationOptions.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No checked-in reservations found.
                  </p>
                )}
              </div>

              {selectedReservation && (
                <div className="grid gap-3 rounded-lg border border-border bg-secondary/40 p-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Customer</p>

                    <p className="mt-1 text-sm font-medium">{selectedReservation.customer_name}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Reservation ID</p>

                    <p className="mt-1 text-sm font-medium">{selectedReservation.reference_code}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Booking Date</p>

                    <p className="mt-1 text-sm font-medium">
                      {fmtDate(selectedReservation.booking_date)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Reservation Status</p>

                    <p className="mt-1 text-sm font-medium capitalize">
                      {selectedReservation.status.replace("_", " ")}
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold">Food Items</h3>

              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  aria-label="Select food item for new order"
                  className={selectCls + " min-w-0 flex-1"}
                  value={newSelectedMenuItem}
                  onChange={(event) => setNewSelectedMenuItem(event.target.value)}
                >
                  <option value="">Select a menu item...</option>

                  {availableMenuItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {peso(item.price)}
                    </option>
                  ))}
                </select>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={addNewOrderItem}
                  disabled={!newSelectedMenuItem}
                >
                  Add Item
                </Button>
              </div>

              {availableMenuItems.length === 0 && (
                <p className="text-xs text-muted-foreground">No available menu items found.</p>
              )}

              <div className="overflow-hidden rounded-xl border border-border">
                {newOrderItems.length === 0 ? (
                  <p className="p-5 text-center text-sm text-muted-foreground">
                    No food items added yet.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {newOrderItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{item.item_name_snapshot}</p>

                          <p className="text-xs text-muted-foreground">
                            {peso(item.unit_price_snapshot)} each
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Label
                            htmlFor={`new-quantity-${item.id}`}
                            className="text-xs text-muted-foreground"
                          >
                            Qty
                          </Label>

                          <Input
                            id={`new-quantity-${item.id}`}
                            type="number"
                            min={1}
                            step={1}
                            className="h-9 w-20"
                            value={item.quantity}
                            onChange={(event) =>
                              changeNewOrderQuantity(item.id, Number(event.target.value))
                            }
                          />

                          <p className="w-24 text-right text-sm font-semibold">
                            {peso(item.unit_price_snapshot * item.quantity)}
                          </p>

                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10"
                            aria-label={`Remove ${item.item_name_snapshot}`}
                            onClick={() => removeNewOrderItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-border bg-secondary/50 p-3 font-semibold">
                  <span>Food Subtotal</span>
                  <span className="text-primary">{peso(newOrderSubtotal)}</span>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <Label htmlFor="new-order-instructions">Special Instructions</Label>

              <Textarea
                id="new-order-instructions"
                placeholder="Enter any special instructions..."
                rows={3}
                value={newSpecialInstructions}
                onChange={(event) => setNewSpecialInstructions(event.target.value)}
              />
            </section>

            <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={savingNewOrder}
                onClick={() => {
                  setAddOrderOpen(false);
                  resetNewOrder();
                }}
              >
                Cancel
              </Button>

              <Button
                type="button"
                disabled={
                  savingNewOrder ||
                  !newReservationId ||
                  !selectedReservation ||
                  selectedReservation.status !== "checked_in" ||
                  newOrderItems.length === 0
                }
                onClick={() => void saveNewOrder()}
              >
                {savingNewOrder ? "Creating Order..." : "Create Order"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filter dialog */}
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Food Order Filters</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="orders-status">Order status</Label>

              <select
                id="orders-status"
                className={selectCls + " mt-1 block w-full"}
                value={status}
                onChange={(event) => setStatus(event.target.value as "all" | FoStatus)}
              >
                <option value="all">All statuses</option>

                {ORDER_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {STATUS_LABELS[item]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="orders-payment">Payment</Label>

              <select
                id="orders-payment"
                className={selectCls + " mt-1 block w-full"}
                value={payment}
                onChange={(event) => setPayment(event.target.value as "all" | PaymentStatus)}
              >
                <option value="all">All payments</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div>
              <Label htmlFor="orders-sort">Sort by</Label>

              <select
                id="orders-sort"
                className={selectCls + " mt-1 block w-full"}
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
              >
                <option value="submitted">Date submitted</option>
                <option value="booking">Booking date</option>
              </select>
            </div>

            <div className="flex justify-between gap-2 border-t border-border pt-4">
              <Button variant="ghost" onClick={clearFilters}>
                Clear all
              </Button>

              <Button onClick={() => setFilterOpen(false)}>Apply filters</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Read-only Food Order Details */}
      <Dialog
        open={!!open}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpen(null);
        }}
      >
        {open && (
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Food Order Details</DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-secondary/50 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Order ID</p>

                  <p className="mt-1 font-semibold">{open.reference_code}</p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Payment</p>

                  <div className="mt-1">
                    {open.status === "cancelled" ? (
                      <StatusBadge status="cancelled" />
                    ) : open.payment_status === "paid" ? (
                      <StatusBadge status="paid" />
                    ) : (
                      <span className="text-sm font-medium">Unpaid</span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Food total</p>

                  <p className="mt-1 font-semibold text-primary">{peso(open.food_subtotal)}</p>
                </div>
              </div>

              <section className="space-y-3">
                <h3 className="font-semibold">Customer Information</h3>

                <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Customer</p>

                    <p className="mt-1 text-sm font-medium">{orderCustomer(open)}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Phone Number</p>

                    <p className="mt-1 text-sm font-medium">{open.profiles?.phone || "—"}</p>
                  </div>

                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Email</p>

                    <p className="mt-1 break-all text-sm font-medium">
                      {open.profiles?.email || "—"}
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Order Information</h3>

                <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Order ID</p>

                    <p className="mt-1 text-sm font-medium">{open.reference_code}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Order type</p>

                    <p className="mt-1 text-sm font-medium">
                      {open.order_type === "pre_order" ? "Pre-order" : "In-room order"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Room</p>

                    <p className="mt-1 text-sm font-medium">
                      {open.reservations?.rooms
                        ? `${open.reservations.rooms.room_number} · ${open.reservations.rooms.name}`
                        : "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Reservation ID</p>

                    <p className="mt-1 text-sm font-medium">
                      {open.reservations?.reference_code ?? "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Booking date</p>

                    <p className="mt-1 text-sm font-medium">
                      {open.reservations?.booking_date
                        ? fmtDate(open.reservations.booking_date)
                        : "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Submitted</p>

                    <p className="mt-1 text-sm font-medium">
                      {formatDateTime(open.submitted_at || open.created_at)}
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Ordered Items</h3>

                <div className="overflow-hidden rounded-xl border border-border">
                  <div className="divide-y divide-border">
                    {open.food_order_items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 p-3 text-sm"
                      >
                        <div>
                          <p className="font-medium">{item.item_name_snapshot}</p>

                          <p className="text-xs text-muted-foreground">
                            {item.quantity} × {peso(item.unit_price_snapshot)}
                          </p>
                        </div>

                        <p className="font-semibold">{peso(item.line_total)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-border bg-secondary/50 p-3 font-semibold">
                    <span>Food subtotal</span>
                    <span className="text-primary">{peso(open.food_subtotal)}</span>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold">Food Payment Information</h3>

                <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Payment status</p>

                    <div className="mt-1">
                      {open.status === "cancelled" ? (
                        <StatusBadge status="cancelled" />
                      ) : open.payment_status === "paid" ? (
                        <StatusBadge status="paid" />
                      ) : (
                        <span className="text-sm font-medium">Unpaid</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Payment method</p>

                    <div className="mt-1">
                      <PaymentMethodBadge method={open.payment_method} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Payer name</p>

                    <p className="mt-1 text-sm font-medium">{open.payer_name || "—"}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Account number</p>

                    <p className="mt-1 text-sm font-medium">{open.payer_account_number || "—"}</p>
                  </div>

                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Payment reference</p>

                    <p className="mt-1 break-all text-sm font-medium">
                      {open.payment_reference || "—"}
                    </p>
                  </div>
                </div>
              </section>

              {open.special_instructions && (
                <section className="space-y-3">
                  <h3 className="font-semibold">Special Instructions</h3>

                  <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
                    {open.special_instructions}
                  </div>
                </section>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Edit Food Order */}
      <Dialog
        open={!!editOrder}
        onOpenChange={(isOpen) => {
          if (!isOpen && !savingEdit) setEditOrder(null);
        }}
      >
        {editOrder && (
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Food Order</DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <div className="rounded-lg bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground">Order ID</p>

                <p className="mt-1 font-semibold">{editOrder.reference_code}</p>
              </div>

              <section className="space-y-3">
                <h3 className="font-semibold">Food Items</h3>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    aria-label="Select food item"
                    className={selectCls + " min-w-0 flex-1"}
                    value={selectedMenuItem}
                    onChange={(event) => setSelectedMenuItem(event.target.value)}
                  >
                    <option value="">Select a menu item...</option>

                    {availableMenuItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} — {peso(item.price)}
                      </option>
                    ))}
                  </select>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={addMenuItem}
                    disabled={!selectedMenuItem}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add item
                  </Button>
                </div>

                {availableMenuItems.length === 0 && (
                  <p className="text-xs text-muted-foreground">No available menu items found.</p>
                )}

                <div className="overflow-hidden rounded-xl border border-border">
                  {editItems.length === 0 ? (
                    <p className="p-5 text-center text-sm text-muted-foreground">
                      No food items added yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-border">
                      {editItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-3 p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{item.item_name_snapshot}</p>

                            <p className="text-xs text-muted-foreground">
                              {peso(item.unit_price_snapshot)} each
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <Label
                              htmlFor={`quantity-${item.id}`}
                              className="text-xs text-muted-foreground"
                            >
                              Qty
                            </Label>

                            <Input
                              id={`quantity-${item.id}`}
                              type="number"
                              min={1}
                              step={1}
                              className="h-9 w-20"
                              value={item.quantity}
                              onChange={(event) =>
                                changeQuantity(item.id, Number(event.target.value))
                              }
                            />

                            <p className="w-24 text-right text-sm font-semibold">
                              {peso(item.unit_price_snapshot * item.quantity)}
                            </p>

                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10"
                              aria-label={`Remove ${item.item_name_snapshot}`}
                              onClick={() => removeItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-border bg-secondary/50 p-3 font-semibold">
                    <span>New food subtotal</span>
                    <span className="text-primary">{peso(editedSubtotal)}</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Existing items keep their original prices. Newly added items use their current
                  menu prices.
                </p>
              </section>

              <section className="space-y-2">
                <Label htmlFor="edit-special-instructions">Special Instructions</Label>

                <Textarea
                  id="edit-special-instructions"
                  placeholder="Enter any special instructions..."
                  rows={4}
                  value={specialInstructions}
                  onChange={(event) => setSpecialInstructions(event.target.value)}
                />
              </section>

              <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingEdit}
                  onClick={() => setEditOrder(null)}
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  disabled={savingEdit || editItems.length === 0}
                  onClick={() => void saveEdit()}
                >
                  {savingEdit ? "Saving changes..." : "Save changes"}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
