// Checkout validation (pure, unit-tested). Used by POST /api/orders once ordering is open.
import { normalName, normalPhone } from './validate';

export type OrderInput = {
  name: string;
  phone: string;
  address: string;
  town: string;
  pin: string;
  payment: 'cod' | 'upi';
  items: { id: string; qty: number }[];
};

type Result = { ok: true; order: OrderInput } | { ok: false; error: string };

const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** Validate the checkout body against the product ids that may be ordered. */
export function parseOrder(body: unknown, productIds: readonly string[]): Result {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = normalName(str(b.name));
  if (!name) return { ok: false, error: 'Please enter your name.' };
  const phone = normalPhone(str(b.phone));
  if (!phone) return { ok: false, error: 'Please enter a 10-digit mobile number.' };
  const address = str(b.address);
  if (address.length < 3 || address.length > 200) return { ok: false, error: 'Please enter your address.' };
  const town = str(b.town);
  if (town.length < 2 || town.length > 60) return { ok: false, error: 'Please enter your town.' };
  const pin = str(b.pin).replace(/\s/g, '');
  if (!/^[1-9][0-9]{5}$/.test(pin)) return { ok: false, error: 'Please enter a 6-digit PIN code.' };
  const payment = b.payment === 'upi' ? 'upi' : b.payment === 'cod' ? 'cod' : null;
  if (!payment) return { ok: false, error: 'Please pick a payment method.' };

  const raw = b.items && typeof b.items === 'object' ? (b.items as Record<string, unknown>) : {};
  const items = Object.entries(raw)
    .filter(
      ([id, q]) =>
        productIds.includes(id) && typeof q === 'number' && Number.isInteger(q) && q > 0 && q <= 99,
    )
    .map(([id, q]) => ({ id, qty: q as number }));
  if (!items.length) return { ok: false, error: 'Your cart is empty.' };

  return { ok: true, order: { name, phone, address, town, pin, payment, items } };
}
