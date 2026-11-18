import { ReservationManager } from "@/components/admin/ReservationManagement";
import type { ResRow } from "@/components/admin/shared";

type StaffRoomSessionsProps = {
  reservations: ResRow[];
};

export function StaffRoomSessions({ reservations }: StaffRoomSessionsProps) {
  return <ReservationManager res={reservations} mode="sessions" />;
}
