import { Payments } from "@/components/admin/Payments";
import type { ResRow, OrderRow } from "@/components/admin/shared";

type StaffTransactionsProps = {
  reservations: ResRow[];
  orders: OrderRow[];
};

export function StaffTransactions({ reservations, orders }: StaffTransactionsProps) {
  return <Payments res={reservations} orders={orders} />;
}
