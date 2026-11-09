// Forgot-password requests (docs/website-brief.md §7): the app posts { name, phone }, an
// admin sets a new password in Firebase, sends it on WhatsApp, then marks the request done.
import 'server-only';

import { and, eq, gt, sql } from 'drizzle-orm';

import { audit } from '@/lib/admin/audit';
import { isLocalHost } from '@/lib/admin/auth';
import { passwordError } from '@/lib/admin/password';
import { db, schema } from '@/lib/db';
import { envAsync } from '@/lib/env';
import { parseServiceAccount, type SetPasswordResult, setPasswordForPhone } from '@/lib/firebase/identity';
import { normalName, normalPhone } from '@/lib/validate';

const DAY = 24 * 60 * 60 * 1000;
export const MAX_PER_PHONE_PER_DAY = 3;
export const MAX_PER_IP_PER_DAY = 10;

export type NewRequest = { ok: true } | { ok: false; error: string; status: number };

/** Public: store a request. The answer never says whether the phone has an account. */
export async function createRequest(body: unknown, ip: string | null): Promise<NewRequest> {
  const b = (body ?? {}) as { name?: unknown; phone?: unknown };
  const name = typeof b.name === 'string' ? normalName(b.name) : null;
  if (!name) return { ok: false, error: 'Please type your name.', status: 400 };
  const phone = typeof b.phone === 'string' ? normalPhone(b.phone) : null;
  if (!phone) return { ok: false, error: 'Please type your 10-digit mobile number.', status: 400 };

  const d = await db();
  const since = Date.now() - DAY;
  const count = async (col: typeof schema.resetRequests.phone | typeof schema.resetRequests.ip, v: string) =>
    (
      await d
        .select({ n: sql<number>`count(*)` })
        .from(schema.resetRequests)
        .where(and(eq(col, v), gt(schema.resetRequests.createdAt, since)))
        .get()
    )?.n ?? 0;
  if ((await count(schema.resetRequests.phone, phone)) >= MAX_PER_PHONE_PER_DAY) {
    return { ok: false, error: 'Too many requests today. Please try again tomorrow.', status: 429 };
  }
  if (ip && (await count(schema.resetRequests.ip, ip)) >= MAX_PER_IP_PER_DAY) {
    return { ok: false, error: 'Too many requests today. Please try again tomorrow.', status: 429 };
  }
  // one waiting request per phone is enough — a repeat just refreshes name and time
  const waiting = await d
    .select({ id: schema.resetRequests.id })
    .from(schema.resetRequests)
    .where(and(eq(schema.resetRequests.phone, phone), eq(schema.resetRequests.status, 'waiting')))
    .get();
  if (waiting) {
    await d
      .update(schema.resetRequests)
      .set({ name, createdAt: Date.now(), ip })
      .where(eq(schema.resetRequests.id, waiting.id));
    return { ok: true };
  }
  await d.insert(schema.resetRequests).values({
    id: crypto.randomUUID(),
    name,
    phone,
    ip,
    createdAt: Date.now(),
    status: 'waiting',
  });
  return { ok: true };
}

async function getRequest(id: string) {
  return (await db()).select().from(schema.resetRequests).where(eq(schema.resetRequests.id, id)).get();
}

/**
 * Local Playwright runs only: with RP_FAKE_FIREBASE=1 in `next dev` on localhost, pretend to
 * update Firebase (phones ending in 0000 have no account). Never active in a Worker.
 */
function fakeFirebase(host: string | null): ((phone: string) => SetPasswordResult) | null {
  if (process.env.NODE_ENV !== 'development' || process.env.RP_FAKE_FIREBASE !== '1' || !isLocalHost(host))
    return null;
  return (phone) =>
    phone.endsWith('0000')
      ? { ok: false, reason: 'no-account', message: 'No RelaxPump account uses this phone number.' }
      : { ok: true };
}

export type PwResult = { ok: true } | { ok: false; error: string; status: number; noAccount?: boolean };

/** Admin: set the new password in Firebase for this request's phone. Not stored anywhere. */
export async function setRequestPassword(
  id: string,
  password: unknown,
  who: string,
  host: string | null,
): Promise<PwResult> {
  const err = passwordError(password);
  if (err) return { ok: false, error: err, status: 400 };
  const r = await getRequest(id);
  if (!r) return { ok: false, error: 'Request not found', status: 404 };
  if (r.status === 'done') return { ok: false, error: 'This request is already done', status: 409 };

  const fake = fakeFirebase(host);
  let res: SetPasswordResult;
  if (fake) res = fake(r.phone);
  else {
    const sa = parseServiceAccount((await envAsync()).FIREBASE_SERVICE_ACCOUNT);
    if (!sa)
      return {
        ok: false,
        error: 'Firebase is not set up yet (FIREBASE_SERVICE_ACCOUNT secret).',
        status: 503,
      };
    res = await setPasswordForPhone(sa, r.phone, password as string);
  }
  await audit(who, 'reset.password', {
    id,
    phone: r.phone,
    ok: res.ok,
    reason: res.ok ? undefined : res.reason,
  });
  if (res.ok) return { ok: true };
  return res.reason === 'no-account'
    ? { ok: false, error: res.message, status: 404, noAccount: true }
    : { ok: false, error: res.message, status: 502 };
}

/** Admin: close the request. */
export async function markRequestDone(id: string, who: string): Promise<PwResult> {
  const r = await getRequest(id);
  if (!r) return { ok: false, error: 'Request not found', status: 404 };
  if (r.status === 'done') return { ok: true };
  await (
    await db()
  )
    .update(schema.resetRequests)
    .set({ status: 'done', handledBy: who, handledAt: Date.now() })
    .where(eq(schema.resetRequests.id, id));
  await audit(who, 'reset.done', { id, phone: r.phone });
  return { ok: true };
}
