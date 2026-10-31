import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, useRedirectAdmin } from "@/components/SiteChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { errMsg, foodImage, peso } from "@/lib/afterglow";
import { menuQuery } from "@/lib/queries";
import { cartPayload, useCart } from "@/lib/cart";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Food & Drinks — Afterglow" },
      {
        name: "description",
        content: "Snacks, platters, meals and drinks delivered to your karaoke room.",
      },
      { property: "og:title", content: "Food & Drinks — Afterglow" },
      {
        property: "og:description",
        content: "Snacks, platters, meals and drinks delivered to your karaoke room.",
      },
    ],
  }),
  component: Menu,
});

function Menu() {
  useRedirectAdmin();
  const { data, isLoading } = useQuery(menuQuery);
  const { items: cart, add, setQty, clear, subtotal, count } = useCart();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  
  // Checkout Modal State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [inRoomPaymentMethod, setInRoomPaymentMethod] = useState<"cash" | "gcash">("cash");
  const [payerName, setPayerName] = useState("");
  const [payerAccount, setPayerAccount] = useState("");
  const [payRef, setPayRef] = useState("");
  
  const q = search.trim().toLowerCase();
  const match = (name: string | null, desc: string | null) =>
    !q || (name ?? "").toLowerCase().includes(q) || (desc ?? "").toLowerCase().includes(q);
  const activeCats = data?.categories.filter((c) => c.is_active) ?? [];
  const shownCats = activeCats.filter((c) => category === "all" || c.id === category);
  const anyShown = data?.items.some(
    (i) => shownCats.some((c) => c.id === i.category_id) && match(i.name, i.description),
  );
  const qtyOf = (id: string) => cart.find((c) => c.id === id)?.quantity ?? 0;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  void count;

  const submitOrder = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      toast.error("Please sign in first.");
      return void navigate({ to: "/login" });
    }
    
    // Validate GCash inputs
    if (inRoomPaymentMethod === "gcash") {
      if (payerName.trim().length < 2) return void toast.error("Enter the e-wallet account name.");
      if (!/^[0-9+\-\s]{7,20}$/.test(payerAccount.trim())) 
        return void toast.error("Enter a valid e-wallet account number.");
    }

    setSending(true);
    const { data: res } = await supabase
      .from("reservations")
      .select("id")
      .eq("user_id", u.user.id)
      .eq("status", "checked_in")
      .order("start_time", { ascending: false })
      .limit(1);
      
    if (!res?.length) {
      setSending(false);
      return void toast.error("You need to be checked in to a booking to order to your room.");
    }
    
    const { error } = await supabase.rpc("create_in_room_order", {
      _reservation_id: res[0]!.id,
      _items: cartPayload(cart),
      _notes: "",
      _payment_method: inRoomPaymentMethod,
      _payer_name: payerName.trim(),
      _payer_account: payerAccount.trim(),
      _payment_ref: payRef.trim(),
    });
    
    setSending(false);
    if (error) return void toast.error(errMsg(error));
    
    clear();
    setIsCheckoutOpen(false);
    // Reset payment fields
    setPayerName("");
    setPayerAccount("");
    setPayRef("");
    setInRoomPaymentMethod("cash");
    
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
    toast.success("Order sent to your room!");
    navigate({ to: "/my-bookings" });
  };

  return (
    <div>
      <PageHeader eyebrow="Food & Drinks" title="Fuel for the encore">
        Add items to your order, then attach them to a booking — or order from your room once
        checked in.
      </PageHeader>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 lg:grid-cols-12">
        <div className="space-y-12 lg:col-span-8">
          <div className="flex max-w-xl flex-col gap-2 sm:flex-row">
            <Input
              type="search"
              placeholder="Search the menu…"
              aria-label="Search menu items"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <select
              aria-label="Filter by category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm sm:w-48"
            >
              <option value="all">All categories</option>
              {activeCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {isLoading && <p className="text-muted-foreground">Loading menu…</p>}
          {data && !anyShown && (
            <p className="text-muted-foreground">No dishes or drinks match your search.</p>
          )}
          {data &&
            shownCats.map((c) => {
              const items = data.items.filter(
                (i) => i.category_id === c.id && match(i.name, i.description),
              );
              if (!items.length) return null;
              return (
                <section key={c.id}>
                  <h2 className="font-display text-2xl font-bold">{c.name}</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {items.map((i) => {
                      const qty = qtyOf(i.id);
                      return (
                        <div
                          key={i.id}
                          id={`item-${i.id}`}
                          className="flex scroll-mt-24 gap-4 rounded-xl border border-border bg-card p-3"
                        >
                          <img
                            src={i.image_url || foodImage(i.image_key)}
                            alt={i.name}
                            className="h-24 w-24 rounded-lg object-cover"
                            loading="lazy"
                          />
                          <div className="flex flex-1 flex-col">
                            <p className="font-medium">{i.name}</p>
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {i.description}
                            </p>
                            <div className="mt-auto flex items-center justify-between pt-2">
                              <span className="text-accent">{peso(i.price)}</span>
                              {!i.is_available ? (
                                <span className="text-xs text-muted-foreground">Sold out</span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    add({
                                      id: i.id,
                                      name: i.name,
                                      price: Number(i.price),
                                      image_key: i.image_key,
                                      image_url: i.image_url,
                                    })
                                  }
                                >
                                  <Plus /> Add
                                  {qty > 0 && (
                                    <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                                      {qty}
                                    </span>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
        </div>

        <aside className="lg:col-span-4">
          <section
            id="order-receipt"
            className="scroll-mt-24 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
          >
            <h2 className="font-display text-2xl font-bold">Your order</h2>
            {cart.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing added yet. Tap Add on any item.
              </p>
            ) : (
              <>
                <ul className="mt-4 divide-y divide-border">
                  {cart.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{peso(c.price)} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            aria-label={`Less ${c.name}`}
                            onClick={() => setQty(c.id, c.quantity - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm">{c.quantity}</span>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            aria-label={`More ${c.name}`}
                            onClick={() => setQty(c.id, c.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <span className="w-16 text-right text-sm font-medium">
                          {peso(c.price * c.quantity)}
                        </span>
                        <button
                          aria-label={`Remove ${c.name}`}
                          onClick={() => setQty(c.id, 0)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <Button size="sm" variant="ghost" onClick={clear}>
                    <Trash2 /> Clear all
                  </Button>
                  <p className="font-display text-xl font-bold">
                    Total <span className="text-accent">{peso(subtotal)}</span>
                  </p>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <Button asChild variant="glow">
                    <Link to="/rooms">Book a room with this order</Link>
                  </Button>
                  <Button variant="outline" onClick={() => setIsCheckoutOpen(true)}>
                    Order to my room
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  "Order to my room" works once you're checked in to a booking.
                </p>
              </>
            )}
          </section>
        </aside>
      </div>

      {/* Checkout Modal */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complete your order</DialogTitle>
            <DialogDescription>
              How would you like to pay for the food?
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setInRoomPaymentMethod("cash")}
                className={`rounded-md border px-3 py-2 text-sm transition ${
                  inRoomPaymentMethod === "cash"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:border-primary/60"
                }`}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => setInRoomPaymentMethod("gcash")}
                className={`rounded-md border px-3 py-2 text-sm transition ${
                  inRoomPaymentMethod === "gcash"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:border-primary/60"
                }`}
              >
                GCash
              </button>
            </div>

            {inRoomPaymentMethod === "cash" ? (
              <p className="text-sm text-muted-foreground bg-secondary/20 p-3 rounded-md">
                Pay in cash at the counter when the food is delivered to your room.
              </p>
            ) : (
              <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">
                  Enter your GCash details. The admin will verify this.
                </p>
                <div>
                  <Label htmlFor="payer-name" className="text-xs">Account Name</Label>
                  <Input
                    id="payer-name"
                    placeholder="Juan Dela Cruz"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="payer-account" className="text-xs">Account Number</Label>
                  <Input
                    id="payer-account"
                    placeholder="0917 123 4567"
                    value={payerAccount}
                    onChange={(e) => setPayerAccount(e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setIsCheckoutOpen(false)}>
                Cancel
              </Button>
              <Button variant="glow" onClick={submitOrder} disabled={sending}>
                {sending ? "Processing…" : "Confirm & Pay"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}