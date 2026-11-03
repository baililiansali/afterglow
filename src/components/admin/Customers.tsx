import { useEffect, useMemo, useState } from "react";

import {
  Search,
  Users,
  UserRound,
  CalendarDays,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
  Pencil,
  Power,
  X,
  Mail,
  Phone,
  User,
  Filter,
  LayoutGrid,
  List,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Pagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Customer = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  is_active: boolean;
};

type Reservation = {
  id: string;
  reference_code: string | null;
  user_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  guest_count: number | null;
  room_total: number | null;
  payment_status: string | null;
  payment_method: string | null;
  created_at: string;
  rooms?: { name: string } | null;
};

type ViewMode = "list" | "grid";

const formatDate = (date?: string | null) => {
  if (!date) return "—";

  return new Date(date).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatTime = (time?: string | null) => {
  if (!time) return "—";

  const [hours, minutes] = time.split(":");
  const date = new Date();

  date.setHours(Number(hours), Number(minutes), 0, 0);

  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const getInitials = (name?: string | null) => {
  if (!name) return "??";

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
};

const statusStyles = (status: string) => {
  switch (status?.toLowerCase()) {
    case "completed":
      return "bg-primary/15 text-primary";
    case "approved":
      return "bg-accent/15 text-accent";
    case "pending":
      return "bg-chart-4/15 text-chart-4";
    case "cancelled":
    case "rejected":
      return "bg-destructive/10 text-destructive";
    case "checked_in":
      return "bg-glow/15 text-glow";
    default:
      return "bg-secondary text-muted-foreground";
  }
};

const accountStatusStyles = (active: boolean) =>
  active ? "bg-primary/15 text-primary" : "bg-destructive/10 text-destructive";

export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search and filters
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);

  // View and pagination
  const [view, setView] = useState<ViewMode>("list");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Customer dialogs
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [showProfile, setShowProfile] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Load customers and reservations
  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [profilesResult, reservationsResult] = await Promise.all([
        (supabase as any).from("profiles").select("*").order("created_at", { ascending: false }),

        (supabase as any)
          .from("reservations")
          .select("*, rooms(name)")
          .order("booking_date", { ascending: false }),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (reservationsResult.error) throw reservationsResult.error;

      setCustomers((profilesResult.data || []) as Customer[]);
      setReservations((reservationsResult.data || []) as Reservation[]);
    } catch (error: any) {
      console.error("Error loading customers:", error);
      alert(error.message || "Unable to load customers.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter customers
  const filteredCustomers = useMemo(() => {
    const query = search.toLowerCase().trim();

    return customers.filter((customer) => {
      const matchesSearch =
        !query ||
        customer.full_name?.toLowerCase().includes(query) ||
        customer.email?.toLowerCase().includes(query) ||
        customer.id.toLowerCase().includes(query);

      const registrationDate = customer.created_at?.slice(0, 10);

      const matchesFrom = !dateFrom || registrationDate >= dateFrom;
      const matchesTo = !dateTo || registrationDate <= dateTo;

      const matchesStatus =
        accountFilter === "all" ||
        (accountFilter === "active" && customer.is_active !== false) ||
        (accountFilter === "inactive" && customer.is_active === false);

      return matchesSearch && matchesFrom && matchesTo && matchesStatus;
    });
  }, [customers, search, dateFrom, dateTo, accountFilter]);

  // Reset pagination when search or filters change
  useEffect(() => {
    setPage(1);
  }, [search, dateFrom, dateTo, accountFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  // Active filter count
  const activeFilterCount = [accountFilter !== "all", !!dateFrom, !!dateTo].filter(Boolean).length;

  // Clear filters
  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setAccountFilter("all");
  };

  // Get customer reservations
  const getCustomerReservations = (customerId: string) =>
    reservations
      .filter((reservation) => reservation.user_id === customerId)
      .sort((a, b) => {
        const dateA = `${a.booking_date} ${a.start_time}`;
        const dateB = `${b.booking_date} ${b.start_time}`;

        return dateB.localeCompare(dateA);
      });

  // Get customer reservation statistics
  const getCustomerStats = (customerId: string) => {
    const records = getCustomerReservations(customerId);
    const today = new Date().toISOString().slice(0, 10);

    return {
      total: records.length,
      completed: records.filter((r) => r.status === "completed").length,
      cancelled: records.filter((r) => r.status === "cancelled" || r.status === "rejected").length,
      upcoming: records.filter(
        (r) => (r.status === "pending" || r.status === "approved") && r.booking_date >= today,
      ).length,
    };
  };

  // Open customer profile
  const openProfile = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowProfile(true);
  };

  // Open edit customer dialog
  const openEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setEditName(customer.full_name || "");
    setEditPhone(customer.phone || "");
    setShowEdit(true);
  };

  // Save customer changes
  const saveCustomer = async () => {
    if (!selectedCustomer) return;

    if (!editName.trim()) {
      alert("Please enter the customer's full name.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.functions.invoke("manage-customer", {
        body: {
          action: "update_profile",
          userId: selectedCustomer.id,
          fullName: editName.trim(),
          phone: editPhone.trim(),
        },
      });

      if (error) throw error;

      setShowEdit(false);
      setSelectedCustomer(null);

      await loadData(true);
    } catch (error: any) {
      console.error("Error updating customer:", error);
      alert(error.message || "Unable to update customer information.");
    } finally {
      setSaving(false);
    }
  };

  // Activate or deactivate customer account
  const toggleCustomerStatus = async (customer: Customer) => {
    const currentlyActive = customer.is_active !== false;
    const nextStatus = !currentlyActive;

    const confirmed = window.confirm(
      nextStatus
        ? `Activate ${customer.full_name || "this customer's"} account?`
        : `Deactivate ${customer.full_name || "this customer's"} account?`,
    );

    if (!confirmed) return;

    setUpdatingStatus(true);

    try {
      const { error } = await supabase.functions.invoke("manage-customer", {
        body: {
          action: "set_active",
          userId: customer.id,
          isActive: nextStatus,
        },
      });

      if (error) throw error;

      await loadData(true);

      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer({
          ...selectedCustomer,
          is_active: nextStatus,
        });
      }
    } catch (error: any) {
      console.error("Error changing customer status:", error);
      alert(error.message || "Unable to update account status.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const totalActive = customers.filter((customer) => customer.is_active !== false).length;

  const totalInactive = customers.filter((customer) => customer.is_active === false).length;

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm">Loading customers...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4 text-foreground">
      {/* Page heading */}
      <div>
        <h2 className="font-display text-xl font-bold">Customers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage customer accounts and reservation activity.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total Customers"
          value={customers.length}
          icon={<Users className="h-5 w-5" />}
          accent="primary"
        />

        <SummaryCard
          label="Active Accounts"
          value={totalActive}
          icon={<CheckCircle2 className="h-5 w-5" />}
          accent="accent"
        />

        <SummaryCard
          label="Inactive Accounts"
          value={totalInactive}
          icon={<XCircle className="h-5 w-5" />}
          accent="destructive"
        />

        <SummaryCard
          label="Total Reservations"
          value={reservations.length}
          icon={<CalendarDays className="h-5 w-5" />}
          accent="chart"
        />
      </div>

      {/* Customer list heading */}
      <div>
        <h3 className="font-display text-lg font-semibold">Customer List</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {filteredCustomers.length} customer
          {filteredCustomers.length !== 1 ? "s" : ""} found
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              id="customer-search"
              className="pl-9"
              placeholder="Search name, email, or customer ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filter button */}
          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <Filter className="mr-2 h-4 w-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {/* Refresh */}
          <Button
            variant="outline"
            size="icon"
            title="Refresh customers"
            onClick={() => void loadData(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Grid / List toggle */}
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
      </div>

      {/* Table view */}
      {view === "list" && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-secondary/50 text-left text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Customer</th>
                <th className="p-3 font-medium">Contact</th>
                <th className="p-3 font-medium">Registered</th>
                <th className="p-3 text-center font-medium">Reservations</th>
                <th className="p-3 font-medium">Account Status</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground">
                    <UserRound className="mx-auto mb-3 h-9 w-9 opacity-40" />
                    <p className="font-medium">No customers found.</p>
                    <p className="mt-1 text-xs">Try changing your search or filters.</p>
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((customer) => {
                  const stats = getCustomerStats(customer.id);
                  const active = customer.is_active !== false;

                  return (
                    <tr key={customer.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {customer.avatar_url ? (
                            <img
                              src={customer.avatar_url}
                              alt={customer.full_name || "Customer"}
                              className="h-10 w-10 rounded-full border border-border object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                              {getInitials(customer.full_name)}
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {customer.full_name || "Unnamed Customer"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {customer.email || "No email"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="p-3 text-muted-foreground">{customer.phone || "—"}</td>

                      <td className="p-3 text-muted-foreground">
                        {formatDate(customer.created_at)}
                      </td>

                      <td className="p-3 text-center font-medium tabular-nums">{stats.total}</td>

                      <td className="p-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${accountStatusStyles(active)}`}
                        >
                          {active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <ActionButton title="View Profile" onClick={() => openProfile(customer)}>
                            <Eye className="h-4 w-4" />
                          </ActionButton>

                          <ActionButton
                            title={active ? "Deactivate Account" : "Activate Account"}
                            onClick={() => void toggleCustomerStatus(customer)}
                            disabled={updatingStatus}
                            destructive={active}
                          >
                            <Power className="h-4 w-4" />
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Grid view */}
      {view === "grid" && (
        <>
          {filteredCustomers.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              <UserRound className="mx-auto mb-3 h-9 w-9 opacity-40" />
              <p className="font-medium">No customers found.</p>
              <p className="mt-1 text-xs">Try changing your search or filters.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {paginatedCustomers.map((customer) => {
                const stats = getCustomerStats(customer.id);
                const active = customer.is_active !== false;

                return (
                  <div
                    key={customer.id}
                    className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/30"
                  >
                    {/* Customer identity and status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {customer.avatar_url ? (
                          <img
                            src={customer.avatar_url}
                            alt={customer.full_name || "Customer"}
                            className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                            {getInitials(customer.full_name)}
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {customer.full_name || "Unnamed Customer"}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {customer.email || "No email"}
                          </p>
                        </div>
                      </div>

                      {/* Active / Inactive badge at top-right */}
                      <span
                        className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${accountStatusStyles(active)}`}
                      >
                        {active ? "Active" : "Inactive"}
                      </span>
                    </div>

                    {/* Customer information */}
                    <div className="my-4 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Contact</p>
                        <p className="mt-1 truncate font-medium">{customer.phone || "—"}</p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">Registered</p>
                        <p className="mt-1 font-medium">{formatDate(customer.created_at)}</p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">Reservations</p>
                        <p className="mt-1 font-semibold">{stats.total}</p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">Customer ID</p>
                        <p className="mt-1 truncate text-xs font-medium">{customer.id}</p>
                      </div>
                    </div>

                    {/* Grid actions */}
                    <div className="flex justify-end gap-2 border-t border-border pt-3">
                      <Button variant="outline" size="sm" onClick={() => openProfile(customer)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Profile
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className={
                          active
                            ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                            : "border-primary/30 text-primary hover:bg-primary/10"
                        }
                        onClick={() => void toggleCustomerStatus(customer)}
                        disabled={updatingStatus}
                      >
                        <Power className="mr-2 h-4 w-4" />
                        {active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      <Pagination
        page={currentPage}
        pageSize={pageSize}
        totalItems={filteredCustomers.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {/* Filter dialog */}
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Customer filters</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Account status */}
            <div>
              <Label htmlFor="customer-account-status">Account Status</Label>

              <select
                id="customer-account-status"
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
              >
                <option value="all">All accounts</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Registration date range */}
            <div>
              <Label htmlFor="customer-date-from">Registered From</Label>
              <Input
                id="customer-date-from"
                type="date"
                className="mt-1 [color-scheme:dark]"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="customer-date-to">Registered To</Label>
              <Input
                id="customer-date-to"
                type="date"
                className="mt-1 [color-scheme:dark]"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
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

      {/* Customer profile dialog */}
      {showProfile && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
          <div className="my-8 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 p-5 backdrop-blur">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  Customer Management
                </p>
                <h2 className="mt-1 font-display text-xl font-bold">Customer Profile</h2>
              </div>

              <button
                onClick={() => setShowProfile(false)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 p-5">
              {/* Customer identity */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {selectedCustomer.avatar_url ? (
                  <img
                    src={selectedCustomer.avatar_url}
                    alt={selectedCustomer.full_name || "Customer"}
                    className="h-16 w-16 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-xl font-bold text-primary">
                    {getInitials(selectedCustomer.full_name)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-xl font-bold">
                    {selectedCustomer.full_name || "Unnamed Customer"}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedCustomer.email || "No email address"}
                  </p>

                  <span
                    className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${accountStatusStyles(selectedCustomer.is_active !== false)}`}
                  >
                    {selectedCustomer.is_active !== false ? "Active Account" : "Inactive Account"}
                  </span>
                </div>

                <Button variant="outline" onClick={() => openEdit(selectedCustomer)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Profile
                </Button>
              </div>

              {/* Personal information */}
              <section className="space-y-3">
                <SectionHeading>Personal Information</SectionHeading>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <InfoCard
                    icon={<User className="h-4 w-4" />}
                    label="Customer ID"
                    value={selectedCustomer.id}
                  />

                  <InfoCard
                    icon={<Mail className="h-4 w-4" />}
                    label="Email Address"
                    value={selectedCustomer.email || "Not provided"}
                  />

                  <InfoCard
                    icon={<Phone className="h-4 w-4" />}
                    label="Contact Number"
                    value={selectedCustomer.phone || "Not provided"}
                  />

                  <InfoCard
                    icon={<CalendarDays className="h-4 w-4" />}
                    label="Registration Date"
                    value={formatDate(selectedCustomer.created_at)}
                  />
                </div>
              </section>

              {/* Reservation overview */}
              <section className="space-y-3">
                <SectionHeading>Reservation Overview</SectionHeading>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(() => {
                    const stats = getCustomerStats(selectedCustomer.id);

                    return (
                      <>
                        <StatCard label="Total" value={stats.total} />
                        <StatCard label="Completed" value={stats.completed} color="text-primary" />
                        <StatCard
                          label="Cancelled"
                          value={stats.cancelled}
                          color="text-destructive"
                        />
                        <StatCard label="Upcoming" value={stats.upcoming} color="text-accent" />
                      </>
                    );
                  })()}
                </div>
              </section>

              {/* Reservation history */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <SectionHeading>Reservation History</SectionHeading>

                  <span className="text-xs text-muted-foreground">
                    {getCustomerReservations(selectedCustomer.id).length} records
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="bg-secondary/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="p-3 font-medium">Reference</th>
                        <th className="p-3 font-medium">Room</th>
                        <th className="p-3 font-medium">Date</th>
                        <th className="p-3 font-medium">Time</th>
                        <th className="p-3 font-medium">Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {getCustomerReservations(selectedCustomer.id).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-10 text-center text-muted-foreground">
                            No reservation history found.
                          </td>
                        </tr>
                      ) : (
                        getCustomerReservations(selectedCustomer.id).map((reservation) => (
                          <tr
                            key={reservation.id}
                            className="border-t border-border hover:bg-secondary/30"
                          >
                            <td className="p-3 font-medium">
                              {reservation.reference_code || reservation.id.slice(0, 8)}
                            </td>

                            <td className="p-3 text-muted-foreground">
                              {reservation.rooms?.name || "—"}
                            </td>

                            <td className="p-3 text-muted-foreground">
                              {formatDate(reservation.booking_date)}
                            </td>

                            <td className="p-3 text-muted-foreground">
                              {formatTime(reservation.start_time)} –{" "}
                              {formatTime(reservation.end_time)}
                            </td>

                            <td className="p-3">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles(reservation.status)}`}
                              >
                                {reservation.status.replace("_", " ")}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <div className="flex flex-col-reverse justify-between gap-3 border-t border-border p-5 sm:flex-row">
              <Button
                variant="outline"
                className={
                  selectedCustomer.is_active !== false
                    ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                    : "border-primary/30 text-primary hover:bg-primary/10"
                }
                onClick={() => void toggleCustomerStatus(selectedCustomer)}
                disabled={updatingStatus}
              >
                <Power className="mr-2 h-4 w-4" />
                {selectedCustomer.is_active !== false ? "Deactivate Account" : "Activate Account"}
              </Button>

              <Button onClick={() => setShowProfile(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit customer dialog */}
      {showEdit && selectedCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  Customer Management
                </p>
                <h2 className="mt-1 font-display text-xl font-bold">Edit Customer</h2>
              </div>

              <button
                onClick={() => setShowEdit(false)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="space-y-2">
                <Label htmlFor="customer-edit-name">Full Name</Label>
                <Input
                  id="customer-edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer-edit-email">Email Address</Label>
                <Input
                  id="customer-edit-email"
                  type="email"
                  value={selectedCustomer.email || ""}
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  Email changes are not available in this form.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer-edit-phone">Contact Number</Label>
                <Input
                  id="customer-edit-phone"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="Enter contact number"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border p-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEdit(false)}
                disabled={saving}
              >
                Cancel
              </Button>

              <Button onClick={() => void saveCustomer()} disabled={saving}>
                {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Reusable Components */

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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-accent">
      {children}
    </h3>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>

      <p className="break-all text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  color = "text-foreground",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-2 font-display text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export default Customers;
