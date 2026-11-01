import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, CalendarCheck, CalendarDays, Clock, DoorClosed, DoorOpen, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, fmtDate, fmtTime, peso } from "@/lib/afterglow";
import { useAuth } from "@/lib/auth";
import { useMyProfile } from "@/lib/avatar";
import { roomsQuery, settingsQuery } from "@/lib/queries";
import type { SectionKey } from "./AdminShell";
import { useProfiles, type OrderRow, type ResRow, type ResStatus } from "./shared";

type RoomState = "available" | "reserved" | "occupied" | "maintenance";

const ROOM_STYLE: Record<RoomState, { label: string; cls: string }> = {
  available: { label: "Available", cls: "border-border text-muted-foreground" },
  reserved: { label: "Reserved", cls: "border-accent/60 text-accent" },
  occupied: { label: "Occupied", cls: "border-primary/70 text-primary" },
  maintenance: { label: "Maintenance", cls: "border-destructive/60 text-destructive" },
};

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
  const { data: settings } = useQuery(settingsQuery);
  const [openRoom, setOpenRoom] = useState<{ name: string; room_number: string } | null>(null);

  // Manila local time (UTC+8)
  const manila = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
  const today = manila.slice(0, 10);
  const nowTime = manila.slice(11, 16);

  const pending = res.filter((r) => r.status === "pending");
  const todays = res.filter(
    (r) => r.booking_date === today && !["cancelled", "rejected"].includes(r.status),
  );
  const inRoom = res.filter((r) => r.status === "checked_in");
  const upcoming = res
    .filter((r) => r.status === "approved" && r.booking_date >= today)
    .sort((a, b) => (a.booking_date + a.start_time).localeCompare(b.booking_date + b.start_time));
  const recent = res.slice(0, 8);

  // Room availability
  const roomState = (room: { id?: string; room_number: string; is_active?: boolean; maintenance_status?: boolean }): { state: RoomState; r?: ResRow } => {
    if (room.maintenance_status || room.is_active === false) return { state: "maintenance" };
    const occ = inRoom.find((r) => r.rooms?.room_number === room.room_number);
    if (occ) return { state: "occupied", r: occ };
    const next = todays.find(
      (r) => r.status === "approved" && r.rooms?.room_number === room.room_number && r.end_time.slice(0, 5) > nowTime,
    );
    if (next) return { state: "reserved", r: next };
    return { state: "available" };
  };
  const roomStates = rooms.map((room) => ({ room, ...roomState(room as never) }));
  const occupiedCount = roomStates.filter((x) => x.state === "occupied").length;
  const availableCount = roomStates.filter((x) => x.state === "available").length;

  // Today's revenue: recorded payments only (paid bookings today + served food today)
  const todayRoomRevenue = res
    .filter((r) => r.booking_date === today && r.payment_status === "paid")
    .reduce((s, r) => s + Number(r.room_total), 0);
  const todayFoodRevenue = orders
    .filter((o) => o.status === "served" && o.reservations?.booking_date === today)
    .reduce((s, o) => s + Number(o.food_subtotal), 0);
  const todayRevenue = todayRoomRevenue + todayFoodRevenue;

  // Last 7 days chart
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.parse(today) - (6 - i) * 86400000).toISOString().slice(0, 10);
    return { d, n: res.filter((r) => r.booking_date === d).length };
  });
  const maxDay = Math.max(1, ...days.map((x) => x.n));

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
    { l: "Total reservations", v: res.length, sub: "All bookings", icon: CalendarDays, tone: "text-primary", go: "bookings" as SectionKey },
    { l: "Today's reservations", v: todays.length, sub: "Scheduled today", icon: CalendarCheck, tone: "text-primary", go: "schedule" as SectionKey },
    { l: "Pending reservations", v: pending.length, sub: "Awaiting approval", icon: Clock, tone: "text-accent", go: "bookings" as SectionKey },
    { l: "Available rooms", v: availableCount, sub: `of ${rooms.length} rooms`, icon: DoorOpen, tone: "text-glow", go: "rooms" as SectionKey },
    { l: "Occupied rooms", v: occupiedCount, sub: "In use now", icon: DoorClosed, tone: "text-primary", go: "schedule" as SectionKey },
    { l: "Today's revenue", v: peso(todayRevenue), sub: "Payments collected", icon: Wallet, tone: "text-accent", go: "payments" as SectionKey },
  ];

  const name = (uid: string) => profiles[uid]?.full_name || "Guest";

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

      {/* 1. Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
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
            <p className="mt-3 font-display text-2xl font-bold">{s.v}</p>
            <p className={`mt-1 text-xs ${s.tone}`}>{s.sub}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Pending approvals */}
          <Panel title="Pending approvals" action={() => onSection("bookings")} actionLabel="All reservations">
            {pending.length === 0 && <Empty>No bookings waiting for review.</Empty>}
            {pending.slice(0, 5).map((r) => (
              <div key={r.id} data-testid="dash-pending" className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{name(r.user_id)} · {r.rooms?.name ?? "Room"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.reference_code} · {fmtDate(r.booking_date)} · {fmtTime(r.start_time)}–{fmtTime(r.end_time)} · {r.guest_count} guests · {peso(r.room_total)}
                  </p>
                </div>
                <Button size="sm" variant="glow" onClick={() => setStatus(r.id, "approved")}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "rejected")}>Reject</Button>
              </div>
            ))}
          </Panel>

          {/* 2. Recent reservations */}
          <Panel title="Recent reservations" action={() => onSection("bookings")} actionLabel="View details">
            <ResTable rows={recent} name={name} empty="No reservations yet." />
          </Panel>

          {/* 3. Upcoming reservations */}
          <Panel title="Upcoming reservations" action={() => onSection("schedule")} actionLabel="Room schedule">
            <ResTable rows={upcoming.slice(0, 8)} name={name} empty="No confirmed upcoming bookings." />
          </Panel>
        </div>

        <div className="space-y-6">
          {/* 5. Reservation overview chart */}
          <Panel title="Reservations · last 7 days" action={() => onSection("reports")} actionLabel="Reports">
            <div className="flex h-40 items-end gap-2">
              {days.map((x) => (
                <div key={x.d} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-semibold">{x.n}</span>
                  <div
                    className="w-full rounded-t-md bg-primary"
                    style={{ height: `${(x.n / maxDay) * 100}%`, minHeight: 4 }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(x.d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          {/* 4. Room availability overview */}
          <Panel title="Room availability" action={() => onSection("rooms")} actionLabel="Rooms">
            <div className="mb-2 flex flex-wrap gap-3 text-xs">
              {(Object.keys(ROOM_STYLE) as RoomState[]).map((k) => (
                <span key={k} className={ROOM_STYLE[k].cls.split(" ")[1]}>● {ROOM_STYLE[k].label}</span>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {roomStates.map(({ room, state, r }) => (
                <button
                  type="button"
                  onClick={() => setOpenRoom(room)}
                  key={room.room_number}
                  title={`${room.name} — ${ROOM_STYLE[state].label}${r ? ` (${fmtTime(r.start_time)}–${fmtTime(r.end_time)})` : ""}`}
                  className={`rounded-lg border bg-background/40 p-2 text-center transition hover:border-primary ${ROOM_STYLE[state].cls}`}
                >
                  <p className="font-display text-sm font-bold">{room.room_number}</p>
                  <p className="truncate text-[10px]">{r ? `til ${fmtTime(r.end_time)}` : ROOM_STYLE[state].label}</p>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Tap a room to see today's full schedule.</p>
          </Panel>
        </div>
      </div>

      <Dialog open={!!openRoom} onOpenChange={(o) => !o && setOpenRoom(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {openRoom?.name} · Today's schedule
            </DialogTitle>
          </DialogHeader>
          {openRoom && (
            <RoomDay
              rows={todays.filter((r) => r.rooms?.room_number === openRoom.room_number)}
              open={settings?.opening_time?.slice(0, 5) ?? "12:00"}
              close={settings?.closing_time?.slice(0, 5) ?? "24:00"}
              nowTime={nowTime}
              name={name}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toT = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hrs = (m: number) => `${+(m / 60).toFixed(1)} hr${m === 60 ? "" : "s"}`;

function RoomDay({ rows, open, close, nowTime, name }: { rows: ResRow[]; open: string; close: string; nowTime: string; name: (uid: string) => string }) {
  const o = toMin(open);
  let c = toMin(close);
  if (c <= o) c += 24 * 60;
  const now = toMin(nowTime);
  const sorted = [...rows].sort((a, b) => a.start_time.localeCompare(b.start_time));
  type Item = { kind: "gap"; s: number; e: number } | { kind: "res"; r: ResRow; s: number; e: number };
  const items: Item[] = [];
  let cur = o;
  for (const r of sorted) {
    const s = toMin(r.start_time);
    let e = toMin(r.end_time);
    if (e <= s) e += 24 * 60;
    if (s > cur) items.push({ kind: "gap", s: cur, e: s });
    items.push({ kind: "res", r, s, e });
    cur = Math.max(cur, e);
  }
  if (cur < c) items.push({ kind: "gap", s: cur, e: c });

  const label = (it: Extract<Item, { kind: "res" }>) => {
    if (it.r.status === "checked_in") return { t: "In room now", cls: "border-primary/70 text-primary" };
    if (it.r.status === "completed" || it.e <= now) return { t: "Finished", cls: "border-border text-muted-foreground" };
    if (it.r.status === "pending") return { t: "Pending approval", cls: "border-accent/60 text-accent" };
    return { t: "Reserved", cls: "border-accent/60 text-accent" };
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Open {fmtTime(open)} – {fmtTime(close)}
      </p>
      {items.map((it, i) =>
        it.kind === "gap" ? (
          it.e <= now ? null : (
            <div key={i} className="rounded-xl border border-dashed border-glow/50 p-3 text-sm text-glow">
              Open {fmtTime(toT(Math.max(it.s, now)))} – {fmtTime(toT(it.e))} · {hrs(it.e - Math.max(it.s, now))} free
            </div>
          )
        ) : (
          <div key={i} className={`rounded-xl border bg-background/40 p-3 text-sm ${label(it).cls}`}>
            <p className="font-medium">
              {fmtTime(it.r.start_time)} – {fmtTime(it.r.end_time)} · {label(it).t}
            </p>
            <p className="text-xs text-muted-foreground">
              {it.r.reference_code} · {name(it.r.user_id)} · {it.r.guest_count} guests
            </p>
          </div>
        ),
      )}
    </div>
  );
}

function ResTable({ rows, name, empty }: { rows: ResRow[]; name: (uid: string) => string; empty: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Reservation ID</th>
            <th className="py-2 pr-3 font-medium">Customer</th>
            <th className="py-2 pr-3 font-medium">Room</th>
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Time</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/50 last:border-0">
              <td className="py-2 pr-3 font-mono text-xs">{r.reference_code}</td>
              <td className="py-2 pr-3">{name(r.user_id)}</td>
              <td className="py-2 pr-3">{r.rooms?.name ?? "—"}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.booking_date)}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{fmtTime(r.start_time)}–{fmtTime(r.end_time)}</td>
              <td className="py-2"><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
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
