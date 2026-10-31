import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type CartItem = {
  id: string;
  name: string;
  price: number;
  image_key: string | null;
  image_url?: string | null;
  quantity: number;
};
type CartCtx = {
  items: CartItem[];
  add: (i: Omit<CartItem, "quantity">) => void;
  setQty: (id: string, q: number) => void;
  clear: () => void;
  subtotal: number;
  count: number;
};
const Ctx = createContext<CartCtx | null>(null);
const KEY = "afterglow-cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(items));
  }, [items]);

  const add: CartCtx["add"] = (i) =>
    setItems((prev) => {
      const ex = prev.find((p) => p.id === i.id);
      if (ex)
        return prev.map((p) =>
          p.id === i.id ? { ...p, quantity: Math.min(50, p.quantity + 1) } : p,
        );
      return [...prev, { ...i, quantity: 1 }];
    });
  const setQty = (id: string, q: number) =>
    setItems((prev) =>
      q <= 0
        ? prev.filter((p) => p.id !== id)
        : prev.map((p) => (p.id === id ? { ...p, quantity: Math.min(50, q) } : p)),
    );
  const clear = () => setItems([]);
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <Ctx.Provider value={{ items, add, setQty, clear, subtotal, count }}>{children}</Ctx.Provider>
  );
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}

export const cartPayload = (items: CartItem[]) =>
  items.map((i) => ({ menu_item_id: i.id, quantity: i.quantity }));
