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
export type ResStatus = Database["public"]["Enums"]["reservation_status"];
export type FoStatus = Database["public"]["Enums"]["food_order_status"];

export function useProfiles() {
  return useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      // Temporary links to customer photos (the photos folder is private).
      const paths = data.map((p) => p.avatar_url).filter((x): x is string => !!x);
      const photos: Record<string, string> = {};
      if (paths.length) {
        const { data: signed } = await supabase.storage
          .from("avatars")
          .createSignedUrls(paths, 60 * 60);
        for (const s of signed ?? []) if (s.path && s.signedUrl) photos[s.path] = s.signedUrl;
      }
      return Object.fromEntries(
        data.map((p) => [
          p.id,
          { ...p, photo: p.avatar_url ? (photos[p.avatar_url] ?? null) : null },
        ]),
      );
    },
  });
}

export type ResRow = {
  id: string;
  reference_code: string;
  user_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  guest_count: number;
  room_total: number;
  status: ResStatus;
  payment_status: string;
  payment_method: string;
  payer_name: string | null;
  payer_account_number: string | null;
  payment_reference: string | null;
  special_requests: string | null;
  room_id: string;
  room_rate_snapshot: number;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  checked_out_at: string | null;
  rooms: { name: string; room_number: string } | null;
};

export const NEXT: Partial<Record<FoStatus, FoStatus>> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready: "served",
};

export type OrderRow = {
  id: string;
  reference_code: string;
  order_type: string;
  status: FoStatus;
  food_subtotal: number;
  special_instructions: string | null;
  food_order_items: { id: string; quantity: number; item_name_snapshot: string }[];
  reservations: {
    reference_code: string;
    booking_date: string;
    rooms: { name: string } | null;
  } | null;
};

export type RoomType = Database["public"]["Enums"]["room_type"];
export const ROOM_TYPES: RoomType[] = ["small", "medium", "large", "vip"];
export const emptyRoom = {
  room_number: "",
  name: "",
  room_type: "small" as RoomType,
  capacity: "",
  hourly_rate: "",
  description: "",
  amenities: "",
  image_url: "",
};

export function ViewToggle({
  view,
  setView,
}: {
  view: "list" | "grid";
  setView: (v: "list" | "grid") => void;
}) {
  return (
    <div
      className="ml-auto flex rounded-md border border-border p-0.5"
      role="group"
      aria-label="View"
    >
      <Button
        type="button"
        size="sm"
        variant={view === "list" ? "secondary" : "ghost"}
        onClick={() => setView("list")}
      >
        List
      </Button>
      <Button
        type="button"
        size="sm"
        variant={view === "grid" ? "secondary" : "ghost"}
        onClick={() => setView("grid")}
      >
        Grid
      </Button>
    </div>
  );
}
