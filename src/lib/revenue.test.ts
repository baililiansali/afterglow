import { describe, expect, it } from "vitest";

import { calculateCollectedRevenue } from "./revenue";

describe("calculateCollectedRevenue", () => {
  it("counts only paid, non-cancelled room and food transactions", () => {
    const reservations = [
      { status: "approved", payment_status: "paid", room_total: 1200 },
      { status: "cancelled", payment_status: "paid", room_total: 800 },
      { status: "rejected", payment_status: "paid", room_total: 500 },
      { status: "approved", payment_status: "unpaid", room_total: 400 },
    ];
    const orders = [
      { status: "served", payment_status: "paid", food_subtotal: 300 },
      { status: "cancelled", payment_status: "paid", food_subtotal: 200 },
      { status: "served", payment_status: "unpaid", food_subtotal: 100 },
    ];

    expect(calculateCollectedRevenue(reservations, orders)).toMatchObject({
      roomRevenue: 1200,
      foodRevenue: 300,
      totalRevenue: 1500,
      transactionCount: 2,
    });
  });
});
