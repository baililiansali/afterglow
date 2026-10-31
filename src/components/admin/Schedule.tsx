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

export function Schedule({ res }: { res: ResRow[] }) {
  const [date, setDate] = useState(() =>
    new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10),
  );
  const day = res.filter((r) => r.booking_date === date);
  return (
    <div className="mt-4 space-y-4">
      <div>
        <Label htmlFor="sched-date">Show bookings for</Label>
        <Input
          id="sched-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-44"
        />
      </div>
      {day.length === 0 && <p className="text-muted-foreground">No bookings on this date.</p>}
      <div className="space-y-2">
        {day.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm"
          >
            <div>
              <p className="font-medium">
                {r.rooms?.name} · {fmtTime(r.start_time)} – {fmtTime(r.end_time)}
              </p>
              <p className="text-muted-foreground">
                {r.reference_code} · {r.guest_count} guests
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={r.status} />
              <StatusBadge status={r.payment_status} />
              <PaymentMethodBadge method={r.payment_method} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
