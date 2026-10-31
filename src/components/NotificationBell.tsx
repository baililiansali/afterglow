import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";

type Notif = { id: string; title: string; body: string; at: string };

const RES_TEXT: Record<string, string> = {
  pending: "is waiting for approval",
  approved: "was approved",
  rejected: "was rejected",
  cancelled: "was cancelled",
  checked_in: "is checked in — enjoy!",
  completed: "is completed. Thanks for visiting!",
};
const FOOD_TEXT: Record<string, string> = {
  pending: "was received",
  confirmed: "was confirmed",
  preparing: "is being prepared",
  ready: "is ready",
  served: "was served",
  cancelled: "was cancelled",
};

export function NotificationBell({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const storageKey = `ag-notif-seen-${userId}`;
  const idsKey = `ag-notif-read-${userId}`;
  const [seenAt, setSeenAt] = useState<string>("");
  const [readIds, setReadIds] = useState<string[]>([]);

  useEffect(() => {
    setSeenAt(localStorage.getItem(storageKey) ?? "");
    try {
      setReadIds(JSON.parse(localStorage.getItem(idsKey) ?? "[]"));
    } catch {
      setReadIds([]);
    }
  }, [storageKey, idsKey]);

  const markOne = (id: string) => {
    if (readIds.includes(id)) return;
    const next = [...readIds, id].slice(-200);
    localStorage.setItem(idsKey, JSON.stringify(next));
    setReadIds(next);
  };

  const { data = [] } = useQuery({
    queryKey: ["my-bookings", "notif", userId],
    queryFn: async (): Promise<Notif[]> => {
      const [res, food] = await Promise.all([
        supabase
          .from("reservations")
          .select("id, reference_code, status, updated_at, created_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase
          .from("food_orders")
          .select("id, reference_code, status, served_at, submitted_at, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      const list: Notif[] = [];
      for (const r of res.data ?? [])
        list.push({
          id: `r-${r.id}-${r.status}`,
          title: `Booking ${r.reference_code}`,
          body: `Your booking ${RES_TEXT[r.status] ?? r.status}`,
          at: r.updated_at ?? r.created_at,
        });
      for (const f of food.data ?? [])
        list.push({
          id: `f-${f.id}-${f.status}`,
          title: `Food order ${f.reference_code}`,
          body: `Your order ${FOOD_TEXT[f.status] ?? f.status}`,
          at: f.served_at ?? f.submitted_at ?? f.created_at,
        });
      return list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);
    },
  });

  const isUnread = (n: Notif) =>
    !readIds.includes(n.id) && (!seenAt || new Date(n.at) > new Date(seenAt));

  const unread = useMemo(
    () => data.filter((n) => isUnread(n)).length,
    [data, seenAt, readIds],
  );

  const markRead = () => {
    const now = new Date().toISOString();
    localStorage.setItem(storageKey, now);
    setSeenAt(now);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative grid h-9 w-9 place-items-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unread > 0 && (
            <button className="text-xs font-normal text-primary hover:underline" onClick={markRead}>
              Mark all as read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {data.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              You're all caught up
            </p>
          ) : (
            data.map((n) => {
              const isNew = isUnread(n);
              return (
                <DropdownMenuItem
                  key={n.id}
                  onSelect={() => {
                    markOne(n.id);
                    navigate({ to: "/my-bookings" });
                  }}
                  className="flex items-start gap-2 py-2"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isNew ? "bg-primary" : "bg-transparent"}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {new Date(n.at).toLocaleString()}
                    </p>
                  </div>
                </DropdownMenuItem>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
