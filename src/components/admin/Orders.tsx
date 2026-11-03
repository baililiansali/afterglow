import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Filter,
  LayoutGrid,
  List,
  Search,
  Trash2,
  Eye,
  Pencil,
  CreditCard,
  ShoppingBag,
  Clock3,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { errMsg, peso, fmtDate } from "@/lib/afterglow";
import { menuQuery } from "@/lib/queries";

import type { OrderRow, FoStatus } from "./shared";
import { dateCls } from "./ReservationDetail";

type ViewMode = "list" | "grid";
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

// Only these statuses are available for order management.
const ORDER_STATUSES: FoStatus[] = ["pending", "served", "cancelled"];

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};

const ADD_ORDER_STATUSES = ["checked_in"];

const dropdownItemClass = "cursor-pointer";

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

function formatPaymentLabel(value: string | null | undefined) {
  if (!value) return "Not specified";

  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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

export function Orders({
  orders,
  onViewPayment,
}: {
  orders: OrderRow[];
  onViewPayment: (orderId: string) => void;
}) {
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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

  const activeFilterCount = [status !== "all", sort !== "submitted", !!dateFrom, !!dateTo].filter(
    Boolean,
  ).length;

  const availableMenuItems = useMemo(
    () => (menuData?.items ?? []).filter((item) => item.is_available),
    [menuData?.items],
  );

  // Food Orders overview
  const orderOverview = useMemo(
    () => ({
      total: orders.filter((order) => order.status !== "cancelled").length,
      pending: orders.filter((order) => order.status === "pending").length,
      served: orders.filter((order) => order.status === "served").length,
      cancelled: orders.filter((order) => order.status === "cancelled").length,
    }),
    [orders],
  );

  // Filter food orders
  const list = useMemo(() => {
    const search = q.trim().toLowerCase();

    return orders
      .filter((order) => status === "all" || order.status === status)
      .filter((order) => {
        const submittedDate = (order.submitted_at || order.created_at).slice(0, 10);

        if (dateFrom && submittedDate < dateFrom) return false;
        if (dateTo && submittedDate > dateTo) return false;

        return true;
      })
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
          : (b.reservations?.booking_date ?? "").localeCompare(b.reservations?.booking_date ?? ""),
      );
  }, [orders, status, dateFrom, dateTo, q, sort]);

  useEffect(() => {
    setPage(1);
  }, [q, status, dateFrom, dateTo, sort]);

  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, currentPage, pageSize]);

  const clearFilters = () => {
    setStatus("all");
    setSort("submitted");
    setDateFrom("");
    setDateTo("");
  };

  const selectedReservation = reservationOptions.find(
    (reservation) => reservation.id === newReservationId,
  );

  const newOrderSubtotal = useMemo(
    () => newOrderItems.reduce((sum, item) => sum + item.unit_price_snapshot * item.quantity, 0),
    [newOrderItems],
  );

  const editedSubtotal = useMemo(
    () =>
      editItems.reduce(
        (sum, item) => sum + Number(item.unit_price_snapshot) * Number(item.quantity),
        0,
      ),
    [editItems],
  );

  // Open the matching food payment in Transactions.
  const viewOrderPayment = (order: OrderRow) => {
    setEditOrder(null);
    onViewPayment(order.id);
  };

  // Update food order status.
  // Only Pending orders can move directly to Served.
  const updateOrderStatus = async (order: OrderRow) => {
    if (order.status !== "pending") {
      toast.error("Only pending orders can be marked as served.");
      return;
    }

    if (updatingId === order.id) return;

    setUpdatingId(order.id);

    try {
      const { data, error } = await supabase
        .from("food_orders")
        .update({ status: "served" })
        .eq("id", order.id)
        .eq("status", "pending")
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error("Order status could not be updated. Refresh and try again.");
      }

      toast.success("Food order marked as Served.");

      if (open?.id === order.id) {
        setOpen({ ...order, status: "served" });
      }

      if (editOrder?.id === order.id) {
        setEditOrder(null);
      }

      await qc.invalidateQueries({
        queryKey: ["admin-orders"],
      });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setUpdatingId(null);
    }
  };

  // Cancel food order.
  // Only Pending orders can be cancelled.
  const cancelOrder = async (order: OrderRow) => {
    if (order.status !== "pending") {
      toast.error("Only pending orders can be cancelled.");
      return;
    }

    if (updatingId === order.id) return;

    if (!window.confirm(`Are you sure you want to cancel food order ${order.reference_code}?`)) {
      return;
    }

    setUpdatingId(order.id);

    try {
      const { data, error } = await supabase
        .from("food_orders")
        .update({ status: "cancelled" })
        .eq("id", order.id)
        .eq("status", "pending")
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error("The food order could not be cancelled. Refresh and try again.");
      }

      toast.success("Food order cancelled.");

      if (open?.id === order.id) {
        setOpen({ ...order, status: "cancelled" });
      }

      if (editOrder?.id === order.id) {
        setEditOrder(null);
      }

      await qc.invalidateQueries({
        queryKey: ["admin-orders"],
      });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setUpdatingId(null);
    }
  };

  // Status display.
  // Pending orders have Serve and Cancel buttons.
  // Served and Cancelled orders only show their status badge.
  const statusControl = (order: OrderRow) => (
    <div className="flex items-center justify-end gap-2">
      {order.status === "pending" ? (
        <>
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={updatingId === order.id}
            onClick={() => void updateOrderStatus(order)}
          >
            {updatingId === order.id ? "Updating..." : "Serve"}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={updatingId === order.id}
            onClick={() => void cancelOrder(order)}
          >
            Cancel
          </Button>
        </>
      ) : (
        <StatusBadge status={order.status} />
      )}
    </div>
  );

  // Open Edit dialog.
  const startEdit = (order: OrderRow) => {
    if (order.status !== "pending") {
      toast.error("Only pending orders can be edited.");
      return;
    }

    setEditOrder(order);
    setEditItems(createEditableItems(order.food_order_items));
    setSpecialInstructions(order.special_instructions ?? "");
    setSelectedMenuItem("");
  };

  // Add menu item to existing order.
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

  // Reset Add Order form.
  const resetNewOrder = () => {
    setNewReservationId("");
    setNewOrderItems([]);
    setNewSelectedMenuItem("");
    setNewSpecialInstructions("");
  };

  // Add menu item to new order.
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

  // Create new food order.
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

  // Save edited food order.
  const saveEdit = async () => {
    if (!editOrder) return;

    if (editOrder.status !== "pending") {
      toast.error("Only pending orders can be edited.");
      setEditOrder(null);
      return;
    }

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
        .eq("status", "pending")
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error("The food order could not be updated. It may no longer be pending.");
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

  // Action buttons:
  // List view: icon-only buttons aligned right.
  // Grid view: icon + text buttons aligned left.
  // Details and View Payment are available for all orders.
  // Edit is only available for Pending orders.
  const actionDisplay = (order: OrderRow, viewMode: ViewMode = "list") => (
    <div
      className={`flex items-center gap-2 ${viewMode === "grid" ? "justify-start" : "justify-end"}`}
    >
      {/* View Details */}
      <Button
        type="button"
        size={viewMode === "grid" ? "sm" : "icon"}
        variant={viewMode === "grid" ? "outline" : "ghost"}
        className={viewMode === "list" ? "h-8 w-8" : ""}
        title="View Details"
        aria-label={`View details for ${order.reference_code}`}
        onClick={() => setOpen(order)}
      >
        <Eye className="h-4 w-4" />
        {viewMode === "grid" && <span>Details</span>}
      </Button>

      {/* View Payment */}
      <Button
        type="button"
        size={viewMode === "grid" ? "sm" : "icon"}
        variant={viewMode === "grid" ? "outline" : "ghost"}
        className={viewMode === "list" ? "h-8 w-8" : ""}
        title="View Payment"
        aria-label={`View payment for ${order.reference_code}`}
        onClick={() => viewOrderPayment(order)}
      >
        <CreditCard className="h-4 w-4" />
        {viewMode === "grid" && <span>View Payment</span>}
      </Button>

      {/* Edit Order */}
      {order.status === "pending" && (
        <Button
          type="button"
          size={viewMode === "grid" ? "sm" : "icon"}
          variant={viewMode === "grid" ? "outline" : "ghost"}
          className={viewMode === "list" ? "h-8 w-8" : ""}
          title="Edit Order"
          aria-label={`Edit order ${order.reference_code}`}
          disabled={updatingId === order.id}
          onClick={() => startEdit(order)}
        >
          <Pencil className="h-4 w-4" />
          {viewMode === "grid" && <span>Edit</span>}
        </Button>
      )}
    </div>
  );

  // Status is intentionally the last table column.
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
    "Status",
  ];

  return (
    <div className="mt-4 space-y-4">
      {/* Page heading */}
      <div>
        <h2 className="font-display text-xl font-bold">Food Orders</h2>
        <p className="mt-1 text-sm text-muted-foreground">Track food orders and manage serving.</p>
      </div>

      {/* Food Orders Overview */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* Total Active Orders */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Total Active Orders</p>
              <p className="mt-2 text-2xl font-bold">{orderOverview.total}</p>
            </div>

            <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <ShoppingBag className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Pending Orders */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Pending Orders</p>
              <p className="mt-2 text-2xl font-bold">{orderOverview.pending}</p>
            </div>

            <div className="rounded-lg bg-yellow-500/10 p-2.5 text-yellow-500">
              <Clock3 className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Served Orders */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Served Orders</p>
              <p className="mt-2 text-2xl font-bold">{orderOverview.served}</p>
            </div>

            <div className="rounded-lg bg-green-500/10 p-2.5 text-green-500">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Cancelled Orders */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Cancelled Orders</p>
              <p className="mt-2 text-2xl font-bold">{orderOverview.cancelled}</p>
            </div>

            <div className="rounded-lg bg-destructive/10 p-2.5 text-destructive">
              <XCircle className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Search */}
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

          {/* Date filters */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full space-y-1 sm:w-[150px]">
              <Label htmlFor="orders-date-from" className="text-xs text-muted-foreground">
                From date
              </Label>

              <Input
                id="orders-date-from"
                type="date"
                className="w-[150px] [color-scheme:dark]"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </div>

            <div className="w-full space-y-1 sm:w-[150px]">
              <Label htmlFor="orders-date-to" className="text-xs text-muted-foreground">
                To date
              </Label>

              <Input
                id="orders-date-to"
                type="date"
                className="w-[150px] [color-scheme:dark]"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>
          </div>

          {/* Filter */}
          <Button
            type="button"
            variant="outline"
            className="h-10 shrink-0"
            onClick={() => setFilterOpen(true)}
          >
            <Filter className="mr-2 h-4 w-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {/* Grid / List toggle */}
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-secondary/40 p-1">
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

          {/* Add Order */}
          <Button
            type="button"
            className="h-10 shrink-0 border-pink-500 bg-pink-500 text-white hover:border-pink-600 hover:bg-pink-600"
            onClick={() => setAddOrderOpen(true)}
          >
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
                      header === "Status" || header === "Action" ? "text-right" : ""
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

                  <td className="p-3">{actionDisplay(order, "list")}</td>
                  <td className="p-3">{statusControl(order)}</td>
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
                <div
                  key={order.id}
                  className="flex flex-col rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{order.reference_code}</p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {orderCustomer(order)}
                      </p>
                    </div>

                    <div className="shrink-0">{statusControl(order)}</div>
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

                  <div className="mt-auto border-t border-border pt-3">
                    {actionDisplay(order, "grid")}
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

                <Select
                  value={newReservationId}
                  onValueChange={setNewReservationId}
                  disabled={loadingReservations}
                >
                  <SelectTrigger
                    id="new-order-reservation"
                    className="mt-1 h-10 w-full justify-between text-sm"
                  >
                    <SelectValue
                      placeholder={
                        loadingReservations ? "Loading reservations..." : "Select a reservation..."
                      }
                    />
                  </SelectTrigger>

                  <SelectContent position="popper" className="max-h-60">
                    {reservationOptions.map((reservation) => (
                      <SelectItem
                        key={reservation.id}
                        value={reservation.id}
                        className="cursor-pointer"
                      >
                        {reservation.reference_code} · {reservation.customer_name} ·{" "}
                        {fmtDate(reservation.booking_date)} · Checked In
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

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

              {/* Add Food Item dropdown */}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={newSelectedMenuItem} onValueChange={setNewSelectedMenuItem}>
                  <SelectTrigger className="h-10 min-w-0 flex-1 justify-between text-sm">
                    <SelectValue placeholder="Select a menu item..." />
                  </SelectTrigger>

                  <SelectContent position="popper" className="max-h-60">
                    {availableMenuItems.map((item) => (
                      <SelectItem key={item.id} value={item.id} className="cursor-pointer">
                        {item.name} — {peso(item.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

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
            {/* Order Status */}
            <div className="space-y-1.5">
              <Label htmlFor="orders-status">Order status</Label>

              <Select
                value={status}
                onValueChange={(value) => setStatus(value as "all" | FoStatus)}
              >
                <SelectTrigger id="orders-status" className="h-10 w-full justify-between text-sm">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>

                <SelectContent position="popper" className="max-h-60">
                  <SelectItem value="all" className={dropdownItemClass}>
                    All statuses
                  </SelectItem>

                  {ORDER_STATUSES.map((item) => (
                    <SelectItem key={item} value={item} className={dropdownItemClass}>
                      {STATUS_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sort By */}
            <div className="space-y-1.5">
              <Label htmlFor="orders-sort">Sort by</Label>

              <Select value={sort} onValueChange={(value) => setSort(value as SortMode)}>
                <SelectTrigger id="orders-sort" className="h-10 w-full justify-between text-sm">
                  <SelectValue placeholder="Select sorting" />
                </SelectTrigger>

                <SelectContent position="popper">
                  <SelectItem value="submitted" className={dropdownItemClass}>
                    Date submitted
                  </SelectItem>

                  <SelectItem value="booking" className={dropdownItemClass}>
                    Booking date
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filter Actions */}
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
                  <p className="text-xs text-muted-foreground">Order Status</p>
                  <div className="mt-1">
                    <StatusBadge status={open.status} />
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
          if (!isOpen && !savingEdit) {
            setEditOrder(null);
          }
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

                {/* Edit Food Item dropdown */}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select value={selectedMenuItem} onValueChange={setSelectedMenuItem}>
                    <SelectTrigger className="h-10 min-w-0 flex-1 justify-between text-sm">
                      <SelectValue placeholder="Select a menu item..." />
                    </SelectTrigger>

                    <SelectContent position="popper" className="max-h-60">
                      {availableMenuItems.map((item) => (
                        <SelectItem key={item.id} value={item.id} className="cursor-pointer">
                          {item.name} — {peso(item.price)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={addMenuItem}
                    disabled={!selectedMenuItem}
                  >
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

              {/* Payment Information */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold">Payment</h3>
                </div>

                <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Payment Status</p>
                    <p className="mt-1 text-sm font-medium">
                      {formatPaymentLabel(editOrder.payment_status)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Payment Method</p>
                    <p className="mt-1 text-sm font-medium">
                      {formatPaymentLabel(editOrder.payment_method)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Current Saved Food Total</p>
                    <p className="mt-1 text-sm font-semibold">{peso(editOrder.food_subtotal)}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Updated Food Total</p>
                    <p className="mt-1 text-sm font-semibold text-primary">
                      {peso(editedSubtotal)}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Payment details are managed in Transactions. Save your food order changes first if
                  you want the updated total reflected in its transaction.
                </p>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => viewOrderPayment(editOrder)}
                  disabled={savingEdit}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  View Payment
                </Button>
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
