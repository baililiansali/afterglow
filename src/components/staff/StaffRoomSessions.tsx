import { ReservationManager } from "@/components/admin/ReservationManagement";
import type { ResRow } from "@/components/admin/shared";

type StaffRoomSessionsProps = {
  reservations: ResRow[];
  onViewPayment?: (reservationId: string) => void;
};

export function StaffRoomSessions({ reservations, onViewPayment }: StaffRoomSessionsProps) {
  return <ReservationManager res={reservations} mode="sessions" onViewPayment={onViewPayment} />;
}
