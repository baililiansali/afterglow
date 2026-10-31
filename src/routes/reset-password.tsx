import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/afterglow";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Afterglow" },
      { name: "description", content: "Choose a new password for your Afterglow account." },
      { property: "og:title", content: "Set a new password — Afterglow" },
      { property: "og:description", content: "Choose a new password for your Afterglow account." },
    ],
  }),
  component: Reset,
});

function Reset() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    toast.success("Password updated");
    navigate({ to: "/" });
  };
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-8">
        <h1 className="font-display text-3xl font-bold">New password</h1>
        <div>
          <Label htmlFor="pw">Password</Label>
          <Input
            id="pw"
            type="password"
            minLength={6}
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </div>
        <Button type="submit" variant="glow" className="w-full" disabled={busy}>
          Update password
        </Button>
      </form>
    </div>
  );
}
