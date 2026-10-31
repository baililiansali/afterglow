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

let suppressAdminRedirect = false;

export function useRedirectAdmin() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading || !user || !isAdmin || suppressAdminRedirect) return;
    navigate({ to: "/admin", replace: true });
  }, [user, isAdmin, loading, navigate]);
}

export function Header() {
  const { user, isAdmin } = useAuth();
  const { count } = useCart();
  const { data: profile } = useMyProfile(user?.id);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const onAdminPage = useRouterState({
    select: (s) => s.location.pathname.startsWith("/admin") || s.location.pathname === "/profile",
  });

  const signOut = async () => {
    suppressAdminRedirect = true;
    await supabase.auth.signOut();
    navigate({ to: "/" });
    setTimeout(() => {
      suppressAdminRedirect = false;
    }, 500);
  };

  // The admin dashboard renders its own sidebar + top bar.
  if (isAdmin && onAdminPage) return null;

  if (isAdmin) {
    return (
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link
            to="/admin"
            className="flex items-center gap-2 font-display text-lg font-bold tracking-[0.2em]"
          >
            <Mic2 className="h-5 w-5 text-primary" /> AFTERGLOW
            <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent">
              Admin
            </span>
          </Link>
          <AdminHeaderTools />
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link
          to="/"
          className="flex items-center gap-2 font-display text-lg font-bold tracking-[0.2em]"
        >
          <Mic2 className="h-5 w-5 text-primary" /> AFTERGLOW
        </Link>
        <nav className="hidden flex-1 items-center gap-5 text-sm text-muted-foreground md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user && !isAdmin && <NotificationBell userId={user.id} />}
          {user ? (
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
                  <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate({ to: "/profile" })}>
                  <User className="mr-2 h-4 w-4" /> My Account
                </DropdownMenuItem>

                {/* Fixed: Use onSelect + navigate instead of <Link> to prevent click swallowing */}
                <DropdownMenuItem onSelect={() => navigate({ to: "/my-bookings" })}>
                  <CalendarDays className="mr-2 h-4 w-4" /> My Bookings
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
          {links.map((l) => (
            <Link key={l.to} to={l.to}>
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  const { isAdmin } = useAuth();
  const onAdminPage = useRouterState({
    select: (s) => s.location.pathname.startsWith("/admin") || s.location.pathname === "/profile",
  });
  if (isAdmin && onAdminPage) return null;
  return (
    <footer className="mt-24 border-t border-border/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm text-muted-foreground md:grid-cols-3">
        <div>
          <p className="font-display text-base font-bold tracking-[0.2em] text-foreground">
            AFTERGLOW
          </p>
          <p className="mt-2">
            Karaoke reimagined. Private rooms, great sound, food delivered to your door.
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
  if (loading)
    return <div className="mx-auto max-w-6xl px-4 py-20 text-muted-foreground">Loading...</div>;
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
