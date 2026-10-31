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

export function Orders({ orders }: { orders: OrderRow[] }) {
  const qc = useQueryClient();
  const [showDone, setShowDone] = useState(false);
  const list = orders.filter((o) => showDone || !["served", "cancelled"].includes(o.status));
  const set = async (id: string, status: FoStatus) => {
    const { data, error } = await supabase
      .from("food_orders")
      .update({ status, served_at: status === "served" ? new Date().toISOString() : null })
      .eq("id", id)
      .select("id");
    if (error) return void toast.error(errMsg(error));
    if (!data || data.length === 0)
      return void toast.error("That change didn't go through — refresh the page and try again.");
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };
  return (
    <div className="mt-4">
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={showDone} onCheckedChange={setShowDone} /> Show served & cancelled
      </label>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {list.length === 0 && <p className="text-muted-foreground">No open orders.</p>}
        {list.map((o) => (
          <div key={o.id} className="rounded-xl border border-border bg-card p-4 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {o.reference_code} · {o.order_type === "pre_order" ? "Pre-order" : "In-room"}
              </p>
              <StatusBadge status={o.status} />
            </div>
            <p className="text-muted-foreground">
              {o.reservations?.rooms?.name} · {o.reservations?.reference_code} ·{" "}
              {o.reservations && fmtDate(o.reservations.booking_date)}
            </p>
            <ul className="mt-2">
              {o.food_order_items.map((i) => (
                <li key={i.id}>
                  {i.quantity}× {i.item_name_snapshot}
                </li>
              ))}
            </ul>
            {o.special_instructions && (
              <p className="mt-1 italic text-muted-foreground">"{o.special_instructions}"</p>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-accent">{peso(o.food_subtotal)}</span>
              <div className="flex gap-2">
                {NEXT[o.status] && (
                  <Button
                    size="sm"
                    onClick={() => set(o.id, NEXT[o.status]!)}
                    className="capitalize"
                  >
                    Mark {NEXT[o.status]}
                  </Button>
                )}
                {!["served", "cancelled"].includes(o.status) && (
                  <Button size="sm" variant="outline" onClick={() => set(o.id, "cancelled")}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
