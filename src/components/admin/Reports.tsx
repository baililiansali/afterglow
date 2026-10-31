import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/SiteChrome";
import { StatusBadge, PaymentMethodBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ROOM_IMAGES, errMsg, fmtDate, fmtTime, foodImage, peso } from "@/lib/afterglow";
import { ImagePicker } from "@/components/ImagePicker";
import { useAuth } from "@/lib/auth";
import { menuQuery, roomsQuery, settingsQuery } from "@/lib/queries";
import type { Database } from "@/integrations/supabase/types";
import {
  useProfiles,
  ViewToggle,
  NEXT,
  ROOM_TYPES,
  emptyRoom,
  type ResRow,
  type OrderRow,
  type ResStatus,
  type FoStatus,
  type RoomType,
} from "./shared";

export function Reports({ res, orders }: { res: ResRow[]; orders: OrderRow[] }) {
  const [range, setRange] = useState(() => {
    const to = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const from = new Date(Date.now() + 8 * 3600 * 1000 - 30 * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    return { from, to };
  });
  const inRange = (d: string) => (!range.from || d >= range.from) && (!range.to || d <= range.to);
  const bookings = res.filter((r) => inRange(r.booking_date));
  const orderRows = orders.filter((o) => o.reservations && inRange(o.reservations.booking_date));
  const paid = bookings.filter((r) => r.payment_status === "paid");
  const roomRevenue = paid.reduce((s, r) => s + Number(r.room_total), 0);
  const served = orderRows.filter((o) => o.status === "served");
  const foodRevenue = served.reduce((s, o) => s + Number(o.food_subtotal), 0);
  const byStatus = (
    ["pending", "approved", "checked_in", "completed", "rejected", "cancelled"] as ResStatus[]
  ).map((s) => ({ s, n: bookings.filter((r) => r.status === s).length }));
  const roomMap = new Map<string, number>();
  for (const r of paid)
    roomMap.set(r.rooms?.name ?? "—", (roomMap.get(r.rooms?.name ?? "—") ?? 0) + Number(r.room_total));
  const byRoom = [...roomMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const sold = new Map<string, number>();
  for (const o of orderRows)
    for (const i of o.food_order_items)
      sold.set(i.item_name_snapshot, (sold.get(i.item_name_snapshot) ?? 0) + i.quantity);
  const best = [...sold.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const orderStatus = (["pending", "confirmed", "preparing", "ready", "served", "cancelled"] as FoStatus[])
    .map((s) => ({ s, n: orderRows.filter((o) => o.status === s).length }))
    .filter((x) => x.n > 0);

  const dateCls =
    "w-44 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-80";

  const TotalCard = ({
    title,
    total,
    rows,
    empty,
  }: {
    title: string;
    total: string;
    rows: [string, string][];
    empty: string;
  }) => (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="font-display text-lg font-semibold">{title}</p>
      <div className="mt-4 flex items-center justify-between border-b border-border pb-3 text-sm font-semibold uppercase tracking-wide">
        <span>Total</span>
        <span className="font-display text-base">{total}</span>
      </div>
      {rows.length === 0 ? (
        <p className="pt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between border-b border-border/60 py-2.5 text-sm last:border-0"
          >
            <span className="capitalize text-muted-foreground">{k}</span>
            <span>{v}</span>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1">
          <Label htmlFor="rep-from" className="text-xs text-muted-foreground">From</Label>
          <Input
            id="rep-from"
            type="date"
            value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
            className={dateCls}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rep-to" className="text-xs text-muted-foreground">To</Label>
          <Input
            id="rep-to"
            type="date"
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
            className={dateCls}
          />
        </div>
        <p className="ml-auto text-sm text-muted-foreground">
          {bookings.length} booking{bookings.length === 1 ? "" : "s"} · {orderRows.length} food order
          {orderRows.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-muted-foreground">
            <tr>
              <th className="p-3">Reference</th>
              <th>Room</th>
              <th>Date</th>
              <th>Status</th>
              <th className="p-3 text-right">Room total</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-muted-foreground">
                  No bookings in this range.
                </td>
              </tr>
            )}
            {bookings.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3">{r.reference_code}</td>
                <td>{r.rooms?.name ?? "—"}</td>
                <td>{fmtDate(r.booking_date)}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td className="p-3 text-right">{peso(r.room_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-display text-2xl font-bold">Totals</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <TotalCard
          title="Bookings by status"
          total={String(bookings.length)}
          rows={byStatus.map((b) => [b.s.replace("_", " "), String(b.n)])}
          empty="No bookings in this range."
        />
        <TotalCard
          title="Room charges (paid)"
          total={peso(roomRevenue)}
          rows={byRoom.map(([k, v]) => [k, peso(v)])}
          empty="No paid bookings in this range."
        />
        <TotalCard
          title="Food sales (served)"
          total={peso(foodRevenue)}
          rows={orderStatus.map((o) => [o.s, `${o.n} order${o.n === 1 ? "" : "s"}`])}
          empty="No food orders in this range."
        />
        <TotalCard
          title="Bestselling items"
          total={`${[...sold.values()].reduce((a, b) => a + b, 0)} sold`}
          rows={best.map(([k, v]) => [k, `${v} sold`])}
          empty="No food orders in this range."
        />
      </div>
    </div>
  );
}
