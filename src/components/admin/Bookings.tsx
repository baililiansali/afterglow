import { ReservationManager } from "./ReservationManagement";
import type { ResRow } from "./shared";

export function Bookings({ res }: { res: ResRow[] }) {
  return <ReservationManager res={res} mode="all" />;
}
