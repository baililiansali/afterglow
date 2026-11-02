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
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [showProfile, setShowProfile] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

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

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const query = search.toLowerCase().trim();

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

  const getCustomerReservations = (customerId: string) =>
    reservations
      .filter((reservation) => reservation.user_id === customerId)
      .sort((a, b) => {
        const dateA = `${a.booking_date} ${a.start_time}`;
        const dateB = `${b.booking_date} ${b.start_time}`;
        return dateB.localeCompare(dateA);
      });

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

  const openProfile = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowProfile(true);
  };

  const openEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setEditName(customer.full_name || "");
    setEditPhone(customer.phone || "");
    setShowEdit(true);
  };

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
    <div className="space-y-6 text-foreground">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Management
          </p>
          <h1 className="font-display text-2xl font-bold tracking-wide sm:text-3xl">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage customer accounts and reservation activity.
          </p>
        </div>

        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
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

      {/* Customer Table */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="font-display text-lg font-semibold">Customer List</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {filteredCustomers.length} customer
                {filteredCustomers.length !== 1 ? "s" : ""} found
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, or ID..."
                  className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary sm:w-64"
                />
              </div>

              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="all">All Accounts</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Date Filters */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Registered From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Registered To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>

            <button
              onClick={() => {
                setSearch("");
                setDateFrom("");
                setDateTo("");
                setAccountFilter("all");
              }}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              Clear Filters
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-4 font-semibold">Customer</th>
                <th className="px-5 py-4 font-semibold">Contact Number</th>
                <th className="px-5 py-4 font-semibold">Registered</th>
                <th className="px-5 py-4 text-center font-semibold">Reservations</th>
                <th className="px-5 py-4 font-semibold">Account Status</th>
                <th className="px-5 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-muted-foreground">
                    <UserRound className="mx-auto mb-3 h-9 w-9 opacity-40" />
                    <p className="font-medium">No customers found</p>
                    <p className="mt-1 text-xs">Try changing your search or filters.</p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => {
                  const stats = getCustomerStats(customer.id);
                  const active = customer.is_active !== false;

                  return (
                    <tr
                      key={customer.id}
                      className="border-t border-border transition-colors hover:bg-secondary/30"
                    >
                      <td className="px-5 py-4">
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
                            <p className="truncate font-medium text-foreground">
                              {customer.full_name || "Unnamed Customer"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {customer.email || "No email"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-muted-foreground">{customer.phone || "—"}</td>

                      <td className="px-5 py-4 text-muted-foreground">
                        {formatDate(customer.created_at)}
                      </td>

                      <td className="px-5 py-4 text-center font-semibold tabular-nums">
                        {stats.total}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${accountStatusStyles(active)}`}
                        >
                          {active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <ActionButton
                            title="View Profile"
                            onClick={() => openProfile(customer)}
                          >
                            <Eye className="h-4 w-4" />
                          </ActionButton>

                          <ActionButton
                            title={active ? "Deactivate Account" : "Activate Account"}
                            onClick={() => toggleCustomerStatus(customer)}
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
      </section>

      {/* Customer Profile Dialog */}
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
              {/* Customer Identity */}
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

                <button
                  onClick={() => openEdit(selectedCustomer)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
                >
                  <Pencil className="h-4 w-4" />
                  Edit Profile
                </button>
              </div>

              {/* Personal Information */}
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

              {/* Reservation Overview */}
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

              {/* Reservation History */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <SectionHeading>Reservation History</SectionHeading>
                  <span className="text-xs text-muted-foreground">
                    {getCustomerReservations(selectedCustomer.id).length} records
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Reference</th>
                        <th className="px-4 py-3 font-semibold">Room</th>
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Time</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {getCustomerReservations(selectedCustomer.id).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                            No reservation history found.
                          </td>
                        </tr>
                      ) : (
                        getCustomerReservations(selectedCustomer.id).map((reservation) => (
                          <tr
                            key={reservation.id}
                            className="border-t border-border hover:bg-secondary/30"
                          >
                            <td className="px-4 py-3 font-medium">
                              {reservation.reference_code || reservation.id.slice(0, 8)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {reservation.rooms?.name || "—"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDate(reservation.booking_date)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatTime(reservation.start_time)} –{" "}
                              {formatTime(reservation.end_time)}
                            </td>
                            <td className="px-4 py-3">
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
              <button
                onClick={() => toggleCustomerStatus(selectedCustomer)}
                disabled={updatingStatus}
                className={`rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                  selectedCustomer.is_active !== false
                    ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                    : "border-primary/30 text-primary hover:bg-primary/10"
                }`}
              >
                {selectedCustomer.is_active !== false ? "Deactivate Account" : "Activate Account"}
              </button>

              <button
                onClick={() => setShowProfile(false)}
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Dialog */}
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
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Full Name
                </label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Email Address
                </label>
                <input
                  type="email"
                  value={selectedCustomer.email || ""}
                  disabled
                  className="w-full cursor-not-allowed rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Email changes are not available in this form.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Contact Number
                </label>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="Enter contact number"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border p-5">
              <button
                onClick={() => setShowEdit(false)}
                disabled={saving}
                className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
              >
                Cancel
              </button>

              <button
                onClick={saveCustomer}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving && <RefreshCw className="h-4 w-4 animate-spin" />}
                {saving ? "Saving..." : "Save Changes"}
              </button>
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
      className={`rounded-lg p-2 transition-colors disabled:opacity-50 ${
        destructive
          ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
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
