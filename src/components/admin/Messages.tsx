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

export function Messages() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["admin-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const markRead = async (id: string) => {
    await supabase.from("contact_messages").update({ is_read: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-messages"] });
  };
  return (
    <div className="mt-4 space-y-3">
      {data.length === 0 && <p className="text-muted-foreground">No messages yet.</p>}
      {data.map((m) => (
        <div
          key={m.id}
          className={`rounded-xl border bg-card p-4 text-sm ${m.is_read ? "border-border opacity-70" : "border-primary/50"}`}
        >
          <div className="flex justify-between gap-2">
            <p className="font-medium">{m.subject}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(m.created_at).toLocaleString("en-PH")}
            </p>
          </div>
          <p className="text-muted-foreground">
            {m.name} · {m.email}
          </p>
          <p className="mt-2 whitespace-pre-wrap">{m.message}</p>
          {!m.is_read && (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => markRead(m.id)}>
              Mark read
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
