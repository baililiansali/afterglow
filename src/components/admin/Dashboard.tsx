import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarCheck, ChefHat, Clock, DoorOpen, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, fmtDate, fmtTime, peso } from "@/lib/afterglow";
import { useAuth } from "@/lib/auth";
import { useMyProfile } from "@/lib/avatar";
import { roomsQuery } from "@/lib/queries";
import type { SectionKey } from "./AdminShell";
import { useProfiles, type OrderRow, type ResRow, type ResStatus } from "./shared";

export function Dashboard({
  res,
  orders,
  onSection,
}: {
  res: ResRow[];
  orders: OrderRow[];
  onSection: (s: SectionKey) => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const profile = useMyProfile(user?.id) as unknown as { data?: { full_name?: string | null } } | undefined;
  const { data: profiles = {} } = useProfiles();
  const { data: rooms = [] } = useQuery(roomsQuery);
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

  const pending = res.filter((r) => r.status === "pending");
  const todays = res.filter(
    (r) => r.booking_date === today && ["approved", "checked_in"].includes(r.status),
  );
  const inRoom = res.filter((r) => r.status === "checked_in");
  const openOrders = orders.filter((o) => !["served", "cancelled"].includes(o.status));
  const roomRevenue = res
    .filter((r) => r.payment_status === "paid")
    .reduce((s, r) => s + Number(r.room_total), 0);
  const foodRevenue = orders
    .filter((o) => o.status === "served")
    .reduce((s, o) => s + Number(o.food_subtotal), 0);
  const revenue = roomRevenue + foodRevenue;

  const totalRooms = rooms.length || 1;
  const occupied = new Set(inRoom.map((r) => r.rooms?.room_number)).size;
  const reservedToday = new Set(
    todays.filter((r) => r.status === "approved").map((r) => r.rooms?.room_number),
  ).size;
  const available = Math.max(rooms.length - occupied - reservedToday, 0);
  const pct = Math.round((occupied / totalRooms) * 100);

  const firstName =
    (profile?.data?.full_name ?? "").split(" ")[0] || user?.email?.split("@")[0] || "there";

  const setStatus = async (id: string, status: ResStatus) => {
    const { data, error } = await supabase
      .from("reservations")
      .update({ status })
      .eq("id", id)
      .select("id");
    if (error) return void toast.error(errMsg(error));
    if (!data?.length) return void toast.error("That change didn't go through — refresh and try again.");
    toast.success(status === "approved" ? "Booking approved" : "Booking rejected");
    qc.invalidateQueries({ queryKey: ["admin-res"] });
  };

  const stats = [
    { l: "Pending bookings", v: pending.length, sub: "Needs review", icon: Clock, tone: "text-accent", go: "bookings" as SectionKey },
    { l: "Today's bookings", v: todays.length, sub: "Scheduled today", icon: CalendarCheck, tone: "text-primary", go: "schedule" as SectionKey },
    { l: "Checked in now", v: inRoom.length, sub: "In session", icon: DoorOpen, tone: "text-glow", go: "bookings" as SectionKey },
    { l: "Open food orders", v: openOrders.length, sub: "In the kitchen", icon: ChefHat, tone: "text-accent", go: "orders" as SectionKey },
    { l: "Revenue (paid)", v: peso(revenue), sub: "Rooms + food", icon: Wallet, tone: "text-primary", go: "payments" as SectionKey },
  ];

  const name = (uid: string) => profiles[uid]?.full_name || "Guest";
  const C = 2 * Math.PI * 52;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl font-bold">Hello, {firstName}</h2>
          <p className="text-sm text-muted-foreground">Here's what's happening at Afterglow right now.</p>
        </div>
        <span className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
          {fmtDate(today)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <button
            key={s.l}
            type="button"
            onClick={() => onSection(s.go)}
            className="group rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/60 hover:glow-primary"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">{s.l}</p>
              <span className={`rounded-lg bg-secondary p-1.5 ${s.tone}`}>
                <s.icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 font-display text-3xl font-bold">{s.v}</p>
            <p className={`mt-1 text-xs ${s.tone}`}>{s.sub}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Pending approvals" action={() => onSection("bookings")} actionLabel="All bookings">
            {pending.length === 0 && <Empty>No bookings waiting for review.</Empty>}
            {pending.slice(0, 5).map((r) => (
              <div key={r.id} data-testid="dash-pending" className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{name(r.user_id)} · {r.rooms?.name ?? "Room"}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(r.booking_date)} · {fmtTime(r.start_time)}–{fmtTime(r.end_time)} · {r.guest_count} guests · {peso(r.room_total)}
                  </p>
                </div>
                <Button size="sm" variant="glow" onClick={() => setStatus(r.id, "approved")}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "rejected")}>Reject</Button>
              </div>
            ))}
          </Panel>

          <Panel title="In rooms now" action={() => onSection("bookings")} actionLabel="Manage">
            {inRoom.length === 0 && <Empty>No guests checked in right now.</Empty>}
            {inRoom.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary font-display font-bold text-glow">
                  {r.rooms?.room_number ?? "–"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{name(r.user_id)} · {r.rooms?.name}</p>
                  <p className="text-xs text-muted-foreground">Until {fmtTime(r.end_time)}</p>
                </div>
                <StatusBadge status={r.payment_status} />
              </div>
            ))}
          </Panel>

          <Panel title="Kitchen tickets" action={() => onSection("orders")} actionLabel="Food orders">
            {openOrders.length === 0 && <Empty>No open food orders.</Empty>}
            {openOrders.slice(0, 5).map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
                <ChefHat className="h-5 w-5 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {o.reservations?.rooms?.name ?? o.order_type} · {o.reference_code}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.food_order_items.map((i) => `${i.quantity}× ${i.item_name_snapshot}`).join(", ")}
                  </p>
                </div>
                <StatusBadge status={o.status} />
              </div>
            ))}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Room occupancy">
            <div className="flex justify-center py-2">
              <div className="relative h-36 w-36">
                <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="var(--secondary)" strokeWidth="10" />
                  <circle
                    cx="60" cy="60" r="52" fill="none" stroke="var(--primary)" strokeWidth="10"
                    strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-3xl font-bold">{pct}%</span>
                  <span className="text-xs text-muted-foreground">occupied</span>
                </div>
              </div>
            </div>
            <Legend dot="bg-primary" label="Occupied now" value={occupied} />
            <Legend dot="bg-accent" label="Reserved today" value={reservedToday} />
            <Legend dot="bg-muted-foreground" label="Available" value={available} />
          </Panel>

          <Panel title="Revenue split">
            <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
              <div className="bg-primary" style={{ width: `${revenue ? (roomRevenue / revenue) * 100 : 0}%` }} />
              <div className="bg-accent" style={{ width: `${revenue ? (foodRevenue / revenue) * 100 : 0}%` }} />
            </div>
            <Legend dot="bg-primary" label="Room bookings" value={peso(roomRevenue)} />
            <Legend dot="bg-accent" label="Food & drinks" value={peso(foodRevenue)} />
          </Panel>

        </div>
      </div>
    </div>
  );
}

function Panel({ title, children, action, actionLabel }: { title: string; children: React.ReactNode; action?: () => void; actionLabel?: string }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        {action && (
          <button type="button" onClick={action} className="flex items-center gap-1 text-xs text-primary hover:underline">
            {actionLabel} <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{children}</p>;
}

function Legend({ dot, label, value }: { dot: string; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between pt-2 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
