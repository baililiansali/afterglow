import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Grid2X2, List } from "lucide-react";

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

// =====================================================
// PROFILES HOOK
// =====================================================

export function useProfiles() {
  return useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");

      if (error) throw error;

      const mapped: Record<string, any> = {};

      for (const profile of data ?? []) {
        let photo: string | null = profile.avatar_url ?? null;

        if (photo && !photo.startsWith("http")) {
          const { data: signed, error: signedError } = await supabase.storage
            .from("avatars")
            .createSignedUrl(photo, 3600);

          if (!signedError) {
            photo = signed?.signedUrl ?? null;
          } else {
            photo = null;
          }
        }

        mapped[profile.id] = {
          ...profile,
          photo,
        };
      }

      return mapped;
    },
  });
}

// =====================================================
// RESERVATION TYPES
// =====================================================

export type ResStatus = Database["public"]["Enums"]["reservation_status"];

export type FoStatus = Extract<
  Database["public"]["Enums"]["food_order_status"],
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "served"
  | "cancelled"
>;

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
  rooms: {
    name: string;
    room_number: string;
  } | null;
};

export type OrderRow = {
  id: string;
  reference_code: string;
  user_id: string;
  reservation_id: string | null;
  order_type: "pre_order" | "in_room";
  status: FoStatus;
  food_subtotal: number;
  payment_method: string;
  payment_status: "unpaid" | "paid";
  payer_name: string | null;
  payer_account_number: string | null;
  payment_reference: string | null;
  special_instructions: string | null;
  submitted_at: string | null;
  created_at: string;
  served_at: string | null;
  food_order_items: {
    id: string;
    food_order_id: string;
    menu_item_id: string | null;
    item_name_snapshot: string;
    unit_price_snapshot: number;
    quantity: number;
    line_total: number;
  }[];
  reservations: {
    reference_code: string;
    booking_date: string;
    rooms: {
      name: string;
      room_number: string;
    } | null;
  } | null;
  profiles: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

// =====================================================
// ROOM TYPES
// =====================================================

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

// =====================================================
// GRID AND LIST VIEW TOGGLE
// =====================================================

type ViewToggleProps = {
  view: "list" | "grid";
  setView: (view: "list" | "grid") => void;
};

export function ViewToggle({ view, setView }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-1">
      <Button
        size="sm"
        variant={view === "grid" ? "default" : "ghost"}
        onClick={() => setView("grid")}
      >
        <Grid2X2 className="mr-1.5 h-4 w-4" />
        Grid
      </Button>

      <Button
        size="sm"
        variant={view === "list" ? "default" : "ghost"}
        onClick={() => setView("list")}
      >
        <List className="mr-1.5 h-4 w-4" />
        List
      </Button>
    </div>
  );
}
