import { useMemo } from "react";
import {
  CalendarCheck,
  Clock,
  DoorOpen,
  UtensilsCrossed,
  ArrowRight,
  CreditCard,
  Users,
} from "lucide-react";

import type { ResRow, OrderRow } from "@/components/admin/shared";
import { peso } from "@/lib/afterglow";

type StaffDashboardProps = {
  reservations: ResRow[];
  orders: OrderRow[];
  onNavigate: (section: string) => void;
};

function getManilaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatTime(value?: string | null) {
  if (!value) return "—";

  const [hours, minutes] = value.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StaffDashboard({ reservations, orders, onNavigate }: StaffDashboardProps) {
  const today = getManilaDate();

  const todaysReservations = useMemo(
    () => reservations.filter((reservation) => reservation.booking_date === today),
    [reservations, today],
  );

  const pendingReservations = reservations.filter(
    (reservation) => reservation.status === "pending",
  );

  const activeSessions = reservations.filter((reservation) => reservation.status === "checked_in");

  const activeOrders = orders.filter((order) =>
    ["pending", "confirmed", "preparing", "ready"].includes(order.status),
  );

  const unpaidTransactions = [
    ...reservations.filter((reservation) => reservation.payment_status !== "paid"),
    ...orders.filter((order) => order.payment_status !== "paid"),
  ];

  const stats = [
    {
      label: "Today's Reservations",
      value: todaysReservations.length,
      icon: CalendarCheck,
      description: "Bookings scheduled today",
      section: "reservations",
    },
    {
      label: "Pending Reservations",
      value: pendingReservations.length,
      icon: Clock,
      description: "Waiting for confirmation",
      section: "reservations",
    },
    {
      label: "Active Sessions",
      value: activeSessions.length,
      icon: DoorOpen,
      description: "Currently checked in",
      section: "sessions",
    },
    {
      label: "Active Food Orders",
      value: activeOrders.length,
      icon: UtensilsCrossed,
      description: "Orders being processed",
      section: "orders",
    },
  ];

  const quickActions = [
    {
      label: "Manage Reservations",
      description: "Review and process bookings",
      icon: CalendarCheck,
      section: "reservations",
    },
    {
      label: "Room Schedule",
      description: "Check room availability",
      icon: CalendarCheck,
      section: "schedule",
    },
    {
      label: "Room Sessions",
      description: "Manage check-in and check-out",
      icon: DoorOpen,
      section: "sessions",
    },
    {
      label: "Food Orders",
      description: "Track and update food orders",
      icon: UtensilsCrossed,
      section: "orders",
    },
    {
      label: "Transactions",
      description: "Review and record payments",
      icon: CreditCard,
      section: "payments",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Staff Dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of today's karaoke lounge operations.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => onNavigate(stat.section)}
              className="rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>

              <p className="mt-3 text-3xl font-semibold">{stat.value}</p>

              <p className="mt-1 text-xs text-muted-foreground">{stat.description}</p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <h3 className="font-semibold">Today's Reservations</h3>
              <p className="text-sm text-muted-foreground">
                {todaysReservations.length} bookings scheduled
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate("reservations")}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              View all
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {todaysReservations.length === 0 ? (
            <div className="p-8 text-center">
              <CalendarCheck className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No reservations today</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Today's bookings will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {todaysReservations.slice(0, 6).map((reservation) => (
                <div
                  key={reservation.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{reservation.reference_code}</p>
                    <p className="text-sm text-muted-foreground">
                      {reservation.rooms?.name || "Room"} · {reservation.guest_count} guests
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatTime(reservation.start_time)} – {formatTime(reservation.end_time)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        reservation.status === "approved"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : reservation.status === "checked_in"
                            ? "bg-blue-500/10 text-blue-600"
                            : reservation.status === "pending"
                              ? "bg-amber-500/10 text-amber-600"
                              : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {reservation.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <div className="border-b p-4">
            <h3 className="font-semibold">Quick Actions</h3>
            <p className="text-sm text-muted-foreground">Common staff tasks</p>
          </div>

          <div className="divide-y">
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  key={action.section}
                  type="button"
                  onClick={() => onNavigate(action.section)}
                  className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{action.label}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>

                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onNavigate("payments")}
          className="flex items-center justify-between rounded-xl border bg-card p-4 text-left hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <CreditCard className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="font-medium">Unpaid Transactions</p>
              <p className="text-sm text-muted-foreground">Payments requiring verification</p>
            </div>
          </div>

          <span className="text-xl font-semibold">{unpaidTransactions.length}</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("rooms")}
          className="flex items-center justify-between rounded-xl border bg-card p-4 text-left hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Room Management</p>
              <p className="text-sm text-muted-foreground">
                View room details and operational status
              </p>
            </div>
          </div>

          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Today's Room Revenue</h3>
            <p className="text-sm text-muted-foreground">From paid reservations scheduled today</p>
          </div>
          <CreditCard className="h-5 w-5 text-muted-foreground" />
        </div>

        <p className="mt-3 text-2xl font-semibold">
          {peso(
            todaysReservations
              .filter((reservation) => reservation.payment_status === "paid")
              .reduce((total, reservation) => total + Number(reservation.room_total || 0), 0),
          )}
        </p>
      </div>
    </div>
  );
}
