import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  CalendarCheck,
  CalendarClock,
  CreditCard,
  DoorOpen,
  LayoutDashboard,
  LogOut,
  Mail,
  Mic2,
  Settings,
  User,
  Users,
  UtensilsCrossed,
  BarChart3,
  ChefHat,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
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
import { initials, useMyProfile } from "@/lib/avatar";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/afterglow";
import type { ResRow, OrderRow } from "./shared";

export type SectionKey =
  | "dashboard"
  | "bookings"
  | "sessions"
  | "schedule"
  | "orders"
  | "payments"
  | "rooms"
  | "menu"
  | "users"
  | "messages"
  | "reports"
  | "settings";

type Item = { key: SectionKey; title: string; icon: typeof Bell };

const NAV: { label: string; items: Item[] }[] = [
  {
    label: "OVERVIEW",
    items: [{ key: "dashboard", title: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "RESERVATIONS & ROOMS",
    items: [
      { key: "bookings", title: "Reservations", icon: CalendarCheck },
      { key: "schedule", title: "Room Schedule", icon: CalendarClock },
      { key: "sessions", title: "Room Sessions", icon: Mic2 },
      { key: "rooms", title: "Rooms", icon: DoorOpen },
    ],
  },
  {
    label: "FOOD & BEVERAGE",
    items: [
      { key: "orders", title: "Food Orders", icon: ChefHat },
      { key: "menu", title: "Food & Beverages", icon: UtensilsCrossed },
    ],
  },
  {
    label: "CUSTOMERS & BUSINESS",
    items: [
      { key: "users", title: "Customers", icon: Users },
      { key: "payments", title: "Transactions", icon: CreditCard },
      { key: "reports", title: "Reports & Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { key: "messages", title: "Messages", icon: Mail },
      { key: "settings", title: "Settings", icon: Settings },
    ],
  },
];

export const SECTION_TITLES: Record<SectionKey, string> = {
  dashboard: "Dashboard",
  bookings: "Reservations",
  sessions: "Room Sessions",
  schedule: "Room Schedule",
  orders: "Food Orders",
  payments: "Transactions",
  rooms: "Rooms",
  menu: "Food & Beverages",
  users: "Customers",
  messages: "Messages",
  reports: "Reports & Analytics",
  settings: "Settings",
};

export function AdminShell({
  section,
  onSection,
  res,
  orders,
  children,
  title,
}: {
  title?: string;
  section: SectionKey | null;
  onSection: (s: SectionKey) => void;
  res: ResRow[];
  orders: OrderRow[];
  children: React.ReactNode;
}) {
  const badges: Partial<Record<SectionKey, number>> = {
    bookings: res.filter((r) => r.status === "pending").length,
    orders: orders.filter((o) => !["served", "cancelled"].includes(o.status)).length,
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Mic2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="font-display text-sm font-bold tracking-[0.2em]">SONARA</p>
                <p className="text-[10px] uppercase tracking-widest text-accent">Admin</p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            {NAV.map((g) => (
              <SidebarGroup key={g.label}>
                <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {g.items.map((it) => (
                      <SidebarMenuItem key={it.key}>
                        <SidebarMenuButton
                          isActive={section === it.key}
                          tooltip={it.title}
                          onClick={() => onSection(it.key)}
                          className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                        >
                          <it.icon />
                          <span>{it.title}</span>
                        </SidebarMenuButton>

                        {!!badges[it.key] && <SidebarMenuBadge>{badges[it.key]}</SidebarMenuBadge>}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SignOutItem />
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
            <SidebarTrigger />
            <h1 className="font-display text-lg font-bold">
              {title ?? (section ? SECTION_TITLES[section] : "")}
            </h1>

            <div className="ml-auto flex items-center gap-2">
              <AdminBell res={res} orders={orders} onSection={onSection} />
              <AdminProfile />
            </div>
          </header>

          <main className="flex-1 px-4 py-6 md:px-8">{children}</main>

          <LogoutConfirm />
        </div>
      </div>
    </SidebarProvider>
  );
}

function useSignOut() {
  return () => window.dispatchEvent(new Event("afterglow:logout"));
}

function LogoutConfirm() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const h = () => setOpen(true);

    window.addEventListener("afterglow:logout", h);

    return () => window.removeEventListener("afterglow:logout", h);
  }, []);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Logout Confirmation</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to log out of your admin account?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>

          <AlertDialogAction
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/login" });
            }}
          >
            Logout
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SignOutItem() {
  const signOut = useSignOut();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip="Logout" onClick={signOut}>
        <LogOut />
        <span>Logout</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AdminProfile() {
  const { user } = useAuth();
  const { data: profile } = useMyProfile(user?.id);
  const navigate = useNavigate();
  const signOut = useSignOut();

  if (!user) return null;

  return (
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
          <p className="truncate">{profile?.full_name || "Admin"}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => navigate({ to: "/profile" })}>
          <User className="mr-2 h-4 w-4" />
          My Account
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Notifications for pending reservation requests and food orders awaiting action. */
function AdminBell({
  res,
  orders,
  onSection,
}: {
  res: ResRow[];
  orders: OrderRow[];
  onSection: (s: SectionKey) => void;
}) {
  const { user } = useAuth();

  const idsKey = `ag-admin-notif-read-${user?.id ?? "anon"}`;

  const [readIds, setReadIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      setReadIds(JSON.parse(localStorage.getItem(idsKey) ?? "[]"));
    } catch {
      setReadIds([]);
    }
  }, [idsKey]);

  const save = (next: string[]) => {
    const trimmed = next.slice(-400);
    localStorage.setItem(idsKey, JSON.stringify(trimmed));
    setReadIds(trimmed);
  };

  const items = [
    ...res
      .filter((r) => r.status === "pending")
      .map((r) => ({
        id: `r-${r.id}-${r.status}`,
        title: `New reservation ${r.reference_code}`,
        sub: `${r.rooms?.name ?? "Room"} · ${fmtDate(r.booking_date)}`,
        at: r.created_at,
        go: "bookings" as SectionKey,
      })),

    ...orders
      .filter((o) => !["served", "cancelled"].includes(o.status))
      .map((o) => ({
        id: `o-${o.id}-${o.status}`,
        title: `Food order ${o.reference_code}`,
        sub: `Status: ${o.status.replace(/_/g, " ")}`,
        at: o.reservations?.booking_date ?? "",
        go: "orders" as SectionKey,
      })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const unread = items.filter((n) => !readIds.includes(n.id)).length;

  const markOne = (id: string) => {
    if (!readIds.includes(id)) {
      save([...readIds, id]);
    }
  };

  const markAll = () => save([...new Set([...readIds, ...items.map((n) => n.id)])]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative rounded-full p-2 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />

        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>

          {unread > 0 && (
            <button className="text-xs font-normal text-primary hover:underline" onClick={markAll}>
              Mark all as read
            </button>
          )}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            You're all caught up
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {items.slice(0, 20).map((n) => {
              const isNew = !readIds.includes(n.id);

              return (
                <DropdownMenuItem
                  key={n.id}
                  onSelect={() => {
                    markOne(n.id);
                    onSection(n.go);
                  }}
                  className="flex items-start gap-2 py-2"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      isNew ? "bg-primary" : "bg-transparent"
                    }`}
                  />

                  <div className="min-w-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.sub}</p>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function useAdminRes(): ResRow[] {
  const { data = [] } = useQuery({
    queryKey: ["admin-res"],
    queryFn: async () => {
      await supabase.rpc("expire_no_show_reservations");

      const { data, error } = await supabase
        .from("reservations")
        .select("*, rooms(name, room_number)")
        .order("booking_date", { ascending: false });

      if (error) throw error;

      return data;
    },
  });

  return data as ResRow[];
}

export function useAdminOrders(): OrderRow[] {
  const { data = [] } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("food_orders")
        .select(
          `
          *,
          food_order_items(*),
          reservations(
            reference_code,
            booking_date,
            rooms(name, room_number)
          )
        `,
        )
        .order("submitted_at", { ascending: false });

      if (error) throw error;

      const userIds = [...new Set(orders.map((order) => order.user_id))];

      let profiles: {
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
      }[] = [];

      if (userIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone")
          .in("id", userIds);

        if (profileError) throw profileError;

        profiles = profileData ?? [];
      }

      const profileMap = Object.fromEntries(
        profiles.map((profile) => [
          profile.id,
          {
            full_name: profile.full_name,
            email: profile.email,
            phone: profile.phone,
          },
        ]),
      );

      return orders.map((order) => ({
        ...order,
        profiles: profileMap[order.user_id] ?? null,
      })) as OrderRow[];
    },
  });

  return data;
}

export function AdminHeaderTools() {
  const res = useAdminRes();
  const orders = useAdminOrders();
  const navigate = useNavigate();

  return (
    <div className="ml-auto flex items-center gap-2">
      <AdminBell
        res={res}
        orders={orders}
        onSection={(s) => navigate({ to: "/admin", search: { section: s } })}
      />
      <AdminProfile />
    </div>
  );
}
