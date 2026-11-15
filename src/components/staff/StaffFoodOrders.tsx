import { Orders } from "@/components/admin/Orders";
import type { OrderRow } from "@/components/admin/shared";

type StaffFoodOrdersProps = {
  orders: OrderRow[];
  onViewPayment?: (orderId: string) => void;
};

export function StaffFoodOrders({ orders, onViewPayment }: StaffFoodOrdersProps) {
  return <Orders orders={orders} onViewPayment={onViewPayment ?? (() => {})} />;
}
