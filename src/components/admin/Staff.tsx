import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Pencil,
  UserCheck,
  Users,
  Loader2,
  Mail,
  Phone,
  CalendarDays,
  X,
  CheckCircle2,
  XCircle,
  Power,
  Trash2,
  Wallet,
  ReceiptText,
  Eye,
  ChevronDown,
  UserRound,
  Gift,
  History,
  PhilippinePeso,
  Filter,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pagination } from "@/components/Pagination";

type StaffRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

type StaffSalaryRow = {
  id: string;
  category: "salary" | "bonus";
  staff_id: string | null;
  description: string | null;
  amount: number | string;
  expense_date: string;
  created_at: string | null;
};

type StaffSalaryRateRow = {
  id: string;
  staff_id: string | null;
  staff_name: string;
  monthly_salary: number | string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
};

type StaffForm = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
};

type SalaryRateForm = {
  monthlySalary: string;
  effectiveFrom: string;
};

const emptyForm: StaffForm = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
};

function getTodayDate() {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function getCurrentMonth() {
  return getTodayDate().slice(0, 7);
}

const emptySalaryRateForm: SalaryRateForm = {
  monthlySalary: "",
  effectiveFrom: getTodayDate(),
};

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(value: number | string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatMonth(value: string) {
  if (!value) return "Selected month";

  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
  });
}

function getInitials(name: string | null) {
  if (!name) return "??";

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getPreviousDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() - 1);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getPageItems<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * pageSize;

  return items.slice(startIndex, startIndex + pageSize);
}

function AccountStatus({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        active ? "bg-primary/15 text-primary" : "bg-destructive/10 text-destructive"
      }`}
    >
      {active ? "Active" : "Deactivated"}
    </span>
  );
}

function PaymentStatus({ paid }: { paid: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        paid ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
      }`}
    >
      {paid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {paid ? "Paid" : "Not Paid"}
    </span>
  );
}

