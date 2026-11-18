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

// TIME HELPERS

/**
 * Convert an HH:MM or HH:MM:SS value into minutes.
 *
 * This intentionally supports timeline values such as 24:00 and 27:00.
 */
export function timeToMinutes(time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/**
 * Convert timeline minutes into HH:MM.
 * Unlike a clock value, this can return 24:00, 27:00, etc.
 */
function timelineTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Get the next calendar date without depending on the browser's local timezone.
 */
function nextDate(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/**
 * Get available hourly start times.
 *
 * Example:
 * 14:00–03:00 returns 14:00 through 02:00.
 */
export function hourOptions(open: string, close: string) {
  const openingMinutes = timeToMinutes(open);
  let closingMinutes = timeToMinutes(close);

  if (closingMinutes <= openingMinutes) {
    closingMinutes += 24 * 60;
  }

  const options: string[] = [];

  const firstHour = Math.ceil(openingMinutes / 60);
  const lastHour = Math.ceil(closingMinutes / 60);

  for (let hour = firstHour; hour < lastHour; hour++) {
    const clockHour = hour % 24;
    options.push(`${String(clockHour).padStart(2, "0")}:00`);
  }

  return options;
}

/**
 * Add hours to a clock time and wrap around midnight.
 *
 * Example: addHours("23:00", 4) returns "03:00".
 */
export function addHours(time: string, hours: number) {
  const result = (timeToMinutes(time) + hours * 60) % (24 * 60);
  const normalized = (result + 24 * 60) % (24 * 60);

  return timelineTime(normalized);
}

/**
 * Check whether a duration fits inside the business operating window.
 *
 * Supports both regular and overnight operating hours.
 */
export function canFitDuration(open: string, close: string, start: string, hours: number) {
  const openingMinutes = timeToMinutes(open);
  const closingMinutes = timeToMinutes(close);
  const startMinutes = timeToMinutes(start);

  let startOnTimeline: number;
  let closingOnTimeline: number;

  if (closingMinutes > openingMinutes) {
    // Regular operating hours.
    if (startMinutes < openingMinutes || startMinutes >= closingMinutes) {
      return false;
    }

    startOnTimeline = startMinutes;
    closingOnTimeline = closingMinutes;
  } else {
    // Overnight operating hours.
    if (startMinutes >= openingMinutes) {
      startOnTimeline = startMinutes;
      closingOnTimeline = closingMinutes + 24 * 60;
    } else if (startMinutes < closingMinutes) {
      startOnTimeline = startMinutes;
      closingOnTimeline = closingMinutes;
    } else {
      return false;
    }
  }

  return startOnTimeline + hours * 60 <= closingOnTimeline;
}

// CUSTOMER BOOKING BUSY SLOTS

export const busySlotsQuery = (roomId: string, date: string) =>
  queryOptions({
    queryKey: ["busy", roomId, date],
    enabled: !!date,
    queryFn: async () => {
      const followingDate = nextDate(date);

      const [currentDay, followingDay] = await Promise.all([
        supabase.rpc("get_room_busy_slots", {
          _room_id: roomId,
          _date: date,
        }),
        supabase.rpc("get_room_busy_slots", {
          _room_id: roomId,
          _date: followingDate,
        }),
      ]);

      if (currentDay.error) throw currentDay.error;
      if (followingDay.error) throw followingDay.error;

      const currentSlots = currentDay.data ?? [];
      const followingSlots = followingDay.data ?? [];

      // Shift the following day's intervals by 24 hours.
      // This lets the booking page compare one continuous timeline.
      const shiftedFollowingSlots = followingSlots.map((slot) => ({
        start_time: timelineTime(24 * 60 + timeToMinutes(slot.start_time)),
        end_time: timelineTime(24 * 60 + timeToMinutes(slot.end_time)),
      }));

      return [...currentSlots, ...shiftedFollowingSlots];
    },
  });
