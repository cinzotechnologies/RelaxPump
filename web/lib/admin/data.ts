import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';

import { db, schema } from '@/lib/db';

export type ResetRow = {
  id: string;
  name: string;
  phone: string;
  createdAt: number;
  status: 'waiting' | 'done';
  handledBy: string | null;
  handledAt: number | null;
};

export async function waitingCount(): Promise<number> {
  const r = await (
    await db()
  )
    .select({ n: sql<number>`count(*)` })
    .from(schema.resetRequests)
    .where(eq(schema.resetRequests.status, 'waiting'))
    .get();
  return r?.n ?? 0;
}

export async function resetRequests(status: 'waiting' | 'done', limit = 100): Promise<ResetRow[]> {
  const rows = await (
    await db()
  )
    .select()
    .from(schema.resetRequests)
    .where(and(eq(schema.resetRequests.status, status)))
    .orderBy(desc(schema.resetRequests.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    createdAt: r.createdAt,
    status: r.status === 'done' ? 'done' : 'waiting',
    handledBy: r.handledBy,
    handledAt: r.handledAt,
  }));
}

export async function setting(key: string): Promise<string | null> {
  const r = await (await db()).select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return r?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await (
    await db()
  )
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

export { whenLabel } from '@/components/admin/icons';
