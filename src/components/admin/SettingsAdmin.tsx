import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/afterglow";
import { settingsQuery } from "@/lib/queries";

export function SettingsAdmin() {
  const qc = useQueryClient();
  const { data: s } = useQuery(settingsQuery);

  if (!s) return null;

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const f = new FormData(e.currentTarget);

    const { error } = await supabase
      .from("business_settings")
      .update({
        // Business information
        business_name: String(f.get("business_name")),
        contact_email: String(f.get("contact_email")),
        contact_phone: String(f.get("contact_phone")),
        address: String(f.get("address")),

        // Operating hours
        opening_time: String(f.get("opening_time")),
        closing_time: String(f.get("closing_time")),

        // Reservation duration
        min_duration_hours: Number(f.get("min_duration_hours")),
        max_duration_hours: Number(f.get("max_duration_hours")),

        // E-wallet payment details
        ewallet_provider: String(f.get("ewallet_provider")),
        ewallet_account_name: String(f.get("ewallet_account_name")),
        ewallet_account_number: String(f.get("ewallet_account_number")),
        ewallet_instructions: String(f.get("ewallet_instructions")),

        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) {
      toast.error(errMsg(error));
      return;
    }

    toast.success("Settings saved successfully");

    qc.invalidateQueries({ queryKey: ["settings"] });
  };

  const businessFields: {
    key: keyof typeof s;
    label: string;
    type: string;
  }[] = [
    {
      key: "business_name",
      label: "Business name",
      type: "text",
    },
    {
      key: "contact_email",
      label: "Email address",
      type: "email",
    },
    {
      key: "contact_phone",
      label: "Phone number",
      type: "text",
    },
    {
      key: "address",
      label: "Business address",
      type: "text",
    },
    {
      key: "opening_time",
      label: "Opening time",
      type: "time",
    },
    {
      key: "closing_time",
      label: "Closing time",
      type: "time",
    },
    {
      key: "min_duration_hours",
      label: "Minimum booking duration (hours)",
      type: "number",
    },
    {
      key: "max_duration_hours",
      label: "Maximum booking duration (hours)",
      type: "number",
    },
  ];

  return (
    <form onSubmit={save} className="mt-4 max-w-3xl space-y-6">
      {/* BUSINESS INFORMATION */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div>
          <h2 className="font-display text-lg font-bold">Business Information</h2>

          <p className="text-sm text-muted-foreground">
            Manage your business details and contact information.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {businessFields.slice(0, 4).map(({ key, label, type }) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={String(key)}>{label}</Label>

              <Input
                id={String(key)}
                name={String(key)}
                type={type}
                required
                defaultValue={String(s[key] ?? "")}
              />
            </div>
          ))}
        </div>
      </section>

      {/* OPERATING HOURS */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div>
          <h2 className="font-display text-lg font-bold">Operating Hours</h2>

          <p className="text-sm text-muted-foreground">
            Set your business hours and reservation duration limits.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {businessFields.slice(4).map(({ key, label, type }) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={String(key)}>{label}</Label>

              <Input
                id={String(key)}
                name={String(key)}
                type={type}
                min={type === "number" ? 1 : undefined}
                required
                defaultValue={String(s[key] ?? "").slice(0, type === "time" ? 5 : undefined)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* PAYMENT SETTINGS */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div>
          <h2 className="font-display text-lg font-bold">Payment Settings</h2>

          <p className="text-sm text-muted-foreground">
            Manage the e-wallet details displayed to customers when they choose e-wallet as their
            payment method.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ewallet_provider">E-wallet provider</Label>

            <Input
              id="ewallet_provider"
              name="ewallet_provider"
              placeholder="e.g. GCash or Maya"
              maxLength={40}
              defaultValue={s.ewallet_provider ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ewallet_account_name">Account name</Label>

            <Input
              id="ewallet_account_name"
              name="ewallet_account_name"
              placeholder="Enter account name"
              maxLength={100}
              defaultValue={s.ewallet_account_name ?? ""}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ewallet_account_number">Account number</Label>

            <Input
              id="ewallet_account_number"
              name="ewallet_account_number"
              placeholder="Enter e-wallet number"
              maxLength={30}
              defaultValue={s.ewallet_account_number ?? ""}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ewallet_instructions">Payment instructions</Label>

            <Textarea
              id="ewallet_instructions"
              name="ewallet_instructions"
              placeholder="Enter instructions for customers..."
              maxLength={300}
              rows={4}
              defaultValue={s.ewallet_instructions ?? ""}
            />

            <p className="text-xs text-muted-foreground">
              Explain how customers should send their payment and submit their payment reference.
            </p>
          </div>
        </div>
      </section>

      {/* SAVE BUTTON */}
      <div className="flex justify-end">
        <Button type="submit">Save all settings</Button>
      </div>
    </form>
  );
}
