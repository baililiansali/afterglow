import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Wallet,
  Wrench,
  AlertTriangle,
  Plus,
  Trash2,
  Loader2,
  ReceiptText,
  Users,
  CalendarDays,
  Search,
  ChevronDown,
  Eye,
  X,
  Gift,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
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
import { Pagination } from "@/components/Pagination";

type ExpenseCategory = "salary" | "bonus" | "maintenance" | "damage" | "tax" | "other";
type ViewFilter = "all" | "salary" | "bonus" | "maintenance" | "damage";

type StaffOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean | null;
};

type MaintenanceRoomOption = {
  id: string;
  name: string;
  room_number: string | null;
  maintenance_status: boolean;
};

type ExpenseRow = {
  id: string;
  category: ExpenseCategory;
  description: string | null;
  amount: number | string;
  expense_date: string;
  created_at: string;
  staff_id: string | null;
  damage_room_name: string | null;
  damage_item: string | null;
  damage_quantity: number | string | null;
  damage_unit_price: number | string | null;
};

type ExpenseForm = {
  category: "salary" | "maintenance" | "damage";
  staffId: string;
  description: string;
  amount: string;
  bonusAmount: string;
  expenseDate: string;
  maintenanceRoomId: string;
  roomName: string;
  damageItem: string;
  quantity: string;
  unitPrice: string;
};

const today = () => {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};

const initialForm = (): ExpenseForm => ({
  category: "salary",
  staffId: "",
  description: "",
  amount: "",
  bonusAmount: "",
  expenseDate: today(),
  maintenanceRoomId: "",
  roomName: "",
  damageItem: "",
  quantity: "1",
  unitPrice: "",
});