function SalaryCategoryBadge({ category }: { category: "salary" | "bonus" }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        category === "salary" ? "bg-primary/15 text-primary" : "bg-chart-4/15 text-chart-4"
      }`}
    >
      {category === "salary" ? "Salary" : "Bonus"}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: "primary" | "accent" | "destructive" | "chart";
}) {
  const accentStyles = {
    primary: "bg-primary/15 text-primary",
    accent: "bg-accent/15 text-accent",
    destructive: "bg-destructive/10 text-destructive",
    chart: "bg-chart-4/15 text-chart-4",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums">{value}</p>
        </div>

        <div className={`rounded-lg p-3 ${accentStyles[accent]}`}>{icon}</div>
      </div>
    </div>
  );
}

function SalarySummaryCard({
  label,
  amount,
  icon,
  accent,
}: {
  label: string;
  amount: number;
  icon: React.ReactNode;
  accent: "primary" | "chart" | "accent";
}) {
  const accentStyles = {
    primary: "bg-primary/15 text-primary",
    chart: "bg-chart-4/15 text-chart-4",
    accent: "bg-accent/15 text-accent",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 break-words font-display text-xl font-bold tabular-nums sm:text-2xl">
            {formatCurrency(amount)}
          </p>
        </div>

        <div className={`rounded-lg p-3 ${accentStyles[accent]}`}>{icon}</div>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  title,
  onClick,
  disabled,
  destructive = false,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg p-2 text-muted-foreground transition-colors disabled:opacity-50 ${
        destructive
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-secondary hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function Staff() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"staff" | "salary" | "salary-rates">("staff");

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffRow | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<StaffRow | null>(null);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);

  const [salaryStaffId, setSalaryStaffId] = useState("");
  const [salaryStaffSearch, setSalaryStaffSearch] = useState("");
  const [salaryStaffDropdownOpen, setSalaryStaffDropdownOpen] = useState(false);
  const [salaryFromDate, setSalaryFromDate] = useState("");
  const [salaryToDate, setSalaryToDate] = useState("");
  const [salaryHistorySearch, setSalaryHistorySearch] = useState("");
  const [salaryHistoryCategory, setSalaryHistoryCategory] = useState<"all" | "salary" | "bonus">(
    "all",
  );
  const [salaryHistoryFilterOpen, setSalaryHistoryFilterOpen] = useState(false);
  const [salaryMonth, setSalaryMonth] = useState(getCurrentMonth());
  const [selectedSalary, setSelectedSalary] = useState<StaffSalaryRow | null>(null);

  const [salaryRateDialogOpen, setSalaryRateDialogOpen] = useState(false);
  const [salaryRateStaff, setSalaryRateStaff] = useState<StaffRow | null>(null);
  const [salaryRateForm, setSalaryRateForm] = useState<SalaryRateForm>(emptySalaryRateForm);
  const [savingSalaryRate, setSavingSalaryRate] = useState(false);

  const [staffPage, setStaffPage] = useState(1);
  const [staffPageSize, setStaffPageSize] = useState(5);

  const [salaryRatesPage, setSalaryRatesPage] = useState(1);
  const [salaryRatesPageSize, setSalaryRatesPageSize] = useState(5);

  const [salaryHistoryPage, setSalaryHistoryPage] = useState(1);
  const [salaryHistoryPageSize, setSalaryHistoryPageSize] = useState(5);

  const [salaryRecordsPage, setSalaryRecordsPage] = useState(1);
  const [salaryRecordsPageSize, setSalaryRecordsPageSize] = useState(5);

  const {
    data: staff = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["admin-staff"],
    queryFn: async (): Promise<StaffRow[]> => {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "staff");

      if (roleError) throw roleError;

      const staffIds = [...new Set((roleRows ?? []).map((row) => row.user_id))];

      if (staffIds.length === 0) return [];

      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, is_active, created_at")
        .in("id", staffIds)
        .order("created_at", { ascending: false });

      if (profileError) throw profileError;

      return (profileRows ?? []) as StaffRow[];
    },
  });

  const {
    data: salaryRecords = [],
    isLoading: salaryLoading,
    isError: salaryError,
  } = useQuery({
    queryKey: ["admin-staff-salary-records"],
    queryFn: async (): Promise<StaffSalaryRow[]> => {
      const { data, error } = await supabase
        .from("business_expenses")
        .select("id, category, staff_id, description, amount, expense_date, created_at")
        .in("category", ["salary", "bonus"])
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data ?? []) as StaffSalaryRow[];
    },
  });

  const {
    data: salaryRates = [],
    isLoading: salaryRatesLoading,
    isError: salaryRatesError,
    error: salaryRatesQueryError,
  } = useQuery({
    queryKey: ["admin-staff-salary-rates"],
    queryFn: async (): Promise<StaffSalaryRateRow[]> => {
      const { data, error } = await supabase
        .from("staff_salary_rates")
        .select(
          "id, staff_id, staff_name, monthly_salary, effective_from, effective_to, created_at",
        )
        .order("effective_from", { ascending: false });

      if (error) throw error;

      return (data ?? []) as StaffSalaryRateRow[];
    },
  });

  const filteredStaff = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return staff;

    return staff.filter((person) =>
      [person.full_name, person.email, person.phone, person.id].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(term),
      ),
    );
  }, [staff, search]);

  const paginatedStaff = useMemo(
    () => getPageItems(filteredStaff, staffPage, staffPageSize),
    [filteredStaff, staffPage, staffPageSize],
  );

  const activeCount = staff.filter((person) => person.is_active !== false).length;
  const inactiveCount = staff.length - activeCount;

  const selectedStaff = staff.find((person) => person.id === salaryStaffId) ?? staff[0] ?? null;
  const selectedStaffId = selectedStaff?.id ?? "";

  const filteredSalaryStaff = useMemo(() => {
    const term = salaryStaffSearch.trim().toLowerCase();

    if (!term) return staff;

    return staff.filter((person) =>
      [person.full_name, person.email].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(term),
      ),
    );
  }, [staff, salaryStaffSearch]);

  const selectedStaffSalaryRecords = useMemo(() => {
    return salaryRecords.filter((record) => {
      if (record.staff_id !== selectedStaffId) return false;
      if (salaryFromDate && record.expense_date < salaryFromDate) return false;
      if (salaryToDate && record.expense_date > salaryToDate) return false;
      return true;
    });
  }, [salaryRecords, selectedStaffId, salaryFromDate, salaryToDate]);

  const filteredSalaryHistoryRecords = useMemo(() => {
    const term = salaryHistorySearch.trim().toLowerCase();

    return selectedStaffSalaryRecords.filter((record) => {
      if (salaryHistoryCategory !== "all" && record.category !== salaryHistoryCategory) {
        return false;
      }

      if (!term) return true;

      const description =
        record.description || (record.category === "bonus" ? "Bonus payment" : "Salary payment");

      const searchableValues = [
        description,
        record.category,
        record.expense_date,
        formatDate(record.expense_date),
        String(record.amount),
        formatCurrency(record.amount),
      ];

      return searchableValues.some((value) => value.toLowerCase().includes(term));
    });
  }, [selectedStaffSalaryRecords, salaryHistorySearch, salaryHistoryCategory]);

  const paginatedSalaryRecords = useMemo(
    () => getPageItems(filteredSalaryHistoryRecords, salaryRecordsPage, salaryRecordsPageSize),
    [filteredSalaryHistoryRecords, salaryRecordsPage, salaryRecordsPageSize],
  );

  const selectedStaffMonthlyRecords = useMemo(() => {
    if (!salaryMonth) return [];

    return salaryRecords.filter(
      (record) =>
        record.staff_id === selectedStaffId && record.expense_date.slice(0, 7) === salaryMonth,
    );
  }, [salaryRecords, selectedStaffId, salaryMonth]);

  const monthlySalaryRecords = selectedStaffMonthlyRecords.filter(
    (record) => record.category === "salary",
  );

  const monthlyBonusRecords = selectedStaffMonthlyRecords.filter(
    (record) => record.category === "bonus",
  );

  const monthlySalaryTotal = monthlySalaryRecords.reduce(
    (total, record) => total + (Number(record.amount) || 0),
    0,
  );

  const monthlyBonusTotal = monthlyBonusRecords.reduce(
    (total, record) => total + (Number(record.amount) || 0),
    0,
  );

  const monthlyCompensationTotal = monthlySalaryTotal + monthlyBonusTotal;
  const monthlyPaid = monthlySalaryRecords.length > 0;

  const selectedStaffSalaryTotal = selectedStaffSalaryRecords
    .filter((record) => record.category === "salary")
    .reduce((total, record) => total + (Number(record.amount) || 0), 0);

  const selectedStaffBonusTotal = selectedStaffSalaryRecords
    .filter((record) => record.category === "bonus")
    .reduce((total, record) => total + (Number(record.amount) || 0), 0);

  const currentSalaryRates = useMemo(
    () => salaryRates.filter((rate) => rate.effective_to === null),
    [salaryRates],
  );

  const paginatedSalaryRates = useMemo(
    () => getPageItems(staff, salaryRatesPage, salaryRatesPageSize),
    [staff, salaryRatesPage, salaryRatesPageSize],
  );

  const paginatedSalaryHistory = useMemo(
    () => getPageItems(salaryRates, salaryHistoryPage, salaryHistoryPageSize),
    [salaryRates, salaryHistoryPage, salaryHistoryPageSize],
  );

  const totalConfiguredMonthlySalary = currentSalaryRates.reduce(
    (total, rate) => total + (Number(rate.monthly_salary) || 0),
    0,
  );

  const staffWithoutSalary = staff.filter(
    (person) => !currentSalaryRates.some((rate) => rate.staff_id === person.id),
  ).length;

  const salaryHistoryByStaff = useMemo(() => {
    const grouped = new Map<string, StaffSalaryRateRow[]>();

    salaryRates.forEach((rate) => {
      if (!rate.staff_id) return;
      const current = grouped.get(rate.staff_id) ?? [];
      current.push(rate);
      grouped.set(rate.staff_id, current);
    });

    return grouped;
  }, [salaryRates]);

  function getCurrentRate(staffId: string) {
    return currentSalaryRates.find((rate) => rate.staff_id === staffId) ?? null;
  }

  useEffect(() => {
    setStaffPage(1);
  }, [search]);

  useEffect(() => {
    setSalaryRatesPage(1);
  }, [staff.length]);

  useEffect(() => {
    setSalaryHistoryPage(1);
  }, [salaryRates.length]);

  useEffect(() => {
    setSalaryRecordsPage(1);
  }, [selectedStaffId, salaryFromDate, salaryToDate, salaryHistorySearch, salaryHistoryCategory]);

  function openAddDialog() {
    setEditingStaff(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(person: StaffRow) {
    setEditingStaff(person);
    setForm({
      fullName: person.full_name ?? "",
      email: person.email ?? "",
      phone: person.phone ?? "",
      password: "",
    });
    setDialogOpen(true);
  }

  function openSalaryRateDialog(person: StaffRow) {
    const currentRate = getCurrentRate(person.id);

    setSalaryRateStaff(person);
    setSalaryRateForm({
      monthlySalary: currentRate ? String(currentRate.monthly_salary) : "",
      effectiveFrom: getTodayDate(),
    });
    setSalaryRateDialogOpen(true);
  }

  async function handleSalaryRateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!salaryRateStaff) return;

    const monthlySalary = Number(salaryRateForm.monthlySalary);
    const effectiveFrom = salaryRateForm.effectiveFrom;
    const today = getTodayDate();

    if (!Number.isFinite(monthlySalary) || monthlySalary <= 0) {
      toast.error("Enter a valid monthly salary greater than zero.");
      return;
    }

    if (!effectiveFrom) {
      toast.error("Please select an effective date.");
      return;
    }

    if (effectiveFrom > today) {
      toast.error("The effective date cannot be in the future.");
      return;
    }

    const existingRate = getCurrentRate(salaryRateStaff.id);

    if (existingRate && effectiveFrom < existingRate.effective_from) {
      toast.error(
        "The new effective date cannot be earlier than the current salary rate's start date.",
      );
      return;
    }

    setSavingSalaryRate(true);

    try {
      if (existingRate && effectiveFrom === existingRate.effective_from) {
        const { error } = await supabase
          .from("staff_salary_rates")
          .update({
            monthly_salary: monthlySalary,
            staff_name: salaryRateStaff.full_name || "Unnamed Staff",
          })
          .eq("id", existingRate.id);

        if (error) throw error;
      } else {
        if (existingRate) {
          const previousEffectiveTo = getPreviousDate(effectiveFrom);

          const { error: closeError } = await supabase
            .from("staff_salary_rates")
            .update({ effective_to: previousEffectiveTo })
            .eq("id", existingRate.id);

          if (closeError) throw closeError;
        }

        const { error: insertError } = await supabase.from("staff_salary_rates").insert({
          staff_id: salaryRateStaff.id,
          staff_name: salaryRateStaff.full_name || "Unnamed Staff",
          monthly_salary: monthlySalary,
          effective_from: effectiveFrom,
          effective_to: null,
        });

        if (insertError) throw insertError;
      }

      toast.success(
        existingRate ? "Staff salary rate updated." : "Monthly salary added successfully.",
      );

      setSalaryRateDialogOpen(false);
      setSalaryRateStaff(null);
      setSalaryRateForm(emptySalaryRateForm);

      await queryClient.invalidateQueries({
        queryKey: ["admin-staff-salary-rates"],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save salary rate.");
    } finally {
      setSavingSalaryRate(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();

    if (!fullName) {
      toast.error("Full name is required.");
      return;
    }

    if (!editingStaff && !email) {
      toast.error("Email address is required.");
      return;
    }

    if (!editingStaff && form.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setSaving(true);

    try {
      const payload = editingStaff
        ? {
            action: "update_profile",
            userId: editingStaff.id,
            fullName,
            phone,
          }
        : {
            action: "create_staff",
            fullName,
            email,
            phone,
            password: form.password,
          };

      const { data, error: functionError } = await supabase.functions.invoke("manage-staff", {
        body: payload,
      });

      if (functionError) {
        throw new Error(functionError.message || "Unable to save staff account.");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success(editingStaff ? "Staff details updated." : "Staff account created.");

      setDialogOpen(false);
      setForm(emptyForm);
      setEditingStaff(null);

      await queryClient.invalidateQueries({
        queryKey: ["admin-staff"],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(person: StaffRow) {
    const nextStatus = person.is_active === false;
    setChangingStatusId(person.id);

    try {
      const { data, error: functionError } = await supabase.functions.invoke("manage-staff", {
        body: {
          action: "set_active",
          userId: person.id,
          isActive: nextStatus,
        },
      });

      if (functionError) {
        throw new Error(functionError.message || "Unable to update staff status.");
      }

      if (data?.error) throw new Error(data.error);

      toast.success(nextStatus ? "Staff account activated." : "Staff account deactivated.");

      await queryClient.invalidateQueries({
        queryKey: ["admin-staff"],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update staff status.");
    } finally {
      setChangingStatusId(null);
    }
  }

  async function handleDeleteStaff() {
    if (!deletingStaff) return;

    setDeleting(true);

    try {
      const { data, error: functionError } = await supabase.functions.invoke("manage-staff", {
        body: {
          action: "delete_staff",
          userId: deletingStaff.id,
        },
      });

      if (functionError) {
        throw new Error(functionError.message || "Unable to delete staff account.");
      }

      if (data?.error) throw new Error(data.error);

      toast.success("Staff account deleted.");
      setDeletingStaff(null);

      await queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-staff-salary-records"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-staff-salary-rates"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to delete staff account.");
    } finally {
      setDeleting(false);
    }
  }

  function selectSalaryStaff(person: StaffRow) {
    setSalaryStaffId(person.id);
    setSalaryStaffSearch("");
    setSalaryStaffDropdownOpen(false);
    setSelectedSalary(null);
    setSalaryRecordsPage(1);
  }

  function clearSalaryDateFilters() {
    setSalaryFromDate("");
    setSalaryToDate("");
    setSalaryRecordsPage(1);
  }

  function clearSalaryHistoryFilters() {
    setSalaryHistoryCategory("all");
    setSalaryRecordsPage(1);
  }

  // The Filter dialog contains only the category filter.
  // Date filters are visible directly in the Salary & Bonus History toolbar.
  const activeSalaryHistoryFilterCount = salaryHistoryCategory !== "all" ? 1 : 0;

  const hasSalaryHistoryFilters =
    !!salaryHistorySearch || !!salaryFromDate || !!salaryToDate || salaryHistoryCategory !== "all";

  return (
    <div className="mt-4 space-y-4 text-foreground">
      <div>
        <h2 className="font-display text-xl font-bold">Staff Management</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage staff accounts, monthly salary rates, and individual salary records.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("staff")}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "staff"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" />
          Staff List
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("salary-rates")}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "salary-rates"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Wallet className="h-4 w-4" />
          Salary
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("salary")}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "salary"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ReceiptText className="h-4 w-4" />
          Salary Records
        </button>
      </div>

      {activeTab === "staff" ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Total Staff"
              value={staff.length}
              icon={<Users className="h-5 w-5" />}
              accent="primary"
            />
            <SummaryCard
              label="Active Staff"
              value={activeCount}
              icon={<CheckCircle2 className="h-5 w-5" />}
              accent="accent"
            />
            <SummaryCard
              label="Deactivated Staff"
              value={inactiveCount}
              icon={<XCircle className="h-5 w-5" />}
              accent="destructive"
            />
            <SummaryCard
              label="Staff Accounts"
              value={staff.length}
              icon={<UserCheck className="h-5 w-5" />}
              accent="chart"
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="staff-search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setStaffPage(1);
                  }}
                  placeholder="Search name, email, phone, or staff ID..."
                  className="h-10 w-full pl-9 pr-10"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setStaffPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button onClick={openAddDialog} className="h-10 shrink-0">
                <Plus className="mr-2 h-4 w-4" />
                Add Staff
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="font-semibold">Staff Accounts</h3>
                <p className="text-xs text-muted-foreground">
                  {filteredStaff.length} {filteredStaff.length === 1 ? "account" : "accounts"}
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="flex min-h-[250px] items-center justify-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Loading staff accounts...
              </div>
            ) : isError ? (
              <div className="p-10 text-center text-sm text-destructive">
                {error instanceof Error ? error.message : "Unable to load staff accounts."}
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">
                <Users className="mx-auto mb-3 h-9 w-9 opacity-40" />
                <p className="font-medium">
                  {search ? "No matching staff found." : "No staff accounts yet."}
                </p>
                <p className="mt-1 text-xs">
                  {search ? "Try changing your search." : "Add a staff account to get started."}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] whitespace-nowrap text-sm">
                    <thead className="bg-secondary/50 text-left text-muted-foreground">
                      <tr>
                        <th className="p-3 font-medium">Staff</th>
                        <th className="p-3 font-medium">Contact</th>
                        <th className="p-3 font-medium">Date Created</th>
                        <th className="p-3 font-medium">Account Status</th>
                        <th className="p-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedStaff.map((person) => {
                        const isActive = person.is_active !== false;
                        const isChanging = changingStatusId === person.id;

                        return (
                          <tr
                            key={person.id}
                            className="border-t border-border hover:bg-secondary/30"
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-primary/15 text-sm font-bold text-primary">
                                  {getInitials(person.full_name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium">
                                    {person.full_name || "Unnamed Staff"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    ID: {person.id.slice(0, 8).toUpperCase()}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Mail className="h-3.5 w-3.5 shrink-0" />
                                <span>{person.email || "—"}</span>
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                                <Phone className="h-3.5 w-3.5 shrink-0" />
                                <span>{person.phone || "—"}</span>
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {formatDate(person.created_at)}
                              </div>
                            </td>
                            <td className="p-3">
                              <AccountStatus active={isActive} />
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-end gap-1">
                                <ActionButton
                                  title="Edit Staff"
                                  onClick={() => openEditDialog(person)}
                                  disabled={isChanging}
                                >
                                  <Pencil className="h-4 w-4" />
                                </ActionButton>
                                <ActionButton
                                  title={isActive ? "Deactivate Account" : "Activate Account"}
                                  onClick={() => void toggleActive(person)}
                                  disabled={isChanging}
                                  destructive={isActive}
                                >
                                  {isChanging ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Power className="h-4 w-4" />
                                  )}
                                </ActionButton>
                                <ActionButton
                                  title="Delete Staff"
                                  onClick={() => setDeletingStaff(person)}
                                  disabled={isChanging}
                                  destructive
                                >
                                  <Trash2 className="h-4 w-4" />
                                </ActionButton>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3">
                  <Pagination
                    page={staffPage}
                    pageSize={staffPageSize}
                    totalItems={filteredStaff.length}
                    onPageChange={setStaffPage}
                    onPageSizeChange={(size) => {
                      setStaffPageSize(size);
                      setStaffPage(1);
                    }}
                    itemLabel="staff accounts"
                  />
                </div>
              </>
            )}
          </div>
        </>
      ) : activeTab === "salary-rates" ? (
        <>
          <div>
            <h3 className="font-display text-lg font-semibold">Staff Salary Management</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Set each staff member's basic monthly salary and manage salary rate changes.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SalarySummaryCard
              label="Total Monthly Salary"
              amount={totalConfiguredMonthlySalary}
              icon={<PhilippinePeso className="h-5 w-5" />}
              accent="primary"
            />
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Staff Without Salary</p>
                  <p className="mt-2 font-display text-2xl font-bold tabular-nums">
                    {staffWithoutSalary}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Staff members without a configured monthly rate.
                  </p>
                </div>
                <div className="rounded-lg bg-accent/15 p-3 text-accent">
                  <Users className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">Monthly Salary Rates</h3>
                <p className="text-xs text-muted-foreground">
                  Current configured basic salary for each staff member.
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {currentSalaryRates.length} configured rate
                {currentSalaryRates.length === 1 ? "" : "s"}
              </span>
            </div>

            {isLoading || salaryRatesLoading ? (
              <div className="flex min-h-[220px] items-center justify-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Loading salary information...
              </div>
            ) : isError || salaryRatesError ? (
              <div className="p-10 text-center text-sm text-destructive">
                {salaryRatesQueryError instanceof Error
                  ? salaryRatesQueryError.message
                  : "Unable to load salary information."}
              </div>
            ) : staff.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">
                <Users className="mx-auto mb-3 h-9 w-9 opacity-40" />
                <p className="font-medium">No staff members available</p>
                <p className="mt-1 text-xs">Add staff accounts before setting monthly salaries.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-secondary/50 text-left text-muted-foreground">
                      <tr>
                        <th className="p-3 font-medium">Staff Member</th>
                        <th className="p-3 font-medium">Monthly Salary</th>
                        <th className="p-3 font-medium">Effective From</th>
                        <th className="p-3 font-medium">Status</th>
                        <th className="p-3 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedSalaryRates.map((person) => {
                        const currentRate = getCurrentRate(person.id);
                        const history = salaryHistoryByStaff.get(person.id) ?? [];

                        return (
                          <tr
                            key={person.id}
                            className="border-t border-border hover:bg-secondary/30"
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-primary/15 text-xs font-bold text-primary">
                                  {getInitials(person.full_name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium">
                                    {person.full_name || "Unnamed Staff"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {person.email || "No email"}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 font-semibold tabular-nums">
                              {currentRate ? (
                                formatCurrency(currentRate.monthly_salary)
                              ) : (
                                <span className="font-normal text-muted-foreground">
                                  Not configured
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {currentRate ? formatDate(currentRate.effective_from) : "—"}
                            </td>
                            <td className="p-3">
                              {currentRate ? (
                                <span className="inline-flex rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
                                  Configured
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                                  Not Set
                                </span>
                              )}
                              {history.length > 1 && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {history.length} salary versions
                                </p>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={currentRate ? "outline" : "default"}
                                  onClick={() => openSalaryRateDialog(person)}
                                >
                                  <Pencil className="mr-2 h-3.5 w-3.5" />
                                  {currentRate ? "Edit Salary" : "Set Salary"}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3">
                  <Pagination
                    page={salaryRatesPage}
                    pageSize={salaryRatesPageSize}
                    totalItems={staff.length}
                    onPageChange={setSalaryRatesPage}
                    onPageSizeChange={(size) => {
                      setSalaryRatesPageSize(size);
                      setSalaryRatesPage(1);
                    }}
                    itemLabel="staff members"
                  />
                </div>
              </>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold">Salary Rate History</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Previous salary amounts and their effective periods are retained here.
              </p>
            </div>

            {salaryRatesLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Loading salary history...
              </div>
            ) : salaryRatesError ? (
              <div className="p-8 text-center text-sm text-destructive">
                Unable to load salary history.
              </div>
            ) : salaryRates.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <History className="mx-auto mb-3 h-8 w-8 opacity-40" />
                <p className="text-sm font-medium">No salary history yet</p>
                <p className="mt-1 text-xs">
                  Set a monthly salary for a staff member to create the first record.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="bg-secondary/50 text-left text-muted-foreground">
                      <tr>
                        <th className="p-3 font-medium">Staff Member</th>
                        <th className="p-3 font-medium">Monthly Salary</th>
                        <th className="p-3 font-medium">Effective From</th>
                        <th className="p-3 font-medium">Effective To</th>
                        <th className="p-3 font-medium">Rate Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedSalaryHistory.map((rate) => (
                        <tr key={rate.id} className="border-t border-border">
                          <td className="p-3 font-medium">{rate.staff_name}</td>
                          <td className="p-3 font-semibold tabular-nums">
                            {formatCurrency(rate.monthly_salary)}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {formatDate(rate.effective_from)}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {rate.effective_to ? formatDate(rate.effective_to) : "Present"}
                          </td>
                          <td className="p-3">
                            {rate.effective_to === null ? (
                              <span className="inline-flex rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
                                Current
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                                Previous
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3">
                  <Pagination
                    page={salaryHistoryPage}
                    pageSize={salaryHistoryPageSize}
                    totalItems={salaryRates.length}
                    onPageChange={setSalaryHistoryPage}
                    onPageSizeChange={(size) => {
                      setSalaryHistoryPageSize(size);
                      setSalaryHistoryPage(1);
                    }}
                    itemLabel="salary rate records"
                  />
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Configured monthly salaries are reference amounts only. They do not automatically create
            salary expenses or mark staff as paid. Record actual payments separately under Salary
            Records.
          </p>
        </>
      ) : (
        <>
          <div>
            <h3 className="font-display text-lg font-semibold">Staff Salary Records</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Review salary payments and bonuses recorded for each staff member.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <Label className="mb-2 block">Select Staff Member</Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setSalaryStaffDropdownOpen((current) => !current)}
                className="flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm transition-colors hover:bg-secondary/40"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {selectedStaff
                      ? selectedStaff.full_name || selectedStaff.email || "Unnamed Staff"
                      : "Select a staff member"}
                  </span>
                  {selectedStaff?.is_active === false && (
                    <span className="shrink-0 text-xs text-muted-foreground">(Inactive)</span>
                  )}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    salaryStaffDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {salaryStaffDropdownOpen && (
                <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                  <div className="border-b border-border p-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={salaryStaffSearch}
                        onChange={(event) => setSalaryStaffSearch(event.target.value)}
                        placeholder="Search staff name or email..."
                        className="h-9 pl-9"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto p-1">
                    {filteredSalaryStaff.length === 0 ? (
                      <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                        No matching staff found.
                      </p>
                    ) : (
                      filteredSalaryStaff.map((person) => (
                        <button
                          key={person.id}
                          type="button"
                          onClick={() => selectSalaryStaff(person)}
                          className={`flex w-full items-center justify-between rounded-sm px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary ${
                            selectedStaffId === person.id ? "bg-secondary" : ""
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {person.full_name || "Unnamed Staff"}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {person.email || "No email"}
                            </span>
                          </span>
                          <span className="ml-2 flex shrink-0 items-center gap-2">
                            {person.is_active === false && (
                              <span className="text-xs text-muted-foreground">Inactive</span>
                            )}
                            {selectedStaffId === person.id && (
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                            )}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {selectedStaff && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{selectedStaff.email || "No email address"}</span>
                <span>
                  {selectedStaff.is_active === false ? "Deactivated account" : "Active account"}
                </span>
              </div>
            )}
          </div>

          {!selectedStaff ? (
            <div className="rounded-xl border border-border bg-card p-10 text-center">
              <Users className="mx-auto mb-3 h-9 w-9 text-muted-foreground opacity-40" />
              <p className="font-medium">No staff members available</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a staff account before recording or reviewing salary payments.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="font-semibold">Monthly Compensation</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Salary and bonus totals for the selected month.
                    </p>
                  </div>
                  <div className="w-full space-y-1.5 sm:w-auto">
                    <Label htmlFor="salary-month">Select Month</Label>
                    <Input
                      id="salary-month"
                      type="month"
                      value={salaryMonth}
                      onChange={(event) => setSalaryMonth(event.target.value)}
                      className="h-10 w-full sm:w-[190px] [color-scheme:dark]"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3">
                  <div>
                    <p className="text-sm font-medium">{formatMonth(salaryMonth)} Salary Status</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {monthlyPaid
                        ? "At least one salary payment has been recorded for this month."
                        : "No salary payment has been recorded for this month."}
                    </p>
                  </div>
                  <PaymentStatus paid={monthlyPaid} />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <SalarySummaryCard
                    label="Total Salary"
                    amount={monthlySalaryTotal}
                    icon={<Wallet className="h-5 w-5" />}
                    accent="primary"
                  />
                  <SalarySummaryCard
                    label="Total Bonuses"
                    amount={monthlyBonusTotal}
                    icon={<Gift className="h-5 w-5" />}
                    accent="chart"
                  />
                  <SalarySummaryCard
                    label="Total Paid"
                    amount={monthlyCompensationTotal}
                    icon={<ReceiptText className="h-5 w-5" />}
                    accent="accent"
                  />
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  Total Paid is the combined amount of recorded salary payments and bonuses for{" "}
                  {formatMonth(salaryMonth)}. A bonus without a salary payment does not change the
                  salary status to Paid.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SalarySummaryCard
                  label="Salary in Selected History Range"
                  amount={selectedStaffSalaryTotal}
                  icon={<Wallet className="h-5 w-5" />}
                  accent="primary"
                />
                <SalarySummaryCard
                  label="Bonuses in Selected History Range"
                  amount={selectedStaffBonusTotal}
                  icon={<Gift className="h-5 w-5" />}
                  accent="chart"
                />
              </div>

              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex flex-col gap-3 border-b border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Salary & Bonus History</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Payment records for{" "}
                        <span className="font-medium text-foreground">
                          {selectedStaff.full_name || "Unnamed Staff"}
                        </span>
                      </p>
                    </div>

                    <span className="text-xs text-muted-foreground">
                      {filteredSalaryHistoryRecords.length}{" "}
                      {filteredSalaryHistoryRecords.length === 1 ? "record" : "records"}
                    </span>
                  </div>

                  {/* Search, Date Range, and Filter */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Search */}
                    <div className="relative min-w-[220px] flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="salary-history-search"
                        value={salaryHistorySearch}
                        onChange={(event) => {
                          setSalaryHistorySearch(event.target.value);
                          setSalaryRecordsPage(1);
                        }}
                        placeholder="Search description, date, or amount..."
                        className="h-10 w-full pl-9 pr-9"
                      />
                      {salaryHistorySearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setSalaryHistorySearch("");
                            setSalaryRecordsPage(1);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label="Clear search"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* From Date */}
                    <div className="w-full shrink-0 sm:w-[160px]">
                      <Label htmlFor="salary-from-date" className="sr-only">
                        From Date
                      </Label>
                      <Input
                        id="salary-from-date"
                        type="date"
                        value={salaryFromDate}
                        max={salaryToDate || undefined}
                        onChange={(event) => {
                          setSalaryFromDate(event.target.value);
                          setSalaryRecordsPage(1);
                        }}
                        aria-label="From Date"
                        title="From Date"
                        className="h-10 w-full [color-scheme:dark]"
                      />
                    </div>

                    {/* To Date */}
                    <div className="w-full shrink-0 sm:w-[160px]">
                      <Label htmlFor="salary-to-date" className="sr-only">
                        To Date
                      </Label>
                      <Input
                        id="salary-to-date"
                        type="date"
                        value={salaryToDate}
                        min={salaryFromDate || undefined}
                        onChange={(event) => {
                          setSalaryToDate(event.target.value);
                          setSalaryRecordsPage(1);
                        }}
                        aria-label="To Date"
                        title="To Date"
                        className="h-10 w-full [color-scheme:dark]"
                      />
                    </div>

                    {/* Category Filter Dialog Button */}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 shrink-0"
                      onClick={() => setSalaryHistoryFilterOpen(true)}
                    >
                      <Filter className="mr-2 h-4 w-4" />
                      Filter
                      {activeSalaryHistoryFilterCount > 0 && (
                        <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                          {activeSalaryHistoryFilterCount}
                        </span>
                      )}
                    </Button>
                  </div>
                </div>

                {salaryLoading ? (
                  <div className="flex min-h-[220px] items-center justify-center gap-3 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    Loading salary records...
                  </div>
                ) : salaryError ? (
                  <div className="p-10 text-center text-sm text-destructive">
                    Unable to load salary records. Please try again.
                  </div>
                ) : filteredSalaryHistoryRecords.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground">
                    <ReceiptText className="mx-auto mb-3 h-9 w-9 opacity-40" />
                    <p className="font-medium">
                      {hasSalaryHistoryFilters
                        ? "No matching salary or bonus records found"
                        : "No salary or bonus records found"}
                    </p>
                    <p className="mt-1 text-xs">
                      {hasSalaryHistoryFilters
                        ? "Try changing or clearing your search and filters."
                        : "Salary and bonus entries recorded for this staff member will appear here."}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-secondary/50 text-left text-muted-foreground">
                          <tr>
                            <th className="p-3 font-medium">Date</th>
                            <th className="p-3 font-medium">Type</th>
                            <th className="p-3 font-medium">Description</th>
                            <th className="p-3 text-right font-medium">Amount</th>
                            <th className="p-3 text-right font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedSalaryRecords.map((record) => (
                            <tr
                              key={record.id}
                              className="border-t border-border hover:bg-secondary/30"
                            >
                              <td className="whitespace-nowrap p-3 text-muted-foreground">
                                {formatDate(record.expense_date)}
                              </td>
                              <td className="p-3">
                                <SalaryCategoryBadge category={record.category} />
                              </td>
                              <td className="max-w-[300px] p-3">
                                <p className="truncate font-medium">
                                  {record.description ||
                                    (record.category === "bonus"
                                      ? "Bonus payment"
                                      : "Salary payment")}
                                </p>
                              </td>
                              <td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums">
                                {formatCurrency(record.amount)}
                              </td>
                              <td className="p-3">
                                <div className="flex justify-end">
                                  <ActionButton
                                    title="View Payment Details"
                                    onClick={() => setSelectedSalary(record)}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </ActionButton>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-3">
                      <Pagination
                        page={salaryRecordsPage}
                        pageSize={salaryRecordsPageSize}
                        totalItems={filteredSalaryHistoryRecords.length}
                        onPageChange={setSalaryRecordsPage}
                        onPageSizeChange={(size) => {
                          setSalaryRecordsPageSize(size);
                          setSalaryRecordsPage(1);
                        }}
                        itemLabel="payment records"
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Staff account dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!saving) {
            setDialogOpen(open);
            if (!open) {
              setForm(emptyForm);
              setEditingStaff(null);
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingStaff ? "Edit Staff Details" : "Add Staff Account"}</DialogTitle>
            <DialogDescription>
              {editingStaff
                ? "Update this staff member's personal information."
                : "Create a staff login account for SONARA."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff-full-name">Full Name</Label>
              <Input
                id="staff-full-name"
                value={form.fullName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, fullName: event.target.value }))
                }
                placeholder="Enter full name"
                required
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-email">Email Address</Label>
              <Input
                id="staff-email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="staff@example.com"
                required
                disabled={!!editingStaff}
                maxLength={254}
              />
              {editingStaff && (
                <p className="text-xs text-muted-foreground">
                  Email changes are not available here.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-phone">Phone Number</Label>
              <Input
                id="staff-phone"
                type="tel"
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value }))
                }
                placeholder="Enter phone number"
                maxLength={30}
              />
            </div>

            {!editingStaff && (
              <div className="space-y-2">
                <Label htmlFor="staff-password">Temporary Password</Label>
                <Input
                  id="staff-password"
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="At least 8 characters"
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Share the temporary password securely with the staff member.
                </p>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingStaff ? "Save Changes" : "Create Staff"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Salary rate dialog */}
      <Dialog
        open={salaryRateDialogOpen}
        onOpenChange={(open) => {
          if (!savingSalaryRate) {
            setSalaryRateDialogOpen(open);
            if (!open) {
              setSalaryRateStaff(null);
              setSalaryRateForm(emptySalaryRateForm);
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>
              {salaryRateStaff && getCurrentRate(salaryRateStaff.id)
                ? "Update Monthly Salary"
                : "Set Monthly Salary"}
            </DialogTitle>
            <DialogDescription>
              Configure the basic monthly salary for{" "}
              <span className="font-semibold text-foreground">
                {salaryRateStaff?.full_name || "this staff member"}
              </span>
              . Previous salary rates will remain in the history.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalaryRateSubmit} className="space-y-4">
            {salaryRateStaff && getCurrentRate(salaryRateStaff.id) && (
              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                <p className="text-xs text-muted-foreground">Current Monthly Salary</p>
                <p className="mt-1 font-display text-xl font-bold tabular-nums">
                  {formatCurrency(getCurrentRate(salaryRateStaff.id)!.monthly_salary)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Effective since {formatDate(getCurrentRate(salaryRateStaff.id)!.effective_from)}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="monthly-salary">Basic Monthly Salary (₱)</Label>
              <Input
                id="monthly-salary"
                type="number"
                min="0.01"
                step="0.01"
                value={salaryRateForm.monthlySalary}
                onChange={(event) =>
                  setSalaryRateForm((current) => ({
                    ...current,
                    monthlySalary: event.target.value,
                  }))
                }
                placeholder="e.g. 15000"
                required
              />
              <p className="text-xs text-muted-foreground">
                Enter the agreed basic monthly salary, excluding bonuses.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="salary-effective-from">Effective From</Label>
              <Input
                id="salary-effective-from"
                type="date"
                value={salaryRateForm.effectiveFrom}
                max={getTodayDate()}
                min={
                  salaryRateStaff && getCurrentRate(salaryRateStaff.id)
                    ? getCurrentRate(salaryRateStaff.id)!.effective_from
                    : undefined
                }
                onChange={(event) =>
                  setSalaryRateForm((current) => ({
                    ...current,
                    effectiveFrom: event.target.value,
                  }))
                }
                required
              />
              <p className="text-xs text-muted-foreground">
                The previous rate will end one day before this date.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSalaryRateDialogOpen(false)}
                disabled={savingSalaryRate}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingSalaryRate}>
                {savingSalaryRate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Salary
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete staff confirmation dialog */}
      <Dialog
        open={!!deletingStaff}
        onOpenChange={(open) => {
          if (!deleting && !open) setDeletingStaff(null);
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete Staff Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-foreground">
                {deletingStaff?.full_name || "this staff member"}
              </span>
              's account? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingStaff(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteStaff()}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Salary history category filter dialog */}
      <Dialog open={salaryHistoryFilterOpen} onOpenChange={setSalaryHistoryFilterOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Salary & Bonus Filters</DialogTitle>
            <DialogDescription>
              Filter this staff member's payment history by category.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="salary-history-category">Category</Label>
              <Select
                value={salaryHistoryCategory}
                onValueChange={(value) => {
                  setSalaryHistoryCategory(value as "all" | "salary" | "bonus");
                  setSalaryRecordsPage(1);
                }}
              >
                <SelectTrigger id="salary-history-category" className="h-10 w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-60">
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="salary">Salary</SelectItem>
                  <SelectItem value="bonus">Bonus</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={clearSalaryHistoryFilters}
              disabled={activeSalaryHistoryFilterCount === 0}
            >
              Clear All
            </Button>
            <Button type="button" onClick={() => setSalaryHistoryFilterOpen(false)}>
              Apply Filters
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Salary payment details dialog */}
      <Dialog
        open={!!selectedSalary}
        onOpenChange={(open) => {
          if (!open) setSelectedSalary(null);
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {selectedSalary?.category === "bonus"
                ? "Bonus Record Details"
                : "Salary Record Details"}
            </DialogTitle>
            <DialogDescription>
              Detailed information about this {selectedSalary?.category ?? "salary"} payment.
            </DialogDescription>
          </DialogHeader>

          {selectedSalary && (
            <div className="space-y-4">
              <div className="rounded-lg bg-secondary/50 p-4">
                <div className="mb-2">
                  <SalaryCategoryBadge category={selectedSalary.category} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedSalary.category === "bonus" ? "Bonus Amount" : "Salary Amount"}
                </p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                  {formatCurrency(selectedSalary.amount)}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
                  <span className="text-sm text-muted-foreground">Staff Member</span>
                  <span className="text-right text-sm font-medium">
                    {selectedStaff?.full_name || "Unnamed Staff"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
                  <span className="text-sm text-muted-foreground">Payment Date</span>
                  <span className="text-right text-sm font-medium">
                    {formatDate(selectedSalary.expense_date)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
                  <span className="text-sm text-muted-foreground">Category</span>
                  <span className="text-sm font-medium">
                    {selectedSalary.category === "bonus" ? "Bonus" : "Salary"}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Description / Notes</span>
                  <p className="whitespace-pre-wrap break-words rounded-lg bg-secondary/40 p-3 text-sm">
                    {selectedSalary.description || "No description provided."}
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" onClick={() => setSelectedSalary(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Staff;
