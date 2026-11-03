import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

import { ReservationManager } from "./ReservationManagement";
import type { ResRow } from "./shared";

const SELECTED_RESERVATION_KEY = "afterglow:selected-reservation";

export function Bookings({ res }: { res: ResRow[] }) {
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;

    return sessionStorage.getItem(SELECTED_RESERVATION_KEY);
  });

  useEffect(() => {
    function handleSelectedReservation(event: Event) {
      const customEvent = event as CustomEvent<{
        reservationId: string;
      }>;

      const reservationId = customEvent.detail?.reservationId;

      if (reservationId) {
        setSelectedReservationId(reservationId);
      }
    }

    window.addEventListener("afterglow:show-reservation", handleSelectedReservation);

    // Check sessionStorage when the Reservations tab mounts.
    const savedId = sessionStorage.getItem(SELECTED_RESERVATION_KEY);

    if (savedId) {
      setSelectedReservationId(savedId);
      sessionStorage.removeItem(SELECTED_RESERVATION_KEY);
    }

    return () => {
      window.removeEventListener("afterglow:show-reservation", handleSelectedReservation);
    };
  }, []);

  const selectedReservation = selectedReservationId
    ? res.find((reservation) => reservation.id === selectedReservationId)
    : null;

  const displayedReservations = selectedReservationId
    ? selectedReservation
      ? [selectedReservation]
      : []
    : res;

  function clearSelectedReservation() {
    setSelectedReservationId(null);
    sessionStorage.removeItem(SELECTED_RESERVATION_KEY);
  }

  return (
    <div className="space-y-4">
      {selectedReservationId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div>
            <p className="text-sm font-semibold">Viewing selected reservation</p>

            <p className="mt-1 text-xs text-muted-foreground">
              {selectedReservation
                ? `Showing ${selectedReservation.reference_code} only.`
                : "The selected reservation could not be found."}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearSelectedReservation}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Show all reservations
          </Button>
        </div>
      )}

      <ReservationManager res={displayedReservations} mode="all" />
    </div>
  );
}
