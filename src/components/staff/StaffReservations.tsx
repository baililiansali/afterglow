import { ReservationManager } from "@/components/admin/ReservationManagement";
import type { ResRow } from "@/components/admin/shared";

type StaffReservationsProps = {
  reservations: ResRow[];
};

export function StaffReservations({ reservations }: StaffReservationsProps) {
  return <ReservationManager res={reservations} mode="all" />;
}
