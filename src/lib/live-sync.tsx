import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/** Which screens to refresh when a table changes. Keeps admin and customer views in sync live. */
const TABLE_KEYS: Record<string, string[][]> = {
  reservations: [["admin-res"], ["my-bookings"], ["busy"]],
  food_orders: [["admin-orders"], ["my-bookings"]],
  food_order_items: [["admin-orders"], ["my-bookings"]],
  profiles: [["admin-profiles"], ["my-profile"]],
  contact_messages: [["admin-messages"]],
  rooms: [["rooms"], ["room"]],
  menu_items: [["menu"]],
  menu_categories: [["menu"]],
  business_settings: [["settings"]],
};

export function LiveSync() {
  const qc = useQueryClient();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    let ch = supabase.channel(`live-${Math.random().toString(36).slice(2)}`);
    for (const table of Object.keys(TABLE_KEYS)) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        for (const queryKey of TABLE_KEYS[table] ?? []) qc.invalidateQueries({ queryKey });
      });
    }
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // Re-subscribe when the signed-in user changes so the backend sends the right rows.
  }, [qc, user?.id, loading]);

  return null;
}
