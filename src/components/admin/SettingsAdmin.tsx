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

export function SettingsAdmin() {
  const qc = useQueryClient();
  const { data: s } = useQuery(settingsQuery);
  if (!s) return null;
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase
      .from("business_settings")
      .update({
        business_name: String(f.get("business_name")),
        contact_email: String(f.get("contact_email")),
        contact_phone: String(f.get("contact_phone")),
        address: String(f.get("address")),
        opening_time: String(f.get("opening_time")),
        closing_time: String(f.get("closing_time")),
        min_duration_hours: Number(f.get("min_duration_hours")),
        max_duration_hours: Number(f.get("max_duration_hours")),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) return void toast.error(errMsg(error));
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  };
  const fields: [keyof typeof s, string, string][] = [
    ["business_name", "Business name", "text"],
    ["contact_email", "Email", "email"],
    ["contact_phone", "Phone", "text"],
    ["address", "Address", "text"],
    ["opening_time", "Opens", "time"],
    ["closing_time", "Closes", "time"],
    ["min_duration_hours", "Min hours", "number"],
    ["max_duration_hours", "Max hours", "number"],
  ];
  return (
    <form
      onSubmit={save}
      className="mt-4 grid max-w-2xl gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2"
    >
      {fields.map(([k, l, t]) => (
        <div key={k}>
          <Label htmlFor={k}>{l}</Label>
          <Input
            id={k}
            name={k}
            type={t}
            required
            defaultValue={String(s[k]).slice(0, t === "time" ? 5 : undefined)}
          />
        </div>
      ))}
      <Button type="submit" className="sm:col-span-2">
        Save settings
      </Button>
    </form>
  );
}
