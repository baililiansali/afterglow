import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Mic2, ShoppingBag, Menu as MenuIcon, X, User, CalendarDays, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { initials, useMyProfile } from "@/lib/avatar";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";
import { AdminHeaderTools } from "@/components/admin/AdminShell";

const links = [
  { to: "/rooms", label: "Rooms" },
  { to: "/menu", label: "Food & Drinks" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

type UserRole = "admin" | "staff" | "customer";

let suppressRoleRedirect = false;

function useUserRole() {
  const { user, loading } = useAuth();
  const [role, setRole] = useState<UserRole>("customer");
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadRole() {
      if (loading) return;

      if (!user) {
        if (active) {
          setRole("customer");
          setRoleLoading(false);
        }
        return;
      }

      setRoleLoading(true);

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "staff"]);

      if (!active) return;

      if (error) {
        console.error("Unable to load account role:", error);
        setRole("customer");
      } else if (data?.some((item) => item.role === "admin")) {
        setRole("admin");
      } else if (data?.some((item) => item.role === "staff")) {
        setRole("staff");
      } else {
        setRole("customer");
      }

      setRoleLoading(false);
    }

    void loadRole();

    return () => {
      active = false;
    };
  }, [user, loading]);

  return { role, roleLoading };
}

export function useRedirectAdmin() {
  const { user, loading } = useAuth();
  const { role, roleLoading } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || roleLoading || !user || suppressRoleRedirect) {
      return;
    }

    if (role === "admin") {
      navigate({ to: "/admin", replace: true });
    } else if (role === "staff") {
      navigate({ to: "/staff", replace: true });
    }
  }, [user, loading, role, roleLoading, navigate]);
}

export function Header() {
  const { user } = useAuth();
  const { role, roleLoading } = useUserRole();

  const { count } = useCart();
  const { data: profile } = useMyProfile(user?.id);

  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const onDashboardPage = useRouterState({
    select: (s) =>
      s.location.pathname.startsWith("/admin") ||
      s.location.pathname.startsWith("/staff") ||
      s.location.pathname === "/profile",
  });

  const signOut = async () => {
    suppressRoleRedirect = true;

    try {
      await supabase.auth.signOut();
      navigate({ to: "/" });
    } finally {
      window.setTimeout(() => {
        suppressRoleRedirect = false;
      }, 500);
    }
  };

  // Admin and staff dashboards render their own navigation.
  if (onDashboardPage || roleLoading) return null;

  // Keep staff away from customer-facing navigation.
  if (user && (role === "admin" || role === "staff")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link
          to="/"
          className="flex items-center gap-2 font-display text-lg font-bold tracking-[0.2em]"
        >
          <Mic2 className="h-5 w-5 text-primary" />
          SONARA
        </Link>

        <nav className="hidden flex-1 items-center gap-5 text-sm text-muted-foreground md:flex">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user && <NotificationBell userId={user.id} />}

          {user ? (
            <>
              {/* <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => navigate({ to: "/cart" })}
                aria-label="Shopping cart"
              >
                <ShoppingBag className="h-5 w-5" />
                {count > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {count}
                  </span>
                )}
              </Button> */}

              <DropdownMenu>
                <DropdownMenuTrigger
                  className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Profile menu"
                >
                  <Avatar className="h-9 w-9 border border-primary/50">
                    {profile?.photo && <AvatarImage src={profile.photo} alt="" />}
                    <AvatarFallback className="bg-secondary text-xs font-semibold">
                      {initials(profile?.full_name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <p className="truncate">{profile?.full_name || "Guest"}</p>
                    <p className="truncate text-xs font-normal text-muted-foreground">
                      {user.email}
                    </p>
                  </DropdownMenuLabel>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onSelect={() => navigate({ to: "/profile" })}>
                    <User className="mr-2 h-4 w-4" />
                    My Account
                  </DropdownMenuItem>

                  <DropdownMenuItem onSelect={() => navigate({ to: "/my-bookings" })}>
                    <CalendarDays className="mr-2 h-4 w-4" />
                    My Transactions
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Log in</Link>
              </Button>

              <Button asChild variant="glow" size="sm">
                <Link to="/login" hash="signup">
                  Sign up
                </Link>
              </Button>
            </>
          )}

          <button className="p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          className="flex flex-col gap-3 border-t border-border px-4 py-4 text-sm md:hidden"
          onClick={() => setOpen(false)}
        >
          {links.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  const { isAdmin } = useAuth();

  const { role } = useUserRole();

  const onDashboardPage = useRouterState({
    select: (s) =>
      s.location.pathname.startsWith("/admin") ||
      s.location.pathname.startsWith("/staff") ||
      s.location.pathname === "/profile",
  });

  if (onDashboardPage || isAdmin || role === "admin" || role === "staff") {
    return null;
  }

  return (
    <footer className="mt-24 border-t border-border/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm text-muted-foreground md:grid-cols-3">
        <div>
          <p className="font-display text-base font-bold tracking-[0.2em] text-foreground">
            SONARA
          </p>
          <p className="mt-2">
            Your own private stage. Sing your heart out, enjoy great food, and make every night
            unforgettable.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Link to="/rooms">Rooms</Link>
          <Link to="/menu">Food & Drinks</Link>
          <Link to="/policies">Policies & FAQ</Link>
        </div>

        <div>
          <p>Open daily · 2:00 PM - 11:00 PM</p>
          <p className="mt-1">Pay cash at the counter or via GCash.</p>
        </div>
      </div>
    </footer>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-14">
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">{eyebrow}</p>
      )}

      <h1 className="mt-2 font-display text-4xl font-bold md:text-5xl">{title}</h1>

      {children && <div className="mt-3 max-w-2xl text-muted-foreground">{children}</div>}
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-20 text-muted-foreground">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h2 className="font-display text-2xl font-bold">Sign in to continue</h2>

        <p className="mt-2 text-muted-foreground">You need an account for bookings and orders.</p>

        <Button asChild variant="glow" className="mt-6">
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
