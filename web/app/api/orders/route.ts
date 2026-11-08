import { and, eq, gt, sql } from 'drizzle-orm';

import { getProducts, orderingOpen } from '@/lib/content/load';
import { db, schema } from '@/lib/db';
import { parseOrder } from '@/lib/orders';

const DAY = 24 * 60 * 60 * 1000;
const MAX_PER_PHONE_PER_DAY = 5;

/** Public: place an order (only while the admin has opened online ordering). */
export async function POST(req: Request) {
  if (!(await orderingOpen())) {
    return Response.json({ error: 'Online orders are not open yet. Please call us.' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const products = await getProducts();
  const parsed = parseOrder(
    body,
    products.map((p) => p.id),
  );
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const o = parsed.order;

  const d = await db();
  const since = Date.now() - DAY;
  const recent = await d
    .select({ n: sql<number>`count(*)` })
    .from(schema.orders)
    .where(and(eq(schema.orders.phone, o.phone), gt(schema.orders.createdAt, since)))
    .get();
  if ((recent?.n ?? 0) >= MAX_PER_PHONE_PER_DAY) {
    return Response.json({ error: 'Too many orders today. Please call us.' }, { status: 429 });
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const items = o.items.map((i) => ({
    ...i,
    name: byId.get(i.id)?.name ?? i.id,
    price: byId.get(i.id)?.price ?? null,
  }));
  const id = crypto.randomUUID();
  await d.insert(schema.orders).values({
    id,
    name: o.name,
    phone: o.phone,
    address: o.address,
    town: o.town,
    pin: o.pin,
    payment: o.payment,
    items: JSON.stringify(items),
    status: 'new',
    createdAt: Date.now(),
  });
  return Response.json({ ok: true, id }, { status: 201 });
}
