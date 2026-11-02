import { ReservationManager } from "./ReservationManagement";
import type { ResRow } from "./shared";

export function RoomSessions({ res }: { res: ResRow[] }) {
  return <ReservationManager res={res} mode="sessions" />;
}
