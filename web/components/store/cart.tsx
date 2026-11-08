'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/** id → quantity. */
export type Cart = Record<string, number>;

const KEY = 'relaxpump.cart.v1';
const MAX_QTY = 99;

/** Keep only sane entries (positive integers ≤ 99 for known ids). */
export function cleanCart(raw: unknown, ids: readonly string[]): Cart {
  if (!raw || typeof raw !== 'object') return {};
  const out: Cart = {};
  for (const [id, q] of Object.entries(raw as Record<string, unknown>)) {
    if (!ids.includes(id) || typeof q !== 'number' || !Number.isFinite(q)) continue;
    const n = Math.min(MAX_QTY, Math.floor(q));
    if (n > 0) out[id] = n;
  }
  return out;
}

/** Set a quantity; 0 or less removes the line. */
export function withQty(cart: Cart, id: string, q: number): Cart {
  const next = { ...cart };
  if (q <= 0) delete next[id];
  else next[id] = Math.min(MAX_QTY, q);
  return next;
}

export const cartCount = (cart: Cart) => Object.values(cart).reduce((a, b) => a + b, 0);

type CartState = {
  cart: Cart;
  count: number;
  setQty: (id: string, q: number) => void;
  clear: () => void;
  open: boolean;
  setOpen: (o: boolean) => void;
};

const Ctx = createContext<CartState | null>(null);

/** Cart lives in localStorage (brief §2): survives reloads, never leaves the browser. */
export function CartProvider({ ids, children }: { ids: string[]; children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart>({});
  const [open, setOpen] = useState(false);
  const idsKey = ids.join(',');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      // Restoring browser state after hydration is the intended one-time sync here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setCart(cleanCart(JSON.parse(raw), idsKey.split(',')));
    } catch {
      // private mode / blocked storage: start empty
    }
  }, [idsKey]);

  const setQty = useCallback((id: string, q: number) => {
    setCart((c) => {
      const next = withQty(c, id, q);
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setCart({});
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({ cart, count: cartCount(cart), setQty, clear, open, setOpen }),
    [cart, setQty, clear, open],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCart outside CartProvider');
  return v;
}
