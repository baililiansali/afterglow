import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/SiteChrome";
import { StatusBadge, PaymentMethodBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ROOM_IMAGES, errMsg, fmtDate, fmtTime, foodImage, peso } from "@/lib/afterglow";
import { ImagePicker } from "@/components/ImagePicker";
import { useAuth } from "@/lib/auth";
import { menuQuery, roomsQuery, settingsQuery } from "@/lib/queries";
import type { Database } from "@/integrations/supabase/types";
import {
  useProfiles,
  ViewToggle,
  NEXT,
  ROOM_TYPES,
  emptyRoom,
  type ResRow,
  type OrderRow,
  type ResStatus,
  type FoStatus,
  type RoomType,
} from "./shared";

export function Bookings({ res }: { res: ResRow[] }) {
  const qc = useQueryClient();
  const { data: profiles = {} } = useProfiles();
  const [filter, setFilter] = useState<"all" | ResStatus>("pending");
  const list = res.filter((r) => filter === "all" || r.status === filter);

  const update = async (
    id: string,
    patch: Database["public"]["Tables"]["reservations"]["Update"],
  ) => {
    const { data, error } = await supabase
      .from("reservations")
      .update(patch)
      .eq("id", id)
      .select("id");
    if (error) return void toast.error(errMsg(error));
    if (!data || data.length === 0)
      return void toast.error("That change didn't go through — refresh the page and try again.");
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["admin-res"] });
  };

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            "pending",
            "approved",
            "checked_in",
            "completed",
            "rejected",
            "cancelled",
            "all",
          ] as const
        ).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filter === s ? "default" : "outline"}
            onClick={() => setFilter(s)}
            className="capitalize"
          >
            {s === "completed" ? "checked out" : s.replace("_", " ")}
          </Button>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {list.length === 0 && <p className="text-muted-foreground">No bookings here.</p>}
        {list.map((r) => {
          const p = profiles[r.user_id];
          return (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="text-sm">
                <p className="font-medium">
                  {r.reference_code} · {r.rooms?.name}
                </p>
                <p className="text-muted-foreground">
                  {fmtDate(r.booking_date)} · {fmtTime(r.start_time)}–{fmtTime(r.end_time)} ·{" "}
                  {r.guest_count} guests · {peso(r.room_total)}
                </p>
                <p className="text-muted-foreground">
                  {p?.full_name ?? "Guest"} · {p?.email} {p?.phone && `· ${p.phone}`}
                </p>
                {r.payment_method === "gcash" && r.payer_name && (
                  <p className="text-muted-foreground">
                    E-wallet: {r.payer_name} · {r.payer_account_number}
                    {r.payment_reference && ` · Ref ${r.payment_reference}`}
                  </p>
                )}
                {r.special_requests && (
                  <p className="mt-1 italic text-muted-foreground">"{r.special_requests}"</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={r.status} />
                <StatusBadge status={r.payment_status} />
                <PaymentMethodBadge method={r.payment_method} />
                {r.status === "pending" && (
                  <>
                    <Button size="sm" onClick={() => update(r.id, { status: "approved" })}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const reason = prompt("Reason for rejection?") ?? "";
                        update(r.id, { status: "rejected", rejection_reason: reason || null });
                      }}
                    >
                      Reject
                    </Button>
                  </>
                )}
                {r.status === "approved" && (
                  <>
                    <Button size="sm" onClick={() => update(r.id, { status: "checked_in" })}>
                      Check in
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!confirm("Cancel this booking (no show)?")) return;
                        update(r.id, { status: "cancelled", rejection_reason: "No show" });
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                )}
                {r.status === "checked_in" && (
                  <Button size="sm" onClick={() => update(r.id, { status: "completed" })}>
                    Check out
                  </Button>
                )}
                {r.payment_status === "unpaid" &&
                  ["approved", "checked_in", "completed"].includes(r.status) && (
                    <Button
                      size="sm"
                      variant="amber"
                      onClick={() => update(r.id, { payment_status: "paid" })}
                    >
                      Mark paid
                    </Button>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
