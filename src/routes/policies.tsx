import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, useRedirectAdmin } from "@/components/SiteChrome";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/policies")({
  head: () => ({
    meta: [
      { title: "Policies & FAQ — SONARA" },
      {
        name: "description",
        content: "Booking, cancellation, payment and house rules at SONARA.",
      },
      { property: "og:title", content: "Policies & FAQ — SONARA" },
      { property: "og:description", content: "Booking, cancellation, payment and house rules." },
    ],
  }),
  component: Policies,
});

const faqs: [string, string][] = [
  [
    "How do bookings work?",
    "Pick a room, date and time. Your booking starts as Pending and our team approves it — you'll see the status in My Bookings.",
  ],
  ["How long can I book?", "Between 1 and 6 hours, within opening hours (2:00 PM – 11:00 PM)."],
  [
    "How do I pay?",
    "Cash at the counter. Your room total is fixed at the hourly rate when you book.",
  ],
  [
    "Can I cancel?",
    "Yes — while a booking is Pending or Approved, from My Bookings. Pending food pre-orders are cancelled with it.",
  ],
  [
    "Can I order food?",
    "Pre-order with your booking, or order from your room once you're checked in.",
  ],
  [
    "How many guests can I bring?",
    "Up to the room's capacity: Small 4, Medium 8, Large 12, VIP 15.",
  ],
  [
    "House rules",
    "No outside food or drinks. Please treat equipment with care; damages are charged at cost.",
  ],
  [
    "Privacy",
    "We only use your name, email and phone to manage your bookings. We never sell your data.",
  ],
];

function Policies() {
  useRedirectAdmin();
  return (
    <div>
      <PageHeader eyebrow="Policies" title="Policies & FAQ" />
      <div className="mx-auto max-w-3xl px-4">
        <Accordion
          type="single"
          collapsible
          className="rounded-xl border border-border bg-card px-5"
        >
          {faqs.map(([q, a]) => (
            <AccordionItem key={q} value={q}>
              <AccordionTrigger>{q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
