import { createFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/afterglow";
import { useRedirectAdmin } from "@/components/SiteChrome";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — SONARA" },
      {
        name: "description",
        content: "Sign in or create an SONARA account to book karaoke rooms.",
      },
      { property: "og:title", content: "Sign in — SONARA" },
      { property: "og:description", content: "Sign in or create an SONARA account." },
    ],
  }),
  component: Login,
});

type Mode = "signin" | "signup" | "forgot";

function Login() {
  useRedirectAdmin();
  const [mode, setMode] = useState<Mode>("signin");
  const hash = useLocation({ select: (l) => l.hash });
  useEffect(() => {
    setMode(hash === "signup" ? "signup" : "signin");
  }, [hash]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        let admin = false;
        if (user) {
          const { data: role } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("role", "admin")
            .maybeSingle();
          admin = !!role;
        }
        toast.success("Welcome back!");
        navigate({ to: admin ? "/admin" : "/" });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: `${name.trim()} ${lastName.trim()}`.trim(), phone },
          },
        });
        if (error) throw error;
        setSent("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <div className="rounded-2xl border border-border bg-card p-8 glow-primary">
        <h1 className="font-display text-3xl font-bold">
          {mode === "signin"
            ? "Welcome back"
            : mode === "signup"
              ? "Create account"
              : "Reset password"}
        </h1>
        {sent ? (
          <div className="mt-6">
            <p className="text-muted-foreground">{sent}</p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => {
                setSent(null);
                setMode("signin");
              }}
            >
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="first">First name</Label>
                    <Input id="first" required maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="last">Last name</Label>
                    <Input id="last" required maxLength={50} value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    maxLength={20}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {mode !== "forgot" && (
              <div>
                <Label htmlFor="pw">Password</Label>
                <Input
                  id="pw"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            <Button type="submit" variant="glow" className="w-full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
            </Button>
          </form>
        )}
        {!sent && (
          <div className="mt-6 flex flex-col gap-2 text-sm text-muted-foreground">
            {mode === "signin" && (
              <>
                <button
                  className="text-left hover:text-foreground"
                  onClick={() => setMode("forgot")}
                >
                  Forgot password?
                </button>
                <p>
                  New here?{" "}
                  <button className="text-primary" onClick={() => setMode("signup")}>
                    Create an account
                  </button>
                </p>
              </>
            )}
            {mode !== "signin" && (
              <button className="text-left text-primary" onClick={() => setMode("signin")}>
                Back to sign in
              </button>
            )}
          </div>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        By continuing you agree to our{" "}
        <Link to="/policies" className="underline">
          policies
        </Link>
        .
      </p>
    </div>
  );
}
