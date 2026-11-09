import { and, eq, gt, sql } from 'drizzle-orm';

import { audit } from '@/lib/admin/audit';
import { db, schema } from '@/lib/db';
import { envAsync } from '@/lib/env';
import { deleteOwnAccount } from '@/lib/firebase/selfDelete';
import { normalPhone } from '@/lib/validate';

const HOUR = 60 * 60 * 1000;
const MAX_PER_IP_PER_HOUR = 10;

/** Public: delete your RelaxPump account with phone + password (docs: /delete-account). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { phone?: unknown; password?: unknown } | null;
  const phone = typeof body?.phone === 'string' ? normalPhone(body.phone) : null;
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!phone) return Response.json({ error: 'Enter your 10-digit mobile number.' }, { status: 400 });
  if (password.length < 6 || password.length > 128) {
    return Response.json({ error: 'Enter your password.' }, { status: 400 });
  }

  const env = await envAsync();
  if (!env.FIREBASE_WEB_API_KEY || !env.FIREBASE_DB_URL) {
    return Response.json({ error: 'Not available right now. Please contact us.' }, { status: 503 });
  }

  // attempts are logged in audit_log (who = "ip:<ip>") and capped per IP
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  const d = await db();
  const n =
    (
      await d
        .select({ n: sql<number>`count(*)` })
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.who, `ip:${ip}`),
            eq(schema.auditLog.action, 'account.delete.try'),
            gt(schema.auditLog.at, Date.now() - HOUR),
          ),
        )
        .get()
    )?.n ?? 0;
  if (n >= MAX_PER_IP_PER_HOUR) {
    return Response.json({ error: 'Too many tries. Please wait an hour.' }, { status: 429 });
  }
  await audit(`ip:${ip}`, 'account.delete.try', null);

  const r = await deleteOwnAccount(phone, password, {
    apiKey: env.FIREBASE_WEB_API_KEY,
    dbUrl: env.FIREBASE_DB_URL,
  });
  if (!r.ok) {
    const status = r.reason === 'bad-login' ? 401 : r.reason === 'too-many' ? 429 : 502;
    return Response.json({ error: r.message }, { status });
  }
  await audit('user', 'account.delete', { uid: r.uid, devices: r.devices });
  return Response.json({ ok: true });
}
