import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, Minus, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRedirectAdmin } from "@/components/SiteChrome";
import { supabase } from "@/integrations/supabase/client";
import { ROOM_IMAGES, errMsg, fmtDate, fmtTime, foodImage, overlaps, peso } from "@/lib/afterglow";
import {
  addHours,
  busySlotsQuery,
  hourOptions,
  menuQuery,
  roomQuery,
  settingsQuery,
} from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { cartPayload, useCart } from "@/lib/cart";
import { ROOM_TYPE_LABELS } from "@/types/afterglow";

export const Route = createFileRoute("/rooms/$roomId")({
  head: () => ({
    meta: [
      { title: "Room details — Afterglow" },
      {
        name: "description",
        content: "See room details, check availability and book your karaoke session.",
      },
      { property: "og:title", content: "Room details — Afterglow" },
      { property: "og:description", content: "Check availability and book your karaoke session." },
    ],
  }),
  component: RoomPage,
});

const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

function RoomPage() {
  useRedirectAdmin();
  const { roomId } = Route.useParams();
  const { data: room, isLoading } = useQuery(roomQuery(roomId));
  const { data: settings } = useQuery(settingsQuery);
  const { user } = useAuth();
  const cart = useCart();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [date, setDate] = useState(today());
  const [start, setStart] = useState("");
  const [hours, setHours] = useState(2);
  const [guests, setGuests] = useState(2);
  const [requests, setRequests] = useState("");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [payment, setPayment] = useState<"cash" | "gcash">("cash");
  const [payerName, setPayerName] = useState("");
  const [payerAccount, setPayerAccount] = useState("");
  const [payRef, setPayRef] = useState("");
  const [receipt, setReceipt] = useState<null | {
    ref: string;
    date: string;
    start: string;
    hours: number;
    guests: number;
    payment: "cash" | "gcash";
    payerName: string;
    payerAccount: string;
    payRef: string;
    roomTotal: number;
    foodTotal: number;
    items: { name: string; qty: number; total: number }[];
  }>(null);
  const { data: menu } = useQuery(menuQuery);
  const [saving, setSaving] = useState(false);

  const { data: busy = [] } = useQuery(busySlotsQuery(roomId, date));

  const starts = useMemo(
    () => (settings ? hourOptions(settings.opening_time, settings.closing_time) : []),
    [settings],
  );
  const closeH = settings ? Number(settings.closing_time.slice(0, 2)) : 23;
  const maxH = settings?.max_duration_hours ?? 6;
  const isTaken = (s: string, h: number) =>
    busy.some((b) => overlaps(s + ":00", addHours(s, h) + ":00", b.start_time, b.end_time));

  if (isLoading)
    return <p className="mx-auto max-w-6xl px-4 py-20 text-muted-foreground">Loading…</p>;
  if (!room)
    return (
      <div className="mx-auto max-w-6xl px-4 py-20">
        <p>Room not found.</p>
        <Link to="/rooms" className="text-primary">
          Back to rooms
        </Link>
      </div>
    );

  const bookable = room.is_active && !room.maintenance_status;
  const validDurations = start
    ? Array.from({ length: maxH }, (_, i) => i + 1).filter(
        (h) => Number(start.slice(0, 2)) + h <= closeH,
      )
    : [];
  const roomTotal = room.hourly_rate * hours;
  const foodTotal = cart.subtotal;
  const menuItems = (menu?.items ?? []).filter((i) => i.is_available);
  const qtyOf = (id: string) => cart.items.find((i) => i.id === id)?.quantity ?? 0;

  const toMeals = () => {
    if (!user) return void navigate({ to: "/login" });
    if (!start) return void toast.error("Pick a start time.");
    if (isTaken(start, hours)) return void toast.error("That time overlaps another booking.");
    setStep(2);
  };

  const submit = async () => {
    if (!user) return void navigate({ to: "/login" });
    if (payment === "gcash") {
      if (payerName.trim().length < 2) return void toast.error("Enter the e-wallet account name.");
      if (!/^[0-9+ -]{7,20}$/.test(payerAccount.trim()))
        return void toast.error("Enter a valid e-wallet account number.");
    }
    setSaving(true);
    const items = cartPayload(cart.items);
    const { data: resId, error } = await supabase.rpc("create_reservation_v3", {
      _room_id: room.id,
      _date: date,
      _start: start,
      _end: addHours(start, hours),
      _guests: guests,
      _requests: requests,
      _items: items,
      _payment_method: payment,
      _payer_name: payerName,
      _payer_account: payerAccount,
      _payment_ref: payRef,
    });
    if (error) {
      setSaving(false);
      return void toast.error(errMsg(error));
    }
    const { data: res } = await supabase
      .from("reservations")
      .select("reference_code")
      .eq("id", resId as string)
      .maybeSingle();
    setSaving(false);
    setReceipt({
      ref: res?.reference_code ?? "",
      date,
      start,
      hours,
      guests,
      payment,
      payerName: payerName.trim(),
      payerAccount: payerAccount.trim(),
      payRef: payRef.trim(),
      roomTotal,
      foodTotal,
      items: cart.items.map((i) => ({
        name: i.name,
        qty: i.quantity,
        total: i.price * i.quantity,
      })),
    });
    cart.clear();
    qc.invalidateQueries({ queryKey: ["busy"] });
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
    setStep(4);
  };

  const PaymentNote = ({ method }: { method: "cash" | "gcash" }) =>
    method === "cash" ? (
      <p className="text-sm text-muted-foreground">Pay in cash at the counter when you check in.</p>
    ) : (
      <div className="space-y-1 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
        <p className="font-medium">Send to this {settings?.ewallet_provider ?? "GCash"} account</p>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Account name</span>
          <span className="font-medium">{settings?.ewallet_account_name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Account number</span>
          <span className="font-medium">{settings?.ewallet_account_number}</span>
        </div>
        {settings?.ewallet_instructions && (
          <p className="pt-1 text-xs text-muted-foreground">{settings.ewallet_instructions}</p>
        )}
      </div>
    );

  const StepDots = () => (
    <div className="mt-3 flex gap-2 text-xs">
      {["Room & time", "Meals", "Review & pay"].map((l, i) => (
        <button
          type="button"
          key={l}
          disabled={step <= i + 1}
          onClick={() => setStep((i + 1) as 1 | 2 | 3)}
          className={`rounded-full px-2.5 py-1 disabled:cursor-default ${step === i + 1 ? "bg-primary text-primary-foreground" : step > i + 1 ? "bg-secondary text-foreground" : "bg-secondary/40 text-muted-foreground"}`}
        >
          {i + 1}. {l}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <img
          src={room.image_url || ROOM_IMAGES[room.room_type]}
          alt={room.name}
          className="aspect-[16/10] w-full rounded-2xl object-cover"
        />
        <p className="mt-6 text-xs uppercase tracking-widest text-accent">
          Room {room.room_number} · {ROOM_TYPE_LABELS[room.room_type]}
        </p>
        <h1 className="mt-1 font-display text-4xl font-bold">{room.name}</h1>
        <p className="mt-3 text-muted-foreground">{room.description}</p>
        <div className="mt-4 flex gap-6 text-sm">
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4 text-primary" /> Up to {room.capacity} guests
          </span>
          <span className="text-accent">{peso(room.hourly_rate)} / hour</span>
        </div>
        <ul className="mt-6 grid grid-cols-2 gap-2 text-sm">
          {room.amenities.map((a) => (
            <li key={a} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              {a}
            </li>
          ))}
        </ul>
      </div>

      <div className="h-fit rounded-2xl border border-border bg-card p-6 glow-primary">
        {step === 4 && receipt ? (
          <div className="space-y-4">
            <div className="text-center">
              <Check className="mx-auto h-10 w-10 rounded-full bg-primary p-2 text-primary-foreground" />
              <h2 className="mt-3 font-display text-2xl font-bold">Booking sent!</h2>
              <p className="text-sm text-muted-foreground">Waiting for approval</p>
              <p className="mt-2 font-display text-lg tracking-widest text-accent">{receipt.ref}</p>
            </div>
            <div className="space-y-1 rounded-lg bg-secondary/40 p-4 text-sm">
              <p className="font-medium">{room.name}</p>
              <p className="text-muted-foreground">
                {fmtDate(receipt.date)} · {fmtTime(receipt.start)} –{" "}
                {fmtTime(addHours(receipt.start, receipt.hours))} · {receipt.guests} guests
              </p>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Room ({receipt.hours} hr)</span>
                <span>{peso(receipt.roomTotal)}</span>
              </div>
              {receipt.items.map((i) => (
                <div key={i.name} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {i.qty}× {i.name}
                  </span>
                  <span>{peso(i.total)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-2 font-display text-lg font-bold">
                <span>Total</span>
                <span className="text-accent">{peso(receipt.roomTotal + receipt.foodTotal)}</span>
              </div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="mb-1 text-sm font-medium">
                Payment: {receipt.payment === "cash" ? "Cash " : "GCash "}
              </p>
              <PaymentNote method={receipt.payment} />
              {receipt.payment === "gcash" && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Paid from: {receipt.payerName} · {receipt.payerAccount}
                  {receipt.payRef && ` · Ref ${receipt.payRef}`}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button asChild variant="glow" className="flex-1">
                <Link to="/my-bookings">View my bookings</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/rooms">Book another</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="font-display text-xl font-bold">Book this room</h2>
            {bookable && <StepDots />}
            {!bookable ? (
              <p className="mt-4 text-muted-foreground">
                This room is not available for booking right now.
              </p>
            ) : step === 1 ? (
              <div className="mt-5 space-y-4">
                <div>
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    min={today()}
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setStart("");
                    }}
                  />
                </div>
                <div>
                  <Label>Start time</Label>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {starts.map((s) => {
                      const taken = isTaken(s, 1);
                      return (
                        <button
                          key={s}
                          type="button"
                          disabled={taken}
                          onClick={() => {
                            setStart(s);
                            setHours((h) => Math.min(h, closeH - Number(s.slice(0, 2))));
                          }}
                          className={`rounded-md border px-2 py-2 text-sm transition ${start === s ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60"} disabled:cursor-not-allowed disabled:opacity-30 disabled:line-through`}
                        >
                          {fmtTime(s)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="hours">Hours</Label>
                    <select
                      id="hours"
                      className="mt-1.5 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={hours}
                      onChange={(e) => setHours(Number(e.target.value))}
                      disabled={!start}
                    >
                      {(validDurations.length ? validDurations : [hours]).map((h) => (
                        <option key={h} value={h} className="bg-popover">
                          {h} hr{h > 1 ? "s" : ""}
                          {start && isTaken(start, h) ? " (taken)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="guests">Guests</Label>
                    <Input
                      id="guests"
                      type="number"
                      min={1}
                      max={room.capacity}
                      value={guests}
                      onChange={(e) =>
                        setGuests(Math.max(1, Math.min(room.capacity, Number(e.target.value) || 1)))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="req">Special requests</Label>
                  <Textarea
                    id="req"
                    maxLength={500}
                    value={requests}
                    onChange={(e) => setRequests(e.target.value)}
                    placeholder="Birthday setup, song requests…"
                  />
                </div>
                <div className="flex justify-between border-t border-border pt-4 text-sm">
                  <span className="text-muted-foreground">
                    Room ({hours} hr × {peso(room.hourly_rate)})
                  </span>
                  <span>{peso(roomTotal)}</span>
                </div>
                <Button
                  variant="glow"
                  className="w-full"
                  size="lg"
                  onClick={toMeals}
                  disabled={!!user && !start}
                >
                  {user ? "Continue to meals" : "Sign in to book"}
                </Button>
              </div>
            ) : step === 2 ? (
              <div className="mt-5 space-y-4">
                <p className="rounded-lg bg-secondary/40 p-3 text-sm">
                  {fmtDate(date)} · {fmtTime(start)} – {fmtTime(addHours(start, hours))} ·{" "}
                  {guests} guests
                </p>
                <p className="text-sm text-muted-foreground">
                  Want food and drinks ready when you arrive? Add them now — or skip.
                </p>
                <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {menuItems.map((m) => {
                    const q = qtyOf(m.id);
                    return (
                      <li
                        key={m.id}
                        className="flex items-center gap-3 rounded-lg border border-border p-2"
                      >
                        <img
                          src={m.image_url || foodImage(m.image_key)}
                          alt={m.name}
                          className="h-12 w-12 rounded-md object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{m.name}</p>
                          <p className="text-xs text-accent">{peso(m.price)}</p>
                        </div>
                        {q === 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              cart.add({
                                id: m.id,
                                name: m.name,
                                price: Number(m.price),
                                image_key: m.image_key,
                                image_url: m.image_url,
                              })
                            }
                          >
                            Add
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => cart.setQty(m.id, q - 1)}
                              aria-label={`Less ${m.name}`}
                            >
                              <Minus />
                            </Button>
                            <span className="w-5 text-center text-sm">{q}</span>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => cart.setQty(m.id, q + 1)}
                              aria-label={`More ${m.name}`}
                            >
                              <Plus />
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="flex justify-between border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">
                    Food ({cart.count} item{cart.count === 1 ? "" : "s"})
                  </span>
                  <span>{peso(foodTotal)}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  {cart.count === 0 ? (
                    <Button variant="glow" className="flex-1" onClick={() => setStep(3)}>
                      Skip meals
                    </Button>
                  ) : (
                    <Button variant="glow" className="flex-1" onClick={() => setStep(3)}>
                      Continue to review
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="space-y-1 rounded-lg bg-secondary/40 p-4 text-sm">
                  <p className="font-medium">{room.name}</p>
                  <p className="text-muted-foreground">
                    {fmtDate(date)} · {fmtTime(start)} – {fmtTime(addHours(start, hours))} ·{" "}
                    {guests} guests
                  </p>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Room ({hours} hr × {peso(room.hourly_rate)})
                    </span>
                    <span>{peso(roomTotal)}</span>
                  </div>
                  {cart.items.map((i) => (
                    <div key={i.id} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {i.quantity}× {i.name}
                      </span>
                      <span>{peso(i.price * i.quantity)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-border pt-2 font-display text-lg font-bold">
                    <span>Total</span>
                    <span className="text-accent">{peso(roomTotal + foodTotal)}</span>
                  </div>
                </div>
                <div>
                  <Label>Payment method</Label>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {(["cash", "gcash"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPayment(p)}
                        className={`rounded-md border px-3 py-2 text-sm transition ${payment === p ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60"}`}
                      >
                        {p === "cash" ? "Cash" : "GCash"}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2">
                    <PaymentNote method={payment} />
                  </div>
                  {payment === "gcash" && (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm font-medium">Your e-wallet details</p>
                      <div>
                        <Label htmlFor="payer-name">Account name</Label>
                        <Input
                          id="payer-name"
                          maxLength={100}
                          value={payerName}
                          onChange={(e) => setPayerName(e.target.value)}
                          placeholder="Juan Dela Cruz"
                        />
                      </div>
                      <div>
                        <Label htmlFor="payer-account">Account number</Label>
                        <Input
                          id="payer-account"
                          inputMode="tel"
                          maxLength={20}
                          value={payerAccount}
                          onChange={(e) => setPayerAccount(e.target.value)}
                          placeholder="0917 123 4567"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Bookings need admin approval.</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button
                    variant="glow"
                    className="flex-1"
                    size="lg"
                    onClick={submit}
                    disabled={saving}
                  >
                    {saving ? "Booking…" : "Confirm booking"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
