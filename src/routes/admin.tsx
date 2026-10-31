import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Dashboard } from "@/components/admin/Dashboard";
import { useAuth } from "@/lib/auth";
import { Bookings } from "@/components/admin/Bookings";
import { Schedule } from "@/components/admin/Schedule";
import { Orders } from "@/components/admin/Orders";
import { Payments } from "@/components/admin/Payments";
import { RoomsAdmin } from "@/components/admin/RoomsAdmin";
import { MenuAdmin } from "@/components/admin/MenuAdmin";
import { Customers } from "@/components/admin/Customers";
import { Messages } from "@/components/admin/Messages";
import { Reports } from "@/components/admin/Reports";
import { SettingsAdmin } from "@/components/admin/SettingsAdmin";
import { AdminShell, useAdminRes, useAdminOrders, SECTION_TITLES, type SectionKey } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Afterglow" },
      { name: "description", content: "Manage Afterglow bookings, food orders, rooms and menu." },
      { property: "og:title", content: "Admin — Afterglow" },
      { property: "og:description", content: "Afterglow admin dashboard." },
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
  if (loading)
    return <p className="mx-auto max-w-6xl px-4 py-20 text-muted-foreground">Loading…</p>;
  if (!user || !isAdmin)
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold">Admins only</h1>
        <p className="mt-2 text-muted-foreground">Sign in with an admin account to continue.</p>
        <Button asChild variant="glow" className="mt-6">
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  return <Admin />;
}

function Admin() {
  const res = useAdminRes();
  const orders = useAdminOrders();

  const search = Route.useSearch();
  const [section, setSection] = useState<SectionKey>(search.section ?? "dashboard");
  useEffect(() => {
    if (search.section) setSection(search.section);
  }, [search.section]);
  const panels: Record<SectionKey, React.ReactNode> = {
    dashboard: <Dashboard res={res} orders={orders} onSection={setSection} />,
    bookings: <Bookings res={res} />,
    schedule: <Schedule res={res} />,
    orders: <Orders orders={orders} />,
    payments: <Payments res={res} />,
    rooms: <RoomsAdmin />,
    menu: <MenuAdmin />,
    users: <Customers res={res} />,
    messages: <Messages />,
    reports: <Reports res={res} orders={orders} />,
    settings: <SettingsAdmin />,
  };

  return (
    <AdminShell section={section} onSection={setSection} res={res} orders={orders}>
      <div className="mx-auto max-w-6xl">{panels[section]}</div>
    </AdminShell>
  );
}
