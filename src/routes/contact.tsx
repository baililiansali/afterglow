import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, MapPin, Phone } from "lucide-react";
import { PageHeader, useRedirectAdmin } from "@/components/SiteChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/afterglow";
import { settingsQuery } from "@/lib/queries";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — SONARA" },
      {
        name: "description",
        content: "Questions about bookings or events? Get in touch with SONARA.",
      },
      { property: "og:title", content: "Contact — SONARA" },
      { property: "og:description", content: "Questions about bookings or events? Get in touch." },
    ],
  }),
  component: Contact,
});

function Contact() {
  useRedirectAdmin();
  const { data: s } = useQuery(settingsQuery);
  const [f, setF] = useState({ name: "", email: "", subject: "", message: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("contact_messages").insert(f);
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    toast.success("Message sent — we'll reply soon.");
    setF({ name: "", email: "", subject: "", message: "" });
  };
  return (
    <div>
      <PageHeader eyebrow="Contact" title="Say hello" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-[1fr_1.3fr]">
        <div className="space-y-4 text-sm">
          <p className="flex items-center gap-3">
            <MapPin className="h-4 w-4 text-primary" />
            {s?.address}
          </p>
          <p className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-primary" />
            {s?.contact_phone}
          </p>
          <p className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-primary" />
            {s?.contact_email}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="n">Name</Label>
              <Input
                id="n"
                required
                maxLength={100}
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="e">Email</Label>
              <Input
                id="e"
                type="email"
                required
                maxLength={255}
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="s">Subject</Label>
            <Input
              id="s"
              required
              maxLength={150}
              value={f.subject}
              onChange={(e) => setF({ ...f, subject: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="m">Message</Label>
            <Textarea
              id="m"
              required
              maxLength={2000}
              rows={5}
              value={f.message}
              onChange={(e) => setF({ ...f, message: e.target.value })}
            />
          </div>
          <Button type="submit" variant="glow" disabled={busy}>
            {busy ? "Sending…" : "Send message"}
          </Button>
        </form>
      </div>
    </div>
  );
}
