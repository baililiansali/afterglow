import { ReservationManager } from "./ReservationManagement";
import type { ResRow } from "./shared";

type RoomSessionsProps = {
  res: ResRow[];
  onViewPayment?: (reservationId: string) => void;
};

export function RoomSessions({ res, onViewPayment }: RoomSessionsProps) {
  return <ReservationManager res={res} mode="sessions" onViewPayment={onViewPayment} />;
}
