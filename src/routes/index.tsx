import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, Mic2, UtensilsCrossed, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRedirectAdmin } from "@/components/SiteChrome";
import hero from "@/assets/hero.jpg";
import { ROOM_IMAGES, foodImage, peso } from "@/lib/afterglow";
import { menuQuery } from "@/lib/queries";
import { ROOM_TYPE_LABELS, type RoomType } from "@/types/afterglow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Afterglow — Private Karaoke Lounge" },
      {
        name: "description",
        content: "Book a private karaoke room, pre-order food and sing all night at Afterglow.",
      },
      { property: "og:title", content: "Afterglow — Private Karaoke Lounge" },
      {
        property: "og:description",
        content: "Book a private karaoke room, pre-order food and sing all night.",
      },
    ],
  }),
  component: Home,
});

const TYPES: { type: RoomType; cap: number; rate: number }[] = [
  { type: "small", cap: 4, rate: 200 },
  { type: "medium", cap: 8, rate: 350 },
  { type: "large", cap: 12, rate: 500 },
  { type: "vip", cap: 15, rate: 600 },
];

function Home() {
  useRedirectAdmin();

  const { data } = useQuery(menuQuery);

  // Only show active, available, featured items from active categories.
  const activeCategoryIds = new Set(
    (data?.categories ?? []).filter((c) => c.is_active).map((c) => c.id),
  );

  const featured =
    data?.items.filter(
      (i) => i.is_active && i.is_featured && i.is_available && activeCategoryIds.has(i.category_id),
    ) ?? [];

  return (
    <div>
      <section className="relative overflow-hidden">
        <img
          src={hero}
          alt="Neon-lit private karaoke room"
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />

        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/70 to-background" />

        <div className="relative mx-auto max-w-6xl px-4 pb-28 pt-28 md:pt-40">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">
            Private karaoke lounge
          </p>

          <h1 className="mt-4 max-w-3xl font-display text-5xl font-bold leading-[1.05] md:text-7xl">
            Your room. Your crew. <span className="text-gradient-glow">Your encore.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Book a private room in minutes, pre-order food, and we'll have everything ready when you
            walk in.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="glow" size="lg">
              <Link to="/rooms">Book a room</Link>
            </Button>

            <Button asChild variant="outline" size="lg">
              <Link to="/menu">See the menu</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 md:grid-cols-4">
        {[
          { icon: Mic2, t: "Pick a room", d: "4 room sizes, 2 to 15 guests." },
          { icon: CalendarCheck, t: "Choose a time", d: "Live availability, no double-booking." },
          { icon: UtensilsCrossed, t: "Pre-order food", d: "Ready when you arrive." },
          { icon: Clock, t: "Sing", d: "Order more from your room anytime." },
        ].map((s, i) => (
          <div key={s.t} className="rounded-xl border border-border bg-card p-5">
            <s.icon className="h-5 w-5 text-primary" />
            <p className="mt-3 text-xs text-muted-foreground">Step {i + 1}</p>
            <p className="font-display font-bold">{s.t}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-20">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-3xl font-bold">Rooms for every crew</h2>

          <Link to="/rooms" className="text-sm text-primary">
            All rooms →
          </Link>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TYPES.map((r) => (
            <Link
              key={r.type}
              to="/rooms"
              search={{ type: r.type }}
              className="group overflow-hidden rounded-xl border border-border bg-card"
            >
              <img
                src={ROOM_IMAGES[r.type]}
                alt={`${ROOM_TYPE_LABELS[r.type]} room`}
                className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />

              <div className="p-4">
                <p className="font-display text-lg font-bold">{ROOM_TYPE_LABELS[r.type]}</p>

                <p className="text-sm text-muted-foreground">
                  Up to {r.cap} guests · <span className="text-accent">{peso(r.rate)}/hr</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-20">
          <h2 className="font-display text-3xl font-bold">Crowd favorites</h2>

          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {featured.map((f) => (
              <Link
                key={f.id}
                to="/menu"
                hash={`item-${f.id}`}
                className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
              >
                <img
                  src={f.image_url || foodImage(f.image_key)}
                  alt={f.name}
                  className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />

                <div className="flex items-center justify-between p-4">
                  <p className="font-medium group-hover:text-primary">{f.name}</p>

                  <p className="text-accent">{peso(f.price)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
