import roomSmall from "@/assets/room-small.jpg";
import roomMedium from "@/assets/room-medium.jpg";
import roomLarge from "@/assets/room-large.jpg";
import roomVip from "@/assets/room-vip.jpg";

import fries from "@/assets/food-fries.jpg";
import nachos from "@/assets/food-nachos.jpg";
import wings from "@/assets/food-wings.jpg";
import pizza from "@/assets/food-pizza.jpg";
import burger from "@/assets/food-burger.jpg";
import brownie from "@/assets/food-brownie.jpg";
import drinks from "@/assets/food-drinks.jpg";

import type { RoomType } from "@/types/afterglow";

export const ROOM_IMAGES: Record<RoomType, string> = {
  small: roomSmall,
  medium: roomMedium,
  large: roomLarge,
  vip: roomVip,
};

const FOOD_IMAGES: Record<string, string> = {
  fries,
  nachos,
  wings,
  pizza,
  burger,
  brownie,
  "iced-tea": drinks,
  softdrink: drinks,
  water: drinks,
};

export function foodImage(key: string | null | undefined) {
  return (key && FOOD_IMAGES[key]) || drinks;
}

export function peso(n: number | string | null | undefined) {
  const v = Number(n ?? 0);

  return (
    "₱" +
    v.toLocaleString("en-PH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  );
}

export function fmtTime(t: string) {
  const [h = 0, m = 0] = t.split(":").map(Number);

  const suffix = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;

  return `${hh}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";

  const datePart = d.slice(0, 10);
  const parsedDate = new Date(`${datePart}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) return "—";

  return parsedDate.toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Hours between two HH:MM(:SS) strings. */
export function durationHours(start: string, end: string) {
  const toMin = (t: string) => {
    const [h = 0, m = 0] = t.split(":").map(Number);
    return h * 60 + m;
  };

  return (toMin(end) - toMin(start)) / 60;
}

/** Overlap rule: newStart < existingEnd AND newEnd > existingStart. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && aEnd > bStart;
}

export function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: string }).message);
  }

  return "Something went wrong.";
}
