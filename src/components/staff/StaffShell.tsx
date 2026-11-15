import type { ReactNode } from "react";

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { CalendarCheck, CalendarClock, ChefHat, LayoutDashboard, LogOut, Mic2 } from "lucide-react";

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

export type StaffSection = "dashboard" | "reservations" | "schedule" | "sessions" | "orders";

type Item = {
  key: StaffSection;
  title: string;
  icon: typeof CalendarCheck;
};

const NAV: {
  label: string;
  items: Item[];
}[] = [
  {
    label: "OVERVIEW",
    items: [
      {
        key: "dashboard",
        title: "Dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "RESERVATIONS & ROOMS",
    items: [
      {
        key: "reservations",
        title: "Reservations",
        icon: CalendarCheck,
      },
      {
        key: "schedule",
        title: "Room Schedule",
        icon: CalendarClock,
      },
      {
        key: "sessions",
        title: "Room Sessions",
        icon: Mic2,
      },
    ],
  },
  {
    label: "FOOD & BEVERAGES",
    items: [
      {
        key: "orders",
        title: "Food Orders",
        icon: ChefHat,
      },
    ],
  },
];

export const STAFF_SECTION_TITLES: Record<StaffSection, string> = {
  dashboard: "Dashboard",
  reservations: "Reservations",
  schedule: "Room Schedule",
  sessions: "Room Sessions",
  orders: "Food Orders",
};

type StaffShellProps = {
  section: StaffSection;
  onSectionChange: (section: StaffSection) => void;
  children: ReactNode;
  title?: string;
};

export function StaffShell({ section, onSectionChange, children, title }: StaffShellProps) {
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
                <p className="text-[10px] uppercase tracking-widest text-accent">Staff</p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            {NAV.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>

                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton
                          isActive={section === item.key}
                          tooltip={item.title}
                          onClick={() => onSectionChange(item.key)}
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
              {title ?? STAFF_SECTION_TITLES[section]}
            </h1>

            <StaffHeaderTools />
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
            Are you sure you want to log out of your staff account?
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

function StaffProfile() {
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
          <p className="truncate">{profile?.full_name || "Staff"}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => navigate({ to: "/profile" })}>
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

export function StaffHeaderTools() {
  const { user } = useAuth();

  return (
    <div className="ml-auto flex items-center gap-2">
      {user && <NotificationBell userId={user.id} />}
      <StaffProfile />
    </div>
  );
}
