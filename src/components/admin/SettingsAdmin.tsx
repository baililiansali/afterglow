import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/afterglow";
import { settingsQuery } from "@/lib/queries";

type BusinessField = {
  key: string;
  label: string;
  type: "text" | "email" | "time" | "number";
};

export function SettingsAdmin() {
  const { data: s, isLoading, error } = useQuery(settingsQuery);
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);

  const businessFields: BusinessField[] = [
    { key: "business_name", label: "Business Name", type: "text" },
    { key: "contact_email", label: "Contact Email", type: "email" },
    { key: "contact_phone", label: "Contact Number", type: "text" },
    { key: "address", label: "Business Address", type: "text" },
  ];

  const operatingFields: BusinessField[] = [
    { key: "opening_time", label: "Opening Time", type: "time" },
    { key: "closing_time", label: "Closing Time", type: "time" },
    {
      key: "min_duration_hours",
      label: "Minimum Reservation Duration (Hours)",
      type: "number",
    },
    {
      key: "max_duration_hours",
      label: "Maximum Reservation Duration (Hours)",
      type: "number",
    },
  ];

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const form = new FormData(e.currentTarget);

    const minDuration = Number(form.get("min_duration_hours"));
    const maxDuration = Number(form.get("max_duration_hours"));

    if (
      !Number.isFinite(minDuration) ||
      !Number.isFinite(maxDuration) ||
      minDuration < 1 ||
      maxDuration < 1 ||
      minDuration > maxDuration
    ) {
      toast.error(
        "Please enter valid reservation durations. Minimum duration must not exceed maximum duration.",
      );
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from("business_settings")
        .update({
          business_name: String(form.get("business_name") ?? ""),
          contact_email: String(form.get("contact_email") ?? ""),
          contact_phone: String(form.get("contact_phone") ?? ""),
          address: String(form.get("address") ?? ""),
          opening_time: String(form.get("opening_time") ?? ""),
          closing_time: String(form.get("closing_time") ?? ""),
          min_duration_hours: minDuration,
          max_duration_hours: maxDuration,
          ewallet_provider: String(form.get("ewallet_provider") ?? ""),
          ewallet_account_name: String(form.get("ewallet_account_name") ?? ""),
          ewallet_account_number: String(form.get("ewallet_account_number") ?? ""),
          ewallet_instructions: String(form.get("ewallet_instructions") ?? ""),
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) throw error;

      toast.success("Settings saved successfully.");

      await queryClient.invalidateQueries({
        queryKey: ["settings"],
      });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setSaving(false);
    }
  };

  const renderFields = (fields: BusinessField[]) =>
    fields.map((field) => {
      const value = s?.[field.key as keyof typeof s];

      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{field.label}</Label>

          <Input
            id={field.key}
            name={field.key}
            type={field.type}
            defaultValue={
              field.type === "time" ? String(value ?? "").slice(0, 5) : String(value ?? "")
            }
            min={field.type === "number" ? 1 : undefined}
          />
        </div>
      );
    });

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  if (error || !s) {
    return (
      <div className="rounded-xl border p-6">
        <p className="text-sm text-destructive">Unable to load business settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your business information, operating hours, and payment details.
        </p>
      </div>

      <form onSubmit={save}>
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* LEFT SIDE */}
          <div className="space-y-6">
            {/* BUSINESS INFORMATION */}
            <section className="rounded-xl border bg-card p-5">
              <div className="mb-5">
                <h2 className="text-base font-semibold">Business Information</h2>
                <p className="text-sm text-muted-foreground">
                  Update your karaoke business details.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {renderFields(businessFields)}
              </div>
            </section>

            {/* OPERATING HOURS */}
            <section className="rounded-xl border bg-card p-5">
              <div className="mb-5">
                <h2 className="text-base font-semibold">Operating Hours</h2>
                <p className="text-sm text-muted-foreground">
                  Set your business hours and reservation duration limits.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {renderFields(operatingFields)}
              </div>
            </section>
          </div>

          {/* RIGHT SIDE */}
          <div className="w-full space-y-6 lg:max-w-[380px]">
            {/* PAYMENT SETTINGS */}
            <section className="rounded-xl border bg-card p-5">
              <div className="mb-5">
                <h2 className="text-base font-semibold">Payment Settings</h2>
                <p className="text-sm text-muted-foreground">
                  Manage your e-wallet payment details.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ewallet_provider">E-wallet Provider</Label>
                  <Input
                    id="ewallet_provider"
                    name="ewallet_provider"
                    placeholder="e.g. GCash, Maya"
                    defaultValue={s.ewallet_provider ?? ""}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ewallet_account_name">Account Name</Label>
                  <Input
                    id="ewallet_account_name"
                    name="ewallet_account_name"
                    placeholder="Enter account name"
                    defaultValue={s.ewallet_account_name ?? ""}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ewallet_account_number">Account Number</Label>
                  <Input
                    id="ewallet_account_number"
                    name="ewallet_account_number"
                    placeholder="Enter account number"
                    defaultValue={s.ewallet_account_number ?? ""}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ewallet_instructions">Payment Instructions</Label>
                  <Textarea
                    id="ewallet_instructions"
                    name="ewallet_instructions"
                    placeholder="Enter payment instructions for customers..."
                    defaultValue={s.ewallet_instructions ?? ""}
                    rows={4}
                    className="resize-none"
                  />
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* SAVE BUTTON */}
        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
