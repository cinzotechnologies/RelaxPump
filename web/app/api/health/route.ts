import { env } from '@/lib/env';

/** Liveness + binding check: D1 answers and R2 is bound. */
export async function GET() {
  const { DB, MEDIA } = env();
  const row = await DB.prepare('select 1 as ok').first<{ ok: number }>();
  return Response.json({ ok: row?.ok === 1, r2: typeof MEDIA?.head === 'function' });
}
