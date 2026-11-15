import type { ReactNode } from "react";

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import {
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  DoorOpen,
  LayoutDashboard,
  LogOut,
  Mail,
  Mic2,
  ReceiptText,
  Settings,
  User,
  UserCog,
  Users,
  UtensilsCrossed,
} from "lucide-react";

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

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
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

import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/lib/auth";
import { initials, useMyProfile } from "@/lib/avatar";
import { supabase } from "@/integrations/supabase/client";
import type { ResRow, OrderRow } from "./shared";

export type SectionKey =
  | "dashboard"
  | "bookings"
  | "sessions"
  | "schedule"
  | "orders"
  | "rooms"
  | "menu"
  | "users"
  | "staff"
  | "payments"
  | "expenses"
  | "reports"
  | "messages"
  | "settings";

type Item = {
  key: SectionKey;
  title: string;
  icon: typeof Bell;
};

type NavGroup = {
  label: string;
  items: Item[];
};

// Admin navigation: financial and business management only.
// Reservation operations are handled through the Staff portal.
const ADMIN_NAV: NavGroup[] = [
  {
    label: "OVERVIEW",
    items: [{ key: "dashboard", title: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "SERVICES",
    items: [
      { key: "rooms", title: "Rooms", icon: DoorOpen },
      { key: "menu", title: "Food & Beverages", icon: UtensilsCrossed },
    ],
  },
  {
    label: "USERS",
    items: [
      { key: "users", title: "Customers", icon: Users },
      { key: "staff", title: "Staff", icon: UserCog },
    ],
  },
  {
    label: "FINANCE",
    items: [
      { key: "payments", title: "Transactions", icon: CreditCard },
      { key: "expenses", title: "Expenses", icon: ReceiptText },
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

// Staff handles all reservation operations.
const STAFF_NAV: NavGroup[] = [
  {
    label: "RESERVATIONS",
    items: [
      { key: "bookings", title: "Bookings", icon: CalendarCheck },
      { key: "sessions", title: "Room Sessions", icon: ClipboardList },
      { key: "schedule", title: "Room Schedule", icon: CalendarDays },
    ],
  },
  {
    label: "ORDERS",
    items: [{ key: "orders", title: "Food Orders", icon: UtensilsCrossed }],
  },
];

export const SECTION_TITLES: Record<SectionKey, string> = {
  dashboard: "Dashboard",
  bookings: "Bookings",
  sessions: "Room Sessions",
  schedule: "Room Schedule",
  orders: "Food Orders",
  rooms: "Rooms",
  menu: "Food & Beverages",
  users: "Customers",
  staff: "Staff",
  payments: "Transactions",
  expenses: "Expenses",
  reports: "Reports & Analytics",
  messages: "Messages",
  settings: "Settings",
};

type AdminShellProps = {
  section: SectionKey | null;
  onSection: (section: SectionKey) => void;
  res: ResRow[];
  orders: OrderRow[];
  children: ReactNode;
  title?: string;
  mode?: "admin" | "staff";
};

export function AdminShell({
  section,
  onSection,
  children,
  title,
  mode = "admin",
}: AdminShellProps) {
  const navigation = mode === "staff" ? STAFF_NAV : ADMIN_NAV;
  const portalLabel = mode === "staff" ? "Staff" : "Admin";

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
                <p className="text-[10px] uppercase tracking-widest text-accent">{portalLabel}</p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            {navigation.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>

                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton
                          isActive={section === item.key}
                          tooltip={item.title}
                          onClick={() => onSection(item.key)}
                          className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                        >
                          <item.icon />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
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

            <AdminHeaderTools />
          </header>

          <main className="flex-1 px-4 py-6 md:px-8">{children}</main>

          <LogoutConfirm />
        </div>
      </div>
    </SidebarProvider>
  );
}

function useSignOut() {
  return () => {
    window.dispatchEvent(new Event("afterglow:logout"));
  };
}

function LogoutConfirm() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleLogout = () => setOpen(true);

    window.addEventListener("afterglow:logout", handleLogout);

    return () => {
      window.removeEventListener("afterglow:logout", handleLogout);
    };
  }, []);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Logout Confirmation</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to log out of your SONARA account?
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
          <p className="truncate">{profile?.full_name || "Account"}</p>
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

export function AdminHeaderTools() {
  const { user } = useAuth();

  return (
    <div className="ml-auto flex items-center gap-2">
      {user && <NotificationBell userId={user.id} />}
      <AdminProfile />
    </div>
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
