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
  const inRange = (d: string) => d >= range.from && d <= range.to;
  const bookings = res.filter((r) => inRange(r.booking_date));
  const orderRows = orders.filter((o) => o.reservations && inRange(o.reservations.booking_date));
  const roomRevenue = bookings
    .filter((r) => r.payment_status === "paid")
    .reduce((s, r) => s + Number(r.room_total), 0);
  const foodRevenue = orderRows
    .filter((o) => o.status === "served")
    .reduce((s, o) => s + Number(o.food_subtotal), 0);
  const byStatus = (
    ["pending", "approved", "checked_in", "completed", "rejected", "cancelled"] as ResStatus[]
  ).map((s) => ({
    s,
    n: bookings.filter((r) => r.status === s).length,
  }));
  const sold = new Map<string, number>();
  for (const o of orderRows)
    for (const i of o.food_order_items)
      sold.set(i.item_name_snapshot, (sold.get(i.item_name_snapshot) ?? 0) + i.quantity);
  const best = [...sold.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="rep-from">From</Label>
          <Input
            id="rep-from"
            type="date"
            value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
            className="w-40"
          />
        </div>
        <div>
          <Label htmlFor="rep-to">To</Label>
          <Input
            id="rep-to"
            type="date"
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
            className="w-40"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Bookings in range</p>
          <p className="mt-1 font-display text-2xl font-bold">{bookings.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Room charges (paid)</p>
          <p className="mt-1 font-display text-2xl font-bold">{peso(roomRevenue)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Food orders</p>
          <p className="mt-1 font-display text-2xl font-bold">{orderRows.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Food sales (served)</p>
          <p className="mt-1 font-display text-2xl font-bold">{peso(foodRevenue)}</p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="font-medium">Bookings by status</p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {byStatus.map((b) => (
                <tr key={b.s}>
                  <td className="py-1 capitalize text-muted-foreground">{b.s.replace("_", " ")}</td>
                  <td className="text-right">{b.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="font-medium">Bestselling items</p>
          {best.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No food orders in this range.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <tbody>
                {best.map(([name, q]) => (
                  <tr key={name}>
                    <td className="py-1">{name}</td>
                    <td className="text-right text-muted-foreground">{q} sold</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-muted-foreground">
            <tr>
              <th className="p-3">Reference</th>
              <th>Room</th>
              <th>Date</th>
              <th>Status</th>
              <th className="text-right">Room total</th>
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
                <td className="text-right">{peso(r.room_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
