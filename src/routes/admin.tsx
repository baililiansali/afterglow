import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dashboard } from "@/components/admin/Dashboard";
import { useAuth } from "@/lib/auth";
import { Bookings } from "@/components/admin/Bookings";
import { RoomSessions } from "@/components/admin/RoomSessions";
import { Schedule } from "@/components/admin/Schedule";
import { Orders } from "@/components/admin/Orders";
import { Payments } from "@/components/admin/Payments";
import { RoomsAdmin } from "@/components/admin/RoomsAdmin";
import { MenuAdmin } from "@/components/admin/MenuAdmin";
import { Customers } from "@/components/admin/Customers";
import { Messages } from "@/components/admin/Messages";
import { Reports } from "@/components/admin/Reports";
import { SettingsAdmin } from "@/components/admin/SettingsAdmin";

import {
  AdminShell,
  useAdminRes,
  useAdminOrders,
  SECTION_TITLES,
  type SectionKey,
} from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Afterglow" },
      {
        name: "description",
        content: "Manage Afterglow reservations, food orders, rooms and menu.",
      },
      {
        property: "og:title",
        content: "Admin — Afterglow",
      },
      {
        property: "og:description",
        content: "Afterglow admin dashboard.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),

  validateSearch: (s: Record<string, unknown>): { section?: SectionKey } =>
    typeof s["section"] === "string" && s["section"] in SECTION_TITLES
      ? { section: s["section"] as SectionKey }
      : {},

  component: AdminGate,
});

function AdminGate() {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return <p className="mx-auto max-w-6xl px-4 py-20 text-muted-foreground">Loading…</p>;
  }

  if (!user || !isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold">Admins only</h1>

        <p className="mt-2 text-muted-foreground">Sign in with an admin account to continue.</p>

        <Button asChild variant="glow" className="mt-6">
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return <Admin />;
}

function Admin() {
  const res = useAdminRes();
  const orders = useAdminOrders();

  const search = Route.useSearch();
  const navigate = useNavigate();

  const section: SectionKey = search.section ?? "dashboard";

  // Food order payment target.
  const [paymentTargetOrderId, setPaymentTargetOrderId] = useState<string | null>(null);

  // Room reservation payment target.
  const [paymentTargetReservationId, setPaymentTargetReservationId] = useState<string | null>(null);

  function handleSectionChange(newSection: SectionKey) {
    navigate({
      to: "/admin",
      search: {
        section: newSection,
      },
    });
  }

  // Food Orders → View Payment.
  function handleViewPayment(orderId: string) {
    setPaymentTargetOrderId(orderId);
    setPaymentTargetReservationId(null);

    navigate({
      to: "/admin",
      search: {
        section: "payments",
      },
    });
  }

  // Room Sessions → View Payment.
  function handleViewRoomPayment(reservationId: string) {
    setPaymentTargetReservationId(reservationId);
    setPaymentTargetOrderId(null);

    navigate({
      to: "/admin",
      search: {
        section: "payments",
      },
    });
  }

  // Clear handled food payment target.
  function handlePaymentTargetHandled() {
    setPaymentTargetOrderId(null);
  }

  // Clear handled room payment target.
  function handleReservationPaymentTargetHandled() {
    setPaymentTargetReservationId(null);
  }

  const panels: Record<SectionKey, ReactNode> = {
    dashboard: <Dashboard res={res} orders={orders} onSection={handleSectionChange} />,

    bookings: <Bookings res={res} />,

    sessions: <RoomSessions res={res} onViewPayment={handleViewRoomPayment} />,

    schedule: <Schedule res={res} />,

    orders: <Orders orders={orders} onViewPayment={handleViewPayment} />,

    payments: (
      <Payments
        res={res}
        orders={orders}
        paymentTargetOrderId={paymentTargetOrderId}
        onPaymentTargetHandled={handlePaymentTargetHandled}
        paymentTargetReservationId={paymentTargetReservationId}
        onReservationPaymentTargetHandled={handleReservationPaymentTargetHandled}
      />
    ),

    rooms: <RoomsAdmin />,

    menu: <MenuAdmin />,

    users: <Customers res={res} />,

    messages: <Messages />,

    reports: <Reports res={res} orders={orders} />,

    settings: <SettingsAdmin />,
  };

  return (
    <AdminShell section={section} onSection={handleSectionChange} res={res} orders={orders}>
      <div className="mx-auto max-w-6xl">{panels[section]}</div>
    </AdminShell>
  );
}