function money(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getCategoryLabel(category: ExpenseCategory) {
  switch (category) {
    case "salary":
      return "Salary";
    case "bonus":
      return "Bonus";
    case "maintenance":
      return "Maintenance";
    case "damage":
      return "Damages";
    case "tax":
      return "Tax";
    default:
      return "Other";
  }
}

function CategoryBadge({ category }: { category: ExpenseCategory }) {
  const styles: Record<ExpenseCategory, string> = {
    salary: "bg-primary/15 text-primary",
    bonus: "bg-chart-4/15 text-chart-4",
    maintenance: "bg-accent/15 text-accent",
    damage: "bg-chart-4/15 text-chart-4",
    tax: "bg-secondary text-muted-foreground",
    other: "bg-secondary text-muted-foreground",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[category]}`}
    >
      {getCategoryLabel(category)}
    </span>
  );
}

function SummaryCard({
  label,
  amount,
  count,
  icon,
}: {
  label: string;
  amount: number;
  count: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 break-words font-display text-xl font-bold tabular-nums sm:text-2xl">
            {money(amount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {count} {count === 1 ? "record" : "records"}
          </p>
        </div>
        <div className="rounded-lg bg-primary/10 p-3 text-primary">{icon}</div>
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border py-3 last:border-0 sm:grid-cols-[140px_1fr] sm:gap-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="min-w-0 break-words text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

export function ExpenseLiquidation() {
  const queryClient = useQueryClient();

  const [form, setForm] = useState<ExpenseForm>(initialForm);
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRow | null>(null);

  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(5);

  const [staffSearch, setStaffSearch] = useState("");
  const [staffDropdownOpen, setStaffDropdownOpen] = useState(false);

  const {
    data: staff = [],
    isLoading: staffLoading,
    isError: staffError,
  } = useQuery({
    queryKey: ["expense-liquidation-staff"],
    queryFn: async (): Promise<StaffOption[]> => {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "staff");

      if (roleError) throw roleError;

      const staffIds = [...new Set((roleRows ?? []).map((row) => row.user_id))];

      if (staffIds.length === 0) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, is_active")
        .in("id", staffIds)
        .order("full_name", { ascending: true });

      if (error) throw error;

      return (data ?? []) as StaffOption[];
    },
  });

  const {
    data: maintenanceRooms = [],
    isLoading: maintenanceRoomsLoading,
    isError: maintenanceRoomsError,
  } = useQuery({
    queryKey: ["expense-liquidation-maintenance-rooms"],
    queryFn: async (): Promise<MaintenanceRoomOption[]> => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, room_number, maintenance_status")
        .eq("maintenance_status", true)
        .order("name", { ascending: true });

      if (error) throw error;

      return (data ?? []) as MaintenanceRoomOption[];
    },
    refetchOnWindowFocus: true,
  });

  const {
    data: expenses = [],
    isLoading: expensesLoading,
    isError: expensesError,
    error: expensesQueryError,
  } = useQuery({
    queryKey: ["business-expenses"],
    queryFn: async (): Promise<ExpenseRow[]> => {
      const { data, error } = await supabase
        .from("business_expenses")
        .select(
          "id, category, description, amount, expense_date, created_at, staff_id, damage_room_name, damage_item, damage_quantity, damage_unit_price",
        )
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data ?? []) as ExpenseRow[];
    },
  });

  const staffNames = useMemo(() => {
    return new Map(
      staff.map((person) => [person.id, person.full_name || person.email || "Unnamed Staff"]),
    );
  }, [staff]);

  const selectedStaff = staff.find((person) => person.id === form.staffId);

  const selectedMaintenanceRoom = maintenanceRooms.find(
    (room) => room.id === form.maintenanceRoomId,
  );

  const filteredStaff = useMemo(() => {
    const search = staffSearch.trim().toLowerCase();

    if (!search) return staff;

    return staff.filter((person) => {
      const name = (person.full_name || "").toLowerCase();
      const email = (person.email || "").toLowerCase();

      return name.includes(search) || email.includes(search);
    });
  }, [staff, staffSearch]);

  const salaryExpenses = expenses.filter((item) => item.category === "salary");
  const bonusExpenses = expenses.filter((item) => item.category === "bonus");
  const maintenanceExpenses = expenses.filter((item) => item.category === "maintenance");
  const damageExpenses = expenses.filter((item) => item.category === "damage");

  const salaryTotal = salaryExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const bonusTotal = bonusExpenses.reduce((sum, item) => sum + Number(item.amount), 0);

  const maintenanceTotal = maintenanceExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const damageTotal = damageExpenses.reduce((sum, item) => sum + Number(item.amount), 0);

  const totalMaintenance = maintenanceTotal + damageTotal;
  const totalExpenses = salaryTotal + bonusTotal + totalMaintenance;

  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      if (fromDate && item.expense_date < fromDate) return false;
      if (toDate && item.expense_date > toDate) return false;

      if (filter === "all") return true;

      if (filter === "maintenance") {
        return item.category === "maintenance" || item.category === "damage";
      }

      return item.category === filter;
    });
  }, [expenses, filter, fromDate, toDate]);

  const totalHistoryPages = Math.max(1, Math.ceil(filteredExpenses.length / historyPageSize));
  const currentHistoryPage = Math.min(historyPage, totalHistoryPages);

  const paginatedExpenses = filteredExpenses.slice(
    (currentHistoryPage - 1) * historyPageSize,
    currentHistoryPage * historyPageSize,
  );

  const damageTotalForForm = Number(form.quantity || 0) * Number(form.unitPrice || 0);

  function updateForm<K extends keyof ExpenseForm>(key: K, value: ExpenseForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const description = form.description.trim();

    if (!form.expenseDate) {
      toast.error("Please select an expense date.");
      return;
    }

    let amount = 0;
    let bonusAmount = 0;
    let staffId: string | null = null;
    let damageRoomName: string | null = null;
    let damageItem: string | null = null;
    let damageQuantity: number | null = null;
    let damageUnitPrice: number | null = null;

    if (form.category === "salary") {
      if (!form.staffId) {
        toast.error("Please select a staff member.");
        return;
      }

      amount = Number(form.amount);
      staffId = form.staffId;
      bonusAmount = form.bonusAmount.trim() ? Number(form.bonusAmount) : 0;

      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Enter a valid salary amount.");
        return;
      }

      if (!Number.isFinite(bonusAmount) || bonusAmount < 0) {
        toast.error("Enter a valid bonus amount.");
        return;
      }
    }

    if (form.category === "maintenance") {
      amount = Number(form.amount);

      if (!form.maintenanceRoomId || !selectedMaintenanceRoom) {
        toast.error("Please select a room that is currently under maintenance.");
        return;
      }

      damageRoomName =
        selectedMaintenanceRoom.name || selectedMaintenanceRoom.room_number || "Unnamed Room";

      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Enter a valid maintenance amount.");
        return;
      }

      if (!description) {
        toast.error("Please enter a maintenance description.");
        return;
      }
    }

    if (form.category === "damage") {
      damageRoomName = form.roomName.trim();
      damageItem = form.damageItem.trim();
      damageQuantity = Number(form.quantity);
      damageUnitPrice = Number(form.unitPrice);
      amount = damageQuantity * damageUnitPrice;

      if (!damageRoomName || !damageItem) {
        toast.error("Please enter the room name and damaged item.");
        return;
      }

      if (
        !Number.isFinite(damageQuantity) ||
        damageQuantity <= 0 ||
        !Number.isFinite(damageUnitPrice) ||
        damageUnitPrice <= 0 ||
        !Number.isInteger(damageQuantity)
      ) {
        toast.error("Enter a valid whole-number quantity and unit price.");
        return;
      }
    }

    setSaving(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      const expenseDescription =
        description ||
        (form.category === "salary"
          ? "Salary payment"
          : form.category === "damage"
            ? `Damage record: ${damageItem}`
            : "Maintenance expense");

      const basePayload = {
        description: expenseDescription,
        expense_date: form.expenseDate,
        created_by: user?.id ?? null,
        staff_id: staffId,
        damage_room_name: damageRoomName,
        damage_item: damageItem,
        damage_quantity: damageQuantity,
        damage_unit_price: damageUnitPrice,
      };

      const recordsToInsert =
        form.category === "salary"
          ? [
              {
                ...basePayload,
                category: "salary",
                amount,
              },
              ...(bonusAmount > 0
                ? [
                    {
                      ...basePayload,
                      category: "bonus",
                      description: description || "Bonus payment",
                      amount: bonusAmount,
                    },
                  ]
                : []),
            ]
          : [
              {
                ...basePayload,
                category: form.category,
                amount,
              },
            ];

      const { error } = await supabase.from("business_expenses").insert(recordsToInsert);

      if (error) throw error;

      toast.success(
        form.category === "salary"
          ? bonusAmount > 0
            ? "Salary and bonus records added."
            : "Salary record added."
          : "Expense record added.",
      );

      setForm(initialForm());
      setStaffSearch("");
      setStaffDropdownOpen(false);
      setHistoryPage(1);

      await queryClient.invalidateQueries({
        queryKey: ["business-expenses"],
      });

      await queryClient.invalidateQueries({
        queryKey: ["admin-staff-salary-records"],
      });
    } catch (error: unknown) {
      console.error("Expense save error:", error);

      const message =
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : "Unable to save expense record. Check the browser console for details.";

      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(expense: ExpenseRow) {
    const confirmed = window.confirm(
      `Delete this ${getCategoryLabel(expense.category).toLowerCase()} expense record?`,
    );

    if (!confirmed) return;

    setDeletingId(expense.id);

    try {
      const { error } = await supabase.from("business_expenses").delete().eq("id", expense.id);

      if (error) throw error;

      toast.success("Expense record deleted.");

      if (selectedExpense?.id === expense.id) {
        setSelectedExpense(null);
      }

      await queryClient.invalidateQueries({
        queryKey: ["business-expenses"],
      });

      await queryClient.invalidateQueries({
        queryKey: ["admin-staff-salary-records"],
      });
    } catch (error) {
      console.error("Expense delete error:", error);

      toast.error(error instanceof Error ? error.message : "Unable to delete expense record.");
    } finally {
      setDeletingId(null);
    }
  }

  const isLoading = staffLoading || expensesLoading;

  return (
    <div className="mt-4 space-y-6 text-foreground">
      <div>
        <h2 className="font-display text-xl font-bold">Expense Liquidation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Record and monitor staff salaries, bonuses, maintenance costs, and room damages.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Salary Expenses"
          amount={salaryTotal}
          count={salaryExpenses.length}
          icon={<Users className="h-5 w-5" />}
        />

        <SummaryCard
          label="Bonus Expenses"
          amount={bonusTotal}
          count={bonusExpenses.length}
          icon={<Gift className="h-5 w-5" />}
        />

        <SummaryCard
          label="Maintenance Expenses"
          amount={totalMaintenance}
          count={maintenanceExpenses.length + damageExpenses.length}
          icon={<Wrench className="h-5 w-5" />}
        />

        <SummaryCard
          label="Total Expenses"
          amount={totalExpenses}
          count={
            salaryExpenses.length +
            bonusExpenses.length +
            maintenanceExpenses.length +
            damageExpenses.length
          }
          icon={<Wallet className="h-5 w-5" />}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-5 flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Plus className="h-5 w-5" />
          </div>

          <div>
            <h3 className="font-semibold">Add Expense Record</h3>
            <p className="text-xs text-muted-foreground">
              Choose an expense type and enter its details.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expense-category">Expense Type</Label>

              <Select
                value={form.category}
                onValueChange={(value) => {
                  updateForm("category", value as ExpenseForm["category"]);
                }}
              >
                <SelectTrigger id="expense-category" className="h-10 w-full">
                  <SelectValue placeholder="Select expense type" />
                </SelectTrigger>

                <SelectContent position="popper" className="max-h-60">
                  <SelectItem value="salary" className="cursor-pointer">
                    Salary
                  </SelectItem>
                  <SelectItem value="maintenance" className="cursor-pointer">
                    Maintenance
                  </SelectItem>
                  <SelectItem value="damage" className="cursor-pointer">
                    Damages
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-date">
                {form.category === "salary" ? "Payment Date" : "Expense Date"}
              </Label>

              <Input
                id="expense-date"
                type="date"
                value={form.expenseDate}
                onChange={(event) => updateForm("expenseDate", event.target.value)}
                required
                className="h-10 w-full [color-scheme:dark]"
              />
            </div>
          </div>

          {form.category === "salary" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="salary-staff-search">Staff Member</Label>

                <div
                  className="relative"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setStaffDropdownOpen(false);
                    }
                  }}
                >
                  <button
                    type="button"
                    disabled={staffLoading || staff.length === 0}
                    aria-haspopup="listbox"
                    aria-expanded={staffDropdownOpen}
                    onClick={() => {
                      setStaffDropdownOpen((open) => !open);
                      setStaffSearch("");
                    }}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span
                      className={
                        selectedStaff
                          ? "truncate text-foreground"
                          : "truncate text-muted-foreground"
                      }
                    >
                      {staffLoading
                        ? "Loading staff..."
                        : selectedStaff
                          ? selectedStaff.full_name || selectedStaff.email || "Unnamed Staff"
                          : "Select staff member"}
                    </span>

                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </button>

                  {staffDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
                      <div className="relative p-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                        <Input
                          id="salary-staff-search"
                          autoFocus
                          value={staffSearch}
                          onChange={(event) => setStaffSearch(event.target.value)}
                          placeholder="Search staff name or email..."
                          className="h-9 pl-9"
                        />
                      </div>

                      <div
                        role="listbox"
                        aria-label="Staff members"
                        className="max-h-52 overflow-y-auto py-1"
                      >
                        {filteredStaff.length === 0 ? (
                          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                            No staff members found.
                          </p>
                        ) : (
                          filteredStaff.map((person) => {
                            const isSelected = form.staffId === person.id;

                            return (
                              <button
                                key={person.id}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                  updateForm("staffId", person.id);
                                  setStaffSearch("");
                                  setStaffDropdownOpen(false);
                                }}
                                className={`flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                                  isSelected ? "bg-accent/60" : ""
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">
                                    {person.full_name || "Unnamed Staff"}
                                    {person.is_active === false ? " (Inactive)" : ""}
                                  </span>

                                  {person.email && (
                                    <span className="block truncate text-xs text-muted-foreground">
                                      {person.email}
                                    </span>
                                  )}
                                </span>

                                {isSelected && (
                                  <span className="ml-2 text-xs font-medium text-primary">
                                    Selected
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {staffError && (
                  <p className="text-xs text-destructive">
                    Unable to load staff accounts. Please refresh and try again.
                  </p>
                )}

                {!staffLoading && !staffError && staff.length === 0 && (
                  <p className="text-xs text-muted-foreground">No staff accounts are available.</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="salary-amount">Salary Amount (₱)</Label>

                  <Input
                    id="salary-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(event) => updateForm("amount", event.target.value)}
                    placeholder="Enter salary amount"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="salary-bonus">Bonus Amount (₱) — Optional</Label>

                  <Input
                    id="salary-bonus"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.bonusAmount}
                    onChange={(event) => updateForm("bonusAmount", event.target.value)}
                    placeholder="Enter bonus amount"
                  />
                  <p className="text-xs text-muted-foreground">
                    A separate bonus record will be created when an amount is entered.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="salary-description">Description / Notes (Optional)</Label>

                <Input
                  id="salary-description"
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  placeholder="e.g. November salary"
                  maxLength={250}
                />
              </div>
            </>
          )}

          {form.category === "maintenance" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="maintenance-room">Room Under Maintenance</Label>

                <Select
                  value={form.maintenanceRoomId}
                  onValueChange={(value) => {
                    updateForm("maintenanceRoomId", value);
                  }}
                  disabled={maintenanceRoomsLoading || maintenanceRooms.length === 0}
                >
                  <SelectTrigger id="maintenance-room" className="h-10 w-full">
                    <SelectValue
                      placeholder={
                        maintenanceRoomsLoading
                          ? "Loading rooms..."
                          : "Select a room under maintenance"
                      }
                    />
                  </SelectTrigger>

                  <SelectContent position="popper" className="max-h-60">
                    {maintenanceRooms.map((room) => (
                      <SelectItem key={room.id} value={room.id} className="cursor-pointer">
                        {room.name}
                        {room.room_number ? ` (${room.room_number})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {maintenanceRoomsError ? (
                  <p className="text-xs text-destructive">
                    Unable to load rooms under maintenance. Please refresh and try again.
                  </p>
                ) : !maintenanceRoomsLoading && maintenanceRooms.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No rooms are currently marked as under maintenance. Enable maintenance in the
                    Rooms tab to make a room available here.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Only rooms with maintenance enabled in the Rooms tab are shown.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="maintenance-description">Maintenance Description</Label>

                <Input
                  id="maintenance-description"
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  placeholder="e.g. Air conditioner repair"
                  required
                  maxLength={250}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maintenance-amount">Amount (₱)</Label>

                <Input
                  id="maintenance-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => updateForm("amount", event.target.value)}
                  placeholder="Enter maintenance cost"
                  required
                />
              </div>
            </>
          )}

          {form.category === "damage" && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="damage-room">Room Name</Label>

                  <Input
                    id="damage-room"
                    value={form.roomName}
                    onChange={(event) => updateForm("roomName", event.target.value)}
                    placeholder="e.g. Neon Nook 01"
                    required
                    maxLength={120}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="damage-item">Damaged Item</Label>

                  <Input
                    id="damage-item"
                    value={form.damageItem}
                    onChange={(event) => updateForm("damageItem", event.target.value)}
                    placeholder="e.g. Microphone"
                    required
                    maxLength={120}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="damage-quantity">Quantity</Label>

                  <Input
                    id="damage-quantity"
                    type="number"
                    min="1"
                    step="1"
                    value={form.quantity}
                    onChange={(event) => updateForm("quantity", event.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="damage-unit-price">Unit Price (₱)</Label>

                  <Input
                    id="damage-unit-price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.unitPrice}
                    onChange={(event) => updateForm("unitPrice", event.target.value)}
                    placeholder="Enter item price"
                    required
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                <p className="text-sm text-muted-foreground">Damage Total</p>

                <p className="mt-1 font-display text-xl font-bold tabular-nums">
                  {money(damageTotalForForm)}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">Quantity × Unit Price</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="damage-description">Additional Notes (Optional)</Label>

                <Input
                  id="damage-description"
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  placeholder="Add details about the damage"
                  maxLength={250}
                />
              </div>
            </>
          )}

          <div className="flex justify-end border-t border-border pt-4">
            <Button
              type="submit"
              disabled={
                saving ||
                (form.category === "salary" && staff.length === 0) ||
                (form.category === "maintenance" &&
                  (maintenanceRoomsLoading || maintenanceRooms.length === 0))
              }
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-4 border-b border-border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold">Expense History</h3>
              <p className="text-xs text-muted-foreground">Review previously recorded expenses.</p>
            </div>

            <Select
              value={filter}
              onValueChange={(value) => {
                setFilter(value as ViewFilter);
                setHistoryPage(1);
              }}
            >
              <SelectTrigger
                aria-label="Filter expenses"
                className="h-9 w-full sm:w-auto sm:min-w-[230px]"
              >
                <SelectValue placeholder="Filter expenses" />
              </SelectTrigger>

              <SelectContent position="popper" className="max-h-60">
                <SelectItem value="all" className="cursor-pointer">
                  All Expenses
                </SelectItem>
                <SelectItem value="salary" className="cursor-pointer">
                  Salary
                </SelectItem>
                <SelectItem value="bonus" className="cursor-pointer">
                  Bonus
                </SelectItem>
                <SelectItem value="maintenance" className="cursor-pointer">
                  Maintenance (including damages)
                </SelectItem>
                <SelectItem value="damage" className="cursor-pointer">
                  Damages Only
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expense-from-date">From Date</Label>

              <Input
                id="expense-from-date"
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setHistoryPage(1);
                }}
                className="h-10 w-full [color-scheme:dark]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-to-date">To Date</Label>

              <Input
                id="expense-to-date"
                type="date"
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setHistoryPage(1);
                }}
                className="h-10 w-full [color-scheme:dark]"
              />
            </div>
          </div>

          {(fromDate || toDate) && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  setHistoryPage(1);
                }}
                className="text-muted-foreground"
              >
                Clear date filters
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex min-h-[220px] items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Loading expense records...
          </div>
        ) : expensesError ? (
          <div className="p-8 text-center text-sm text-destructive">
            {expensesQueryError instanceof Error
              ? expensesQueryError.message
              : "Unable to load expense records."}
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <ReceiptText className="mx-auto mb-3 h-9 w-9 opacity-40" />

            <p className="font-medium">No expense records found.</p>

            <p className="mt-1 text-xs">
              Try changing the selected filters or add an expense above.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-secondary/50 text-left text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium">Category</th>
                    <th className="p-3 font-medium">Staff / Room</th>
                    <th className="p-3 text-right font-medium">Amount</th>
                    <th className="p-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedExpenses.map((expense) => (
                    <tr
                      key={expense.id}
                      className="border-t border-border transition-colors hover:bg-secondary/30"
                    >
                      <td className="whitespace-nowrap p-3 text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatDate(expense.expense_date)}
                        </span>
                      </td>

                      <td className="p-3">
                        <CategoryBadge category={expense.category} />
                      </td>

                      <td className="p-3 text-muted-foreground">
                        {expense.category === "salary" || expense.category === "bonus"
                          ? staffNames.get(expense.staff_id ?? "") || "Staff member"
                          : expense.category === "damage" || expense.category === "maintenance"
                            ? expense.damage_room_name || "—"
                            : "—"}
                      </td>

                      <td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums">
                        {money(Number(expense.amount))}
                      </td>

                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="View expense details"
                            aria-label="View expense details"
                            onClick={() => setSelectedExpense(expense)}
                            className="text-muted-foreground hover:text-primary"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Delete expense"
                            aria-label="Delete expense"
                            disabled={deletingId === expense.id}
                            onClick={() => void handleDelete(expense)}
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            {deletingId === expense.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4">
              <Pagination
                page={currentHistoryPage}
                pageSize={historyPageSize}
                totalItems={filteredExpenses.length}
                onPageChange={setHistoryPage}
                onPageSizeChange={setHistoryPageSize}
                pageSizeOptions={[5, 10]}
                itemLabel="expenses"
              />
            </div>
          </>
        )}
      </div>

      {selectedExpense && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedExpense(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-details-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <ReceiptText className="h-5 w-5" />
                </div>

                <div>
                  <h3 id="expense-details-title" className="font-semibold">
                    Expense Details
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Complete information for this expense record.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close expense details"
                onClick={() => setSelectedExpense(null)}
                className="shrink-0 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <CategoryBadge category={selectedExpense.category} />
                <span className="text-sm text-muted-foreground">
                  {formatDate(selectedExpense.expense_date)}
                </span>
              </div>

              <div className="divide-y divide-border">
                <DetailRow label="Expense Type">
                  {getCategoryLabel(selectedExpense.category)}
                </DetailRow>

                <DetailRow label="Expense Date">
                  {formatDate(selectedExpense.expense_date)}
                </DetailRow>

                {(selectedExpense.category === "salary" ||
                  selectedExpense.category === "bonus") && (
                  <DetailRow label="Staff Member">
                    {staffNames.get(selectedExpense.staff_id ?? "") || "Staff member"}
                  </DetailRow>
                )}

                {(selectedExpense.category === "maintenance" ||
                  selectedExpense.category === "damage") && (
                  <DetailRow label="Room Name">{selectedExpense.damage_room_name || "—"}</DetailRow>
                )}

                {selectedExpense.category === "damage" && (
                  <>
                    <DetailRow label="Damaged Item">{selectedExpense.damage_item || "—"}</DetailRow>

                    <DetailRow label="Quantity">{selectedExpense.damage_quantity ?? "—"}</DetailRow>

                    <DetailRow label="Unit Price">
                      {selectedExpense.damage_unit_price != null
                        ? money(Number(selectedExpense.damage_unit_price))
                        : "—"}
                    </DetailRow>
                  </>
                )}

                <DetailRow label="Description / Notes">
                  {selectedExpense.description?.trim() ? (
                    <p className="whitespace-pre-wrap">{selectedExpense.description}</p>
                  ) : (
                    <span className="font-normal text-muted-foreground">
                      No additional description.
                    </span>
                  )}
                </DetailRow>
              </div>

              <div className="mt-5 rounded-lg border border-border bg-secondary/40 p-4">
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                  {money(Number(selectedExpense.amount))}
                </p>
                {selectedExpense.category === "damage" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Number(selectedExpense.damage_quantity || 0)} ×{" "}
                    {money(Number(selectedExpense.damage_unit_price || 0))}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-border p-4">
              <Button type="button" onClick={() => setSelectedExpense(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

        <p>
          Bonuses are stored separately from salary and included in Total Expenses. Damages are
          included in the Maintenance summary. Separate damage records are shown for tracking, but
          counted only once in Total Expenses. Maintenance expenses are associated with rooms
          currently marked under maintenance in the Rooms tab.
        </p>
      </div>
    </div>
  );
}

export default ExpenseLiquidation;
