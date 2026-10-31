import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { PageHeader, useRedirectAdmin } from "@/components/SiteChrome";
import { ROOM_IMAGES, peso } from "@/lib/afterglow";
import { roomsQuery } from "@/lib/queries";
import { ROOM_TYPE_LABELS, type RoomType } from "@/types/afterglow";
import { cn } from "@/lib/utils";

const types = ["all", "small", "medium", "large", "vip"] as const;

export const Route = createFileRoute("/rooms/")({
  validateSearch: (s: Record<string, unknown>): { type?: (typeof types)[number] | undefined } => ({
    type: (types as readonly string[]).includes(String(s["type"]))
      ? (s["type"] as (typeof types)[number])
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Karaoke Rooms — Afterglow" },
      {
        name: "description",
        content: "Browse 20 private karaoke rooms from cozy booths to VIP suites.",
      },
      { property: "og:title", content: "Karaoke Rooms — Afterglow" },
      {
        property: "og:description",
        content: "Browse 20 private karaoke rooms from cozy booths to VIP suites.",
      },
    ],
  }),
  component: Rooms,
});

function Rooms() {
  useRedirectAdmin();
  const { type = "all" } = Route.useSearch();
  const { data: rooms, isLoading, error } = useQuery(roomsQuery);
  const list = (rooms ?? []).filter((r) => r.is_active && (type === "all" || r.room_type === type));

  return (
    <div>
      <PageHeader eyebrow="Rooms" title="Find your stage">
        Every room is private, soundproofed and yours for the night.
      </PageHeader>
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <Link
              key={t}
              to="/rooms"
              search={t === "all" ? {} : { type: t }}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm",
                type === t
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "all" ? "All" : ROOM_TYPE_LABELS[t as RoomType]}
            </Link>
          ))}
        </div>
        {isLoading && <p className="py-16 text-muted-foreground">Loading rooms…</p>}
        {error && <p className="py-16 text-destructive">Couldn't load rooms.</p>}
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <Link
              key={r.id}
              to="/rooms/$roomId"
              params={{ roomId: r.id }}
              className="group overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/60"
            >
              <div className="relative">
                <img
                  src={r.image_url || ROOM_IMAGES[r.room_type]}
                  alt={r.name}
                  className="aspect-[16/10] w-full object-cover"
                  loading="lazy"
                />
                {r.maintenance_status && (
                  <span className="absolute left-3 top-3 rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">
                    Maintenance
                  </span>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Room {r.room_number} · {ROOM_TYPE_LABELS[r.room_type]}
                    </p>
                    <p className="font-display text-lg font-bold">{r.name}</p>
                  </div>
                  <p className="whitespace-nowrap text-accent">
                    {peso(r.hourly_rate)}
                    <span className="text-xs text-muted-foreground">/hr</span>
                  </p>
                </div>
                <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" /> Up to {r.capacity} guests
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
