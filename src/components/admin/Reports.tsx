import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  Clock,
  FileSpreadsheet,
  Filter,
  Music,
  Printer,
  Receipt,
  Search,
  TrendingUp,
  Utensils,
  Wallet,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format, parseISO } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { peso, fmtDate, durationHours } from "@/lib/afterglow";
import { StatusBadge } from "@/components/StatusBadge";
import { useProfiles, type ResRow, type OrderRow } from "./shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type ReportsProps = {
  res: ResRow[];
  orders: OrderRow[];
};

type Room = {
  id: string;
  name: string;
  room_number: string;
  hourly_rate: number;
  is_active: boolean;
  maintenance_status: string | null;
};

type BusinessSettings = {
  opening_time: string | null;
  closing_time: string | null;
};

type Tab = "overview" | "revenue" | "reservations" | "rooms" | "food";
type RevenuePeriod = "daily" | "weekly" | "monthly" | "yearly";

type FoodItemSummary = {
  name: string;
  quantity: number;
  revenue: number;
};

const BOOKING_STATUSES = ["approved", "checked_in", "completed"];
const PAGE_SIZE = 10;

function localDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function offsetDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDate(date);
}

function withinRange(value: string | null | undefined, from: string, to: string) {
  if (!value) return false;

  const date = value.slice(0, 10);
  return date >= from && date <= to;
}

function customerName(profiles: Record<string, any>, userId: string) {
  const profile = profiles[userId];

  return profile?.full_name || profile?.name || profile?.email || "Unknown customer";
}

function roomName(reservation: ResRow) {
  return reservation.rooms?.name ?? "Unknown room";
}

function hoursBetween(start: string, end: string) {
  return Math.max(0, durationHours(start, end));
}

function operatingHours(opening?: string | null, closing?: string | null) {
  if (!opening || !closing) return 0;

  const [oh, om] = opening.split(":").map(Number);
  const [ch, cm] = closing.split(":").map(Number);

  const start = oh * 60 + (om || 0);
  let end = ch * 60 + (cm || 0);

  if (end <= start) end += 24 * 60;

  return (end - start) / 60;
}

function exportCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function MetricCard({
  title,
  value,
  note,
  icon: Icon,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        </div>

        <div className="rounded-lg bg-primary/10 p-3 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function DataTable({
  headers,
  children,
  empty,
  emptyMessage = "No records found.",
  colSpan,
}: {
  headers: string[];
  children: React.ReactNode;
  empty?: boolean;
  emptyMessage?: string;
  colSpan?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[650px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {headers.map((header) => (
              <th key={header} className="px-3 py-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {children}

          {empty && (
            <tr>
              <td
                colSpan={colSpan ?? headers.length}
                className="px-3 py-8 text-center text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TablePagination({
  page,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{start}</span>–
        <span className="font-medium text-foreground">{end}</span> of{" "}
        <span className="font-medium text-foreground">{totalItems}</span> records
      </p>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>

        <span className="min-w-[90px] text-center text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function periodKey(dateString: string, period: RevenuePeriod) {
  const date = new Date(`${dateString.slice(0, 10)}T00:00:00`);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  if (period === "daily") return localDate(date);
  if (period === "monthly") return `${year}-${month}`;
  if (period === "yearly") return String(year);

  const monday = new Date(date);
  const day = (monday.getDay() + 6) % 7;

  monday.setDate(monday.getDate() - day);

  return localDate(monday);
}

function periodLabel(key: string, period: RevenuePeriod) {
  if (period === "daily") {
    return new Date(`${key}T00:00:00`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (period === "monthly") {
    return new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }

  if (period === "yearly") return key;

  const start = new Date(`${key}T00:00:00`);
  const end = new Date(start);

  end.setDate(end.getDate() + 6);

  return `${start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function getFoodItemDetails(item: any): { name: string; quantity: number; revenue: number } | null {
  const nestedFood = item.food_items ?? item.foods ?? item.menu_items ?? null;

  const rawName =
    item.food_name ??
    item.item_name ??
    item.name ??
    nestedFood?.name ??
    nestedFood?.food_name ??
    null;

  const name = typeof rawName === "string" ? rawName.trim() : "";
  const quantity = Number(item.quantity);

  if (!name || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  const subtotal = Number(item.subtotal ?? item.total_price);
  const unitPrice = Number(item.unit_price ?? item.price);

  let revenue = 0;

  if (Number.isFinite(subtotal)) {
    revenue = subtotal;
  } else if (Number.isFinite(unitPrice)) {
    revenue = unitPrice * quantity;
  }

  return {
    name,
    quantity,
    revenue: Math.max(0, revenue),
  };
}

export function Reports({ res, orders }: ReportsProps) {
  const [tab, setTab] = useState<Tab>("overview");

  const [fromDate, setFromDate] = useState(offsetDate(29));
  const [toDate, setToDate] = useState(localDate(new Date()));

  const [selectedRoom, setSelectedRoom] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const [draftRoom, setDraftRoom] = useState("all");
  const [draftStatus, setDraftStatus] = useState("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [revenuePeriod, setRevenuePeriod] = useState<RevenuePeriod>("daily");

  const [reservationPage, setReservationPage] = useState(1);
  const [foodOrderPage, setFoodOrderPage] = useState(1);

  const profilesQuery = useProfiles();
  const profiles = profilesQuery.data ?? {};

  const roomsQuery = useQuery({
    queryKey: ["admin-report-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, room_number, hourly_rate, is_active, maintenance_status")
        .order("room_number");

      if (error) throw error;

      return (data ?? []) as Room[];
    },
  });

  const settingsQuery = useQuery({
    queryKey: ["admin-report-business-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("opening_time, closing_time")
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      return data as BusinessSettings | null;
    },
  });

  const rooms = roomsQuery.data ?? [];
  const settings = settingsQuery.data;
  const validRange = fromDate <= toDate;

  useEffect(() => {
    setReservationPage(1);
    setFoodOrderPage(1);
  }, [search, fromDate, toDate, selectedRoom, selectedStatus]);

  const dateReservations = useMemo(
    () =>
      validRange ? res.filter((item) => withinRange(item.booking_date, fromDate, toDate)) : [],
    [res, fromDate, toDate, validRange],
  );

  const dateOrders = useMemo(
    () =>
      validRange
        ? orders.filter((item) => withinRange(item.reservations?.booking_date, fromDate, toDate))
        : [],
    [orders, fromDate, toDate, validRange],
  );

  const filteredReservations = useMemo(() => {
    const query = search.trim().toLowerCase();

    return dateReservations.filter((item) => {
      const matchesRoom = selectedRoom === "all" || item.room_id === selectedRoom;
      const matchesStatus = selectedStatus === "all" || item.status === selectedStatus;

      const matchesSearch =
        !query ||
        item.reference_code?.toLowerCase().includes(query) ||
        customerName(profiles, item.user_id).toLowerCase().includes(query) ||
        roomName(item).toLowerCase().includes(query);

      return matchesRoom && matchesStatus && matchesSearch;
    });
  }, [dateReservations, selectedRoom, selectedStatus, search, profiles]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    return dateOrders.filter((item) => {
      const roomId = item.reservations?.rooms?.id;
      const matchesRoom = selectedRoom === "all" || roomId === selectedRoom;

      const matchesSearch =
        !query ||
        item.reference_code?.toLowerCase().includes(query) ||
        customerName(profiles, item.user_id).toLowerCase().includes(query) ||
        item.reservations?.reference_code?.toLowerCase().includes(query);

      return matchesRoom && matchesSearch;
    });
  }, [dateOrders, selectedRoom, search, profiles]);

  const paidReservations = useMemo(
    () =>
      dateReservations.filter(
        (item) =>
          item.payment_status === "paid" && !["rejected", "cancelled"].includes(item.status),
      ),
    [dateReservations],
  );

  const paidOrders = useMemo(
    () =>
      dateOrders.filter((item) => item.payment_status === "paid" && item.status !== "cancelled"),
    [dateOrders],
  );

  const roomRevenue = paidReservations.reduce((sum, item) => sum + Number(item.room_total || 0), 0);
  const foodRevenue = paidOrders.reduce((sum, item) => sum + Number(item.food_subtotal || 0), 0);

  const totalRevenue = roomRevenue + foodRevenue;
  const transactionCount = paidReservations.length + paidOrders.length;
  const averageTransaction = transactionCount ? totalRevenue / transactionCount : 0;

  const statusCounts = {
    pending: dateReservations.filter((item) => item.status === "pending").length,
    approved: dateReservations.filter((item) => item.status === "approved").length,
    checkedIn: dateReservations.filter((item) => item.status === "checked_in").length,
    completed: dateReservations.filter((item) => item.status === "completed").length,
    rejected: dateReservations.filter((item) => item.status === "rejected").length,
    cancelled: dateReservations.filter((item) => item.status === "cancelled").length,
  };

  const roomPerformance = useMemo(() => {
    const hoursPerDay = operatingHours(settings?.opening_time, settings?.closing_time);

    const days = validRange
      ? Math.floor(
          (new Date(`${toDate}T00:00:00`).getTime() - new Date(`${fromDate}T00:00:00`).getTime()) /
            86400000,
        ) + 1
      : 0;

    return rooms.map((room) => {
      const bookings = dateReservations.filter(
        (item) => item.room_id === room.id && BOOKING_STATUSES.includes(item.status),
      );

      const bookedHours = bookings.reduce(
        (sum, item) => sum + hoursBetween(item.start_time, item.end_time),
        0,
      );

      const revenue = paidReservations
        .filter((item) => item.room_id === room.id)
        .reduce((sum, item) => sum + Number(item.room_total || 0), 0);

      const available =
        room.is_active && room.maintenance_status !== "maintenance" ? hoursPerDay * days : 0;

      return {
        ...room,
        bookings: bookings.length,
        bookedHours,
        revenue,
        utilization: available ? Math.min(100, (bookedHours / available) * 100) : 0,
      };
    });
  }, [rooms, dateReservations, paidReservations, settings, fromDate, toDate, validRange]);

  const totalBookedHours = roomPerformance.reduce((sum, room) => sum + room.bookedHours, 0);

  const totalAvailableHours = roomPerformance.reduce((sum, room) => {
    if (!room.is_active || room.maintenance_status === "maintenance") {
      return sum;
    }

    const days = validRange
      ? Math.floor(
          (new Date(`${toDate}T00:00:00`).getTime() - new Date(`${fromDate}T00:00:00`).getTime()) /
            86400000,
        ) + 1
      : 0;

    return sum + operatingHours(settings?.opening_time, settings?.closing_time) * days;
  }, 0);

  const utilization = totalAvailableHours ? (totalBookedHours / totalAvailableHours) * 100 : 0;

  const revenueGroups = useMemo(() => {
    const grouped = new Map<string, { revenue: number; reservations: number }>();

    const add = (date: string | null | undefined, amount: number, isReservation: boolean) => {
      if (!date) return;

      const key = periodKey(date, revenuePeriod);
      const current = grouped.get(key) ?? { revenue: 0, reservations: 0 };

      current.revenue += amount;

      if (isReservation) current.reservations += 1;

      grouped.set(key, current);
    };

    paidReservations.forEach((item) => add(item.booking_date, Number(item.room_total || 0), true));

    paidOrders.forEach((item) =>
      add(item.reservations?.booking_date, Number(item.food_subtotal || 0), false),
    );

    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ key, ...value }));
  }, [paidReservations, paidOrders, revenuePeriod]);

  const maxRevenue = Math.max(1, ...revenueGroups.map((item) => item.revenue));

  const popularHours = useMemo(() => {
    const counts: Record<string, number> = {};

    dateReservations.forEach((item) => {
      const time = item.start_time.slice(0, 5);
      counts[time] = (counts[time] ?? 0) + 1;
    });

    return Object.entries(counts)
      .map(([time, count]) => ({ time, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [dateReservations]);

  const foodItems = useMemo<FoodItemSummary[]>(() => {
    const grouped = new Map<string, { quantity: number; revenue: number }>();

    paidOrders.forEach((order) => {
      (order.food_order_items ?? []).forEach((item: any) => {
        const details = getFoodItemDetails(item);

        if (!details) return;

        const current = grouped.get(details.name) ?? { quantity: 0, revenue: 0 };

        current.quantity += details.quantity;
        current.revenue += details.revenue;

        grouped.set(details.name, current);
      });
    });

    return [...grouped.entries()]
      .map(([name, values]) => ({ name, ...values }))
      .sort((a, b) => b.quantity - a.quantity);
  }, [paidOrders]);

  const mostBooked = [...roomPerformance].sort((a, b) => b.bookings - a.bookings)[0];

  const leastBooked = [...roomPerformance]
    .filter((room) => room.is_active)
    .sort((a, b) => a.bookings - b.bookings)[0];

  const reservationTotalPages = Math.max(1, Math.ceil(filteredReservations.length / PAGE_SIZE));
  const foodOrderTotalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));

  const paginatedReservations = filteredReservations.slice(
    (reservationPage - 1) * PAGE_SIZE,
    reservationPage * PAGE_SIZE,
  );

  const paginatedOrders = filteredOrders.slice(
    (foodOrderPage - 1) * PAGE_SIZE,
    foodOrderPage * PAGE_SIZE,
  );

  const exportReport = () => {
    const rows: (string | number)[][] = [
      ["SONARA - REPORTS & ANALYTICS"],
      ["Date range", `${fromDate} to ${toDate}`],
      [],
      ["SUMMARY"],
      ["Total reservations", dateReservations.length],
      ["Room revenue", roomRevenue],
      ["Food revenue", foodRevenue],
      ["Total revenue", totalRevenue],
      ["Average transaction", averageTransaction],
      ["Room utilization (%)", utilization.toFixed(2)],
      [],
      ["REVENUE", "Period", "Revenue", "Reservation count"],
      ...revenueGroups.map((item) => [
        "Revenue",
        periodLabel(item.key, revenuePeriod),
        item.revenue,
        item.reservations,
      ]),
      [],
      ["ROOM PERFORMANCE", "Room", "Bookings", "Booked hours", "Revenue", "Utilization"],
      ...roomPerformance.map((room) => [
        "Room",
        room.name,
        room.bookings,
        room.bookedHours.toFixed(2),
        room.revenue,
        room.utilization.toFixed(2),
      ]),
      [],
      [
        "RESERVATIONS",
        "Reference",
        "Customer",
        "Room",
        "Date",
        "Start",
        "End",
        "Status",
        "Payment",
        "Total",
      ],
      ...filteredReservations.map((item) => [
        "Reservation",
        item.reference_code,
        customerName(profiles, item.user_id),
        roomName(item),
        item.booking_date,
        item.start_time,
        item.end_time,
        item.status,
        item.payment_status,
        Number(item.room_total || 0),
      ]),
      [],
      ["FOOD ORDERS", "Reference", "Customer", "Reservation", "Status", "Payment", "Total"],
      ...filteredOrders.map((item) => [
        "Food order",
        item.reference_code,
        customerName(profiles, item.user_id),
        item.reservations?.reference_code ?? "",
        item.status,
        item.payment_status,
        Number(item.food_subtotal || 0),
      ]),
      [],
      ["BESTSELLING FOOD ITEMS", "Food Item", "Quantity Sold", "Revenue"],
      ...foodItems.map((item) => ["Food item", item.name, item.quantity, item.revenue]),
    ];

    exportCSV(`sonara-report-${fromDate}-to-${toDate}.csv`, rows);
  };

  const tabs: {
    id: Tab;
    label: string;
    icon: React.ElementType;
  }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "revenue", label: "Revenue", icon: Wallet },
    { id: "reservations", label: "Reservations", icon: CalendarDays },
    { id: "rooms", label: "Room Performance", icon: Music },
    { id: "food", label: "Food Sales", icon: Utensils },
  ];

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review your business performance and sales reports.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportReport}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export CSV
          </Button>

          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print / PDF
          </Button>
        </div>
      </div>

      {/* SHARED FILTER TOOLBAR */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        {/* SEARCH */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Search</Label>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              className="h-10 pl-9 text-sm"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reference code, customer, or room..."
            />
          </div>
        </div>

        {/* DATE RANGE */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
          {/* From Date */}
          <div className="min-w-0 space-y-1 sm:w-[150px]">
            <Label htmlFor="report-from-date" className="text-xs text-muted-foreground">
              From date
            </Label>
            <Input
              id="report-from-date"
              type="date"
              className="h-10 w-full [color-scheme:dark]"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>

          {/* To Date */}
          <div className="min-w-0 space-y-1 sm:w-[150px]">
            <Label htmlFor="report-to-date" className="text-xs text-muted-foreground">
              To date
            </Label>
            <Input
              id="report-to-date"
              type="date"
              className="h-10 w-full [color-scheme:dark]"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
        </div>

        {/* FILTER BUTTON */}
        <div className="w-full space-y-1 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full sm:w-[130px]"
            onClick={() => {
              setDraftRoom(selectedRoom);
              setDraftStatus(selectedStatus);
              setFilterOpen(true);
            }}
          >
            <Filter className="mr-2 h-4 w-4" />
            Filter
            {(selectedRoom !== "all" || selectedStatus !== "all") && (
              <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                {(selectedRoom !== "all" ? 1 : 0) + (selectedStatus !== "all" ? 1 : 0)}
              </span>
            )}
          </Button>
        </div>
      </div>

      {!validRange && (
        <p className="text-sm text-destructive">
          The start date must be before or equal to the end date.
        </p>
      )}

      {/* REPORT FILTER DIALOG */}
      <Dialog
        open={filterOpen}
        onOpenChange={(open) => {
          setFilterOpen(open);

          if (open) {
            setDraftRoom(selectedRoom);
            setDraftStatus(selectedStatus);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Report filters</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* ROOM */}
            <div className="space-y-1.5">
              <Label htmlFor="report-room">Room</Label>

              <Select value={draftRoom} onValueChange={setDraftRoom}>
                <SelectTrigger id="report-room" className="h-10 w-full justify-between text-sm">
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>

                <SelectContent position="popper" className="max-h-60">
                  <SelectItem value="all" className="cursor-pointer">
                    All rooms
                  </SelectItem>

                  {rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id} className="cursor-pointer">
                      {room.name} ({room.room_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* RESERVATION STATUS */}
            <div className="space-y-1.5">
              <Label htmlFor="report-status">Reservation status</Label>

              <Select value={draftStatus} onValueChange={setDraftStatus}>
                <SelectTrigger id="report-status" className="h-10 w-full justify-between text-sm">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>

                <SelectContent position="popper" className="max-h-60">
                  <SelectItem value="all" className="cursor-pointer">
                    All statuses
                  </SelectItem>

                  <SelectItem value="pending" className="cursor-pointer">
                    Pending
                  </SelectItem>

                  <SelectItem value="approved" className="cursor-pointer">
                    Approved
                  </SelectItem>

                  <SelectItem value="checked_in" className="cursor-pointer">
                    Checked in
                  </SelectItem>

                  <SelectItem value="completed" className="cursor-pointer">
                    Completed
                  </SelectItem>

                  <SelectItem value="rejected" className="cursor-pointer">
                    Rejected
                  </SelectItem>

                  <SelectItem value="cancelled" className="cursor-pointer">
                    Cancelled
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* FILTER ACTIONS */}
            <div className="flex justify-between gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraftRoom("all");
                  setDraftStatus("all");
                  setSelectedRoom("all");
                  setSelectedStatus("all");
                }}
              >
                Clear all
              </Button>

              <Button
                type="button"
                onClick={() => {
                  setSelectedRoom(draftRoom);
                  setSelectedStatus(draftStatus);
                  setFilterOpen(false);
                }}
              >
                Apply filters
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* REPORT TABS */}
      <div className="flex gap-2 overflow-x-auto border-b pb-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Reservations"
              value={dateReservations.length.toLocaleString()}
              note="Within selected dates"
              icon={CalendarDays}
            />

            <MetricCard
              title="Total Revenue"
              value={peso(totalRevenue)}
              note="Paid room and food transactions"
              icon={Wallet}
            />

            <MetricCard
              title="Average Transaction"
              value={peso(averageTransaction)}
              note={`${transactionCount} paid transactions`}
              icon={TrendingUp}
            />

            <MetricCard
              title="Room Utilization"
              value={`${utilization.toFixed(1)}%`}
              note="Booked-hour utilization"
              icon={Music}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <SectionHeading
                title="Reservation Status"
                description="Number of reservations by status"
              />

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ["Pending", statusCounts.pending],
                  ["Approved", statusCounts.approved],
                  ["Checked in", statusCounts.checkedIn],
                  ["Completed", statusCounts.completed],
                  ["Rejected", statusCounts.rejected],
                  ["Cancelled", statusCounts.cancelled],
                ].map(([label, count]) => (
                  <div key={String(label)} className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold">{Number(count)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <SectionHeading title="Revenue Breakdown" />

              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Room Revenue</span>
                  <span className="font-semibold">{peso(roomRevenue)}</span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${totalRevenue ? (roomRevenue / totalRevenue) * 100 : 0}%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Food Revenue</span>
                  <span className="font-semibold">{peso(foodRevenue)}</span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/60"
                    style={{
                      width: `${totalRevenue ? (foodRevenue / totalRevenue) * 100 : 0}%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <span className="font-medium">Total Revenue</span>
                  <span className="text-lg font-bold">{peso(totalRevenue)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <SectionHeading title="Top Performing Rooms" />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground">Most Booked</p>
                <p className="mt-1 font-semibold">{mostBooked?.name ?? "No data"}</p>
                <p className="text-xs text-muted-foreground">
                  {mostBooked?.bookings ?? 0} bookings
                </p>
              </div>

              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground">Least Booked Active Room</p>
                <p className="mt-1 font-semibold">{leastBooked?.name ?? "No data"}</p>
                <p className="text-xs text-muted-foreground">
                  {leastBooked?.bookings ?? 0} bookings
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REVENUE TAB */}
      {tab === "revenue" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              title="Total Revenue"
              value={peso(totalRevenue)}
              note="Paid transactions"
              icon={Wallet}
            />

            <MetricCard
              title="Room Revenue"
              value={peso(roomRevenue)}
              note="Paid room reservations"
              icon={Music}
            />

            <MetricCard
              title="Food Revenue"
              value={peso(foodRevenue)}
              note="Paid food orders"
              icon={Utensils}
            />
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <SectionHeading title="Revenue Trends" />

              <Select
                value={revenuePeriod}
                onValueChange={(value) => setRevenuePeriod(value as RevenuePeriod)}
              >
                <SelectTrigger className="h-10 w-full justify-between text-sm sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent position="popper">
                  <SelectItem value="daily" className="cursor-pointer">
                    Daily
                  </SelectItem>
                  <SelectItem value="weekly" className="cursor-pointer">
                    Weekly
                  </SelectItem>
                  <SelectItem value="monthly" className="cursor-pointer">
                    Monthly
                  </SelectItem>
                  <SelectItem value="yearly" className="cursor-pointer">
                    Yearly
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {revenueGroups.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No paid revenue found for this date range.
              </p>
            ) : (
              <div className="mt-6 space-y-4">
                {revenueGroups.map((item) => (
                  <div
                    key={item.key}
                    className="grid grid-cols-[minmax(100px,150px)_1fr_auto] items-center gap-3"
                  >
                    <span className="text-xs text-muted-foreground">
                      {periodLabel(item.key, revenuePeriod)}
                    </span>

                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${(item.revenue / maxRevenue) * 100}%`,
                        }}
                      />
                    </div>

                    <span className="min-w-[90px] text-right text-sm font-semibold">
                      {peso(item.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5">
            <SectionHeading title="Paid Transaction Summary" />

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Room transactions</p>
                <p className="mt-1 text-xl font-semibold">{paidReservations.length}</p>
              </div>

              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Food transactions</p>
                <p className="mt-1 text-xl font-semibold">{paidOrders.length}</p>
              </div>

              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Average transaction</p>
                <p className="mt-1 text-xl font-semibold">{peso(averageTransaction)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RESERVATIONS TAB */}
      {tab === "reservations" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              title="Total Reservations"
              value={String(dateReservations.length)}
              note="Within selected dates"
              icon={CalendarDays}
            />

            <MetricCard
              title="Completed Reservations"
              value={String(statusCounts.completed)}
              note="Marked completed"
              icon={TrendingUp}
            />

            <MetricCard
              title="Pending Reservations"
              value={String(statusCounts.pending)}
              note="Awaiting admin action"
              icon={Clock}
            />
          </div>

          <div className="rounded-xl border bg-card p-5">
            <SectionHeading
              title="Popular Reservation Hours"
              description="Most frequently selected reservation start times"
            />

            {popularHours.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No reservation data available.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {popularHours.map((item) => (
                  <div
                    key={item.time}
                    className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-3"
                  >
                    <span className="font-medium">{item.time}</span>
                    <span className="text-sm text-muted-foreground">{item.count} reservations</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5">
            <SectionHeading
              title="Reservation Records"
              description={`${filteredReservations.length} records matching your filters`}
            />

            <div className="mt-4">
              <DataTable
                headers={[
                  "Reference",
                  "Customer",
                  "Room",
                  "Date",
                  "Duration",
                  "Status",
                  "Payment",
                  "Total",
                ]}
                empty={filteredReservations.length === 0}
                colSpan={8}
              >
                {paginatedReservations.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-3 py-3 font-medium">{item.reference_code}</td>
                    <td className="px-3 py-3">{customerName(profiles, item.user_id)}</td>
                    <td className="px-3 py-3">{roomName(item)}</td>
                    <td className="px-3 py-3">{fmtDate(item.booking_date)}</td>
                    <td className="px-3 py-3">
                      {hoursBetween(item.start_time, item.end_time).toFixed(1)} hrs
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={item.payment_status} />
                    </td>
                    <td className="px-3 py-3 text-right font-medium">
                      {peso(Number(item.room_total || 0))}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>

            <TablePagination
              page={reservationPage}
              totalItems={filteredReservations.length}
              pageSize={PAGE_SIZE}
              onPageChange={(page) =>
                setReservationPage(Math.min(Math.max(1, page), reservationTotalPages))
              }
            />
          </div>
        </div>
      )}

      {/* ROOM PERFORMANCE TAB */}
      {tab === "rooms" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              title="Rooms Listed"
              value={String(rooms.length)}
              note="Configured karaoke rooms"
              icon={Music}
            />

            <MetricCard
              title="Total Booked Hours"
              value={`${totalBookedHours.toFixed(1)} hrs`}
              note="Approved, checked-in, and completed bookings"
              icon={Clock}
            />

            <MetricCard
              title="Overall Utilization"
              value={`${utilization.toFixed(1)}%`}
              note="Selected date range"
              icon={BarChart3}
            />
          </div>

          <div className="rounded-xl border bg-card p-5">
            <SectionHeading title="Room Performance" />

            <div className="mt-4">
              <DataTable
                headers={["Room", "Bookings", "Booked Hours", "Revenue", "Utilization"]}
                empty={roomPerformance.length === 0}
              >
                {roomPerformance.map((room) => (
                  <tr key={room.id} className="border-b last:border-0">
                    <td className="px-3 py-3">
                      <p className="font-medium">{room.name}</p>
                      <p className="text-xs text-muted-foreground">Room {room.room_number}</p>
                    </td>
                    <td className="px-3 py-3">{room.bookings}</td>
                    <td className="px-3 py-3">{room.bookedHours.toFixed(1)} hrs</td>
                    <td className="px-3 py-3 font-medium">{peso(room.revenue)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${room.utilization}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs">{room.utilization.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Most Booked Room</p>
              <p className="mt-1 font-semibold">{mostBooked?.name ?? "No data"}</p>
              <p className="text-xs text-muted-foreground">{mostBooked?.bookings ?? 0} bookings</p>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Least Booked Active Room</p>
              <p className="mt-1 font-semibold">{leastBooked?.name ?? "No data"}</p>
              <p className="text-xs text-muted-foreground">{leastBooked?.bookings ?? 0} bookings</p>
            </div>
          </div>
        </div>
      )}

      {/* FOOD SALES TAB */}
      {tab === "food" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              title="Food Revenue"
              value={peso(foodRevenue)}
              note="Paid food orders"
              icon={Utensils}
            />

            <MetricCard
              title="Paid Food Orders"
              value={String(paidOrders.length)}
              note="Non-cancelled paid orders"
              icon={Receipt}
            />

            <MetricCard
              title="Food Order Records"
              value={String(filteredOrders.length)}
              note="Matching selected filters"
              icon={FileSpreadsheet}
            />
          </div>

          <div className="rounded-xl border bg-card p-5">
            <SectionHeading
              title="Bestselling Food Items"
              description="Top-selling items from paid food orders"
            />

            <div className="mt-4">
              <DataTable
                headers={["Food Item", "Quantity Sold", "Revenue"]}
                empty={foodItems.length === 0}
                emptyMessage="No food sales recorded yet."
              >
                {foodItems.map((item) => (
                  <tr key={item.name} className="border-b last:border-0">
                    <td className="px-3 py-3 font-medium">{item.name}</td>
                    <td className="px-3 py-3">{item.quantity}</td>
                    <td className="px-3 py-3 text-right font-medium">{peso(item.revenue)}</td>
                  </tr>
                ))}
              </DataTable>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <SectionHeading
              title="Food Order Records"
              description={`${filteredOrders.length} records matching your filters`}
            />

            <div className="mt-4">
              <DataTable
                headers={["Reference", "Customer", "Reservation", "Status", "Payment", "Total"]}
                empty={filteredOrders.length === 0}
                colSpan={6}
              >
                {paginatedOrders.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-3 py-3 font-medium">{item.reference_code}</td>
                    <td className="px-3 py-3">{customerName(profiles, item.user_id)}</td>
                    <td className="px-3 py-3">{item.reservations?.reference_code ?? "—"}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={item.payment_status} />
                    </td>
                    <td className="px-3 py-3 text-right font-medium">
                      {peso(Number(item.food_subtotal || 0))}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>

            <TablePagination
              page={foodOrderPage}
              totalItems={filteredOrders.length}
              pageSize={PAGE_SIZE}
              onPageChange={(page) =>
                setFoodOrderPage(Math.min(Math.max(1, page), foodOrderTotalPages))
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
