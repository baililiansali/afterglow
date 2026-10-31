import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, useRedirectAdmin } from "@/components/SiteChrome";
import { Button } from "@/components/ui/button";
import roomVip from "@/assets/room-vip.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Afterglow" },
      {
        name: "description",
        content: "Afterglow is a private karaoke lounge built for crews who love to sing.",
      },
      { property: "og:title", content: "About — Afterglow" },
      {
        property: "og:description",
        content: "A private karaoke lounge built for crews who love to sing.",
      },
    ],
  }),
  component: About,
});

function About() {
  useRedirectAdmin();
  return (
    <div>
      <PageHeader eyebrow="About" title="Made for the late-night chorus" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-2">
        <div className="space-y-4 text-muted-foreground">
          <p>
            Afterglow is a private karaoke lounge with 20 soundproofed rooms — from cozy four-seat
            booths to full VIP suites with a private bar counter.
          </p>
          <p>
            Book online, pre-order your snacks, and walk into a room that's ready for you. Once
            you're checked in, order more without leaving the mic.
          </p>
          <p>Open daily from 2:00 PM to 11:00 PM. Pay cash at the counter or via GCash.</p>
          <Button asChild variant="glow" className="mt-2">
            <Link to="/rooms">Book a room</Link>
          </Button>
        </div>
        <img
          src={roomVip}
          alt="Afterglow VIP suite"
          className="rounded-2xl object-cover"
          loading="lazy"
        />
      </div>
    </div>
  );
}
