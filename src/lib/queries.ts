import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const roomsQuery = queryOptions({
  queryKey: ["rooms"],
  queryFn: async () => {
    const { data, error } = await supabase.from("rooms").select("*").order("room_number");
    if (error) throw error;
    return data;
  },
});

export const roomQuery = (id: string) =>
  queryOptions({
    queryKey: ["room", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const menuQuery = queryOptions({
  queryKey: ["menu"],
  queryFn: async () => {
    const [cats, items] = await Promise.all([
      supabase.from("menu_categories").select("*").order("sort_order"),
      supabase.from("menu_items").select("*").order("name"),
    ]);
    if (cats.error) throw cats.error;
    if (items.error) throw items.error;
    return { categories: cats.data, items: items.data };
  },
});

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("business_settings")
      .select("*")
      .eq("id", 1)
      .single();
    if (error) throw error;
    return data;
  },
});

export const busySlotsQuery = (roomId: string, date: string) =>
  queryOptions({
    queryKey: ["busy", roomId, date],
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_room_busy_slots", {
        _room_id: roomId,
        _date: date,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

/** Whole-hour start options between opening and closing (HH:MM). */
export function hourOptions(open: string, close: string) {
  const o = Number(open.slice(0, 2));
  const c = Number(close.slice(0, 2));
  const out: string[] = [];
  for (let h = o; h < c; h++) out.push(`${String(h).padStart(2, "0")}:00`);
  return out;
}

export function addHours(t: string, h: number) {
  const n = Number(t.slice(0, 2)) + h;
  return `${String(n).padStart(2, "0")}:00`;
}
