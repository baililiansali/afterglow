import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ROOMS

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

// RESERVATIONS USED FOR ROOM STATUS AND SCHEDULE

export const roomStatusReservationsQuery = queryOptions({
  queryKey: ["room-status-reservations"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("reservations")
      .select(
        "id, room_id, booking_date, start_time, end_time, status, checked_in_at, checked_out_at",
      )
      .in("status", ["approved", "checked_in"]);

    if (error) throw error;
    return data;
  },
  refetchInterval: 30_000,
});

// MENU

export const menuQuery = queryOptions({
  queryKey: ["menu"],
  queryFn: async () => {
    const [categories, items] = await Promise.all([
      supabase.from("menu_categories").select("*").order("sort_order"),

      supabase.from("menu_items").select("*").order("name"),
    ]);

    if (categories.error) throw categories.error;
    if (items.error) throw items.error;

    return {
      categories: categories.data,
      items: items.data,
    };
  },
});

// BUSINESS SETTINGS

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

// CUSTOMER BOOKING BUSY SLOTS

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

// TIME HELPERS

export function hourOptions(open: string, close: string) {
  const openingHour = Number(open.slice(0, 2));
  const closingHour = Number(close.slice(0, 2));
  const options: string[] = [];

  for (let hour = openingHour; hour < closingHour; hour++) {
    options.push(`${String(hour).padStart(2, "0")}:00`);
  }

  return options;
}

export function addHours(time: string, hours: number) {
  const result = Number(time.slice(0, 2)) + hours;
  return `${String(result).padStart(2, "0")}:00`;
}
