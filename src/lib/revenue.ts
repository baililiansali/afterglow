type RevenueReservation = {
  status: string;
  payment_status: string | null;
  room_total: number | string | null;
};

type RevenueFoodOrder = {
  status: string;
  payment_status: string | null;
  food_subtotal: number | string | null;
};

export function isRevenueEligibleReservation(reservation: RevenueReservation): boolean {
  return (
    reservation.payment_status === "paid" && !["rejected", "cancelled"].includes(reservation.status)
  );
}

export function isRevenueEligibleFoodOrder(order: RevenueFoodOrder): boolean {
  return order.payment_status === "paid" && order.status !== "cancelled";
}

export function calculateCollectedRevenue<
  TReservation extends RevenueReservation,
  TFoodOrder extends RevenueFoodOrder,
>(reservations: readonly TReservation[], orders: readonly TFoodOrder[]) {
  const paidReservations = reservations.filter(isRevenueEligibleReservation);
  const paidOrders = orders.filter(isRevenueEligibleFoodOrder);

  const roomRevenue = paidReservations.reduce(
    (total, reservation) => total + Number(reservation.room_total ?? 0),
    0,
  );
  const foodRevenue = paidOrders.reduce(
    (total, order) => total + Number(order.food_subtotal ?? 0),
    0,
  );

  return {
    paidReservations,
    paidOrders,
    roomRevenue,
    foodRevenue,
    totalRevenue: roomRevenue + foodRevenue,
    transactionCount: paidReservations.length + paidOrders.length,
  };
}
