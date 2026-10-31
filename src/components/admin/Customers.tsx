import { initials } from "@/lib/avatar";
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

export function Customers({ res }: { res: ResRow[] }) {
  const { data: profiles = {} } = useProfiles();
  const { data: adminIds = [] } = useQuery({
    queryKey: ["admin-role-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (error) throw error;
      return data.map((r) => r.user_id);
    },
  });
  const rows = Object.values(profiles)
    .filter((p) => !adminIds.includes(p.id))
    .map((p) => ({
      ...p,
      bookings: res.filter((r) => r.user_id === p.id).length,
      last: res
        .filter((r) => r.user_id === p.id)
        .map((r) => r.booking_date)
        .sort()
        .at(-1),
    }))
    .sort((a, b) => b.bookings - a.bookings);
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-left text-muted-foreground">
          <tr>
            <th className="p-3">Customer</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Bookings</th>
            <th>Last booking</th>
            <th>Joined</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="p-4 text-muted-foreground">
                No customers yet.
              </td>
            </tr>
          )}
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="p-3">
                <div className="flex items-center gap-2">
                  {p.photo ? (
                    <img src={p.photo} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                      {initials(p.full_name, p.email)}
                    </span>
                  )}
                  {p.full_name ?? "Guest"}
                </div>
              </td>
              <td>{p.email}</td>
              <td>{p.phone ?? "—"}</td>
              <td>{p.bookings}</td>
              <td>{p.last ? fmtDate(p.last) : "—"}</td>
              <td>{fmtDate(p.created_at.slice(0, 10))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
