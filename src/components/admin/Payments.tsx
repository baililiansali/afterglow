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

export function Payments({ res }: { res: ResRow[] }) {
  const qc = useQueryClient();
  const { data: s } = useQuery(settingsQuery);
  const { data: profiles = {} } = useProfiles();
  const [method, setMethod] = useState<"all" | "cash" | "gcash">("all");
  const [status, setStatus] = useState<"all" | "unpaid" | "paid">("unpaid");
  if (!s) return null;
  const list = res.filter(
    (r) =>
      !["rejected", "cancelled"].includes(r.status) &&
      (method === "all" || r.payment_method === method) &&
      (status === "all" || r.payment_status === status),
  );
  const saveWallet = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data, error } = await supabase
      .from("business_settings")
      .update({
        ewallet_provider: String(f.get("ewallet_provider")).trim(),
        ewallet_account_name: String(f.get("ewallet_account_name")).trim(),
        ewallet_account_number: String(f.get("ewallet_account_number")).trim(),
        ewallet_instructions: String(f.get("ewallet_instructions")).trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .select("id");
    if (error) return void toast.error(errMsg(error));
    if (!data?.length)
      return void toast.error("That change didn't go through — refresh and try again.");
    toast.success("E-wallet details saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  };
  const setPaid = async (id: string, payment_status: "paid" | "unpaid") => {
    const { data, error } = await supabase
      .from("reservations")
      .update({ payment_status })
      .eq("id", id)
      .select("id");
    if (error) return void toast.error(errMsg(error));
    if (!data?.length)
      return void toast.error("That change didn't go through — refresh and try again.");
    toast.success(payment_status === "paid" ? "Marked paid" : "Marked unpaid");
    qc.invalidateQueries({ queryKey: ["admin-res"] });
  };
  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[22rem_1fr]">
      <form
        onSubmit={saveWallet}
        className="h-fit space-y-3 rounded-xl border border-border bg-card p-5"
      >
        <p className="font-display text-lg font-bold">Your e-wallet</p>
        <p className="text-xs text-muted-foreground">
          Guests see these details when they choose e-wallet at checkout.
        </p>
        <div>
          <Label htmlFor="ewallet_provider">Wallet</Label>
          <Input
            id="ewallet_provider"
            name="ewallet_provider"
            required
            maxLength={40}
            defaultValue={s.ewallet_provider}
          />
        </div>
        <div>
          <Label htmlFor="ewallet_account_name">Account name</Label>
          <Input
            id="ewallet_account_name"
            name="ewallet_account_name"
            required
            maxLength={100}
            defaultValue={s.ewallet_account_name}
          />
        </div>
        <div>
          <Label htmlFor="ewallet_account_number">Account number</Label>
          <Input
            id="ewallet_account_number"
            name="ewallet_account_number"
            required
            maxLength={30}
            defaultValue={s.ewallet_account_number}
          />
        </div>
        <div>
          <Label htmlFor="ewallet_instructions">Instructions</Label>
          <Textarea
            id="ewallet_instructions"
            name="ewallet_instructions"
            maxLength={300}
            defaultValue={s.ewallet_instructions}
          />
        </div>
        <Button type="submit" className="w-full">
          Save e-wallet
        </Button>
      </form>
      <div>
        <div className="flex flex-wrap gap-2">
          {(["all", "cash", "gcash"] as const).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={method === m ? "default" : "outline"}
              onClick={() => setMethod(m)}
            >
              {m === "all" ? "All methods" : m === "cash" ? "Cash" : "E-wallet"}
            </Button>
          ))}
          <span className="mx-1 w-px bg-border" />
          {(["unpaid", "paid", "all"] as const).map((x) => (
            <Button
              key={x}
              size="sm"
              variant={status === x ? "default" : "outline"}
              onClick={() => setStatus(x)}
              className="capitalize"
            >
              {x === "all" ? "Any status" : x}
            </Button>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {list.length === 0 && <p className="text-muted-foreground">No payments here.</p>}
          {list.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm"
            >
              <div>
                <p className="font-medium">
                  {r.reference_code} · {r.rooms?.name} · {peso(r.room_total)}
                </p>
                <p className="text-muted-foreground">
                  {profiles[r.user_id]?.full_name ?? "Guest"} · {fmtDate(r.booking_date)}
                </p>
                {r.payment_method === "gcash" && (
                  <p className="text-muted-foreground">
                    From: {r.payer_name ?? "—"} · {r.payer_account_number ?? "—"}
                    {r.payment_reference && ` · Ref ${r.payment_reference}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <PaymentMethodBadge method={r.payment_method} />
                <StatusBadge status={r.payment_status} />
                {r.payment_status === "unpaid" ? (
                  <Button size="sm" variant="amber" onClick={() => setPaid(r.id, "paid")}>
                    Mark paid
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setPaid(r.id, "unpaid")}>
                    Undo paid
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
