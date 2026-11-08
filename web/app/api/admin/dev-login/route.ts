import { cookies, headers } from 'next/headers';

import { DEV_COOKIE, allowList, isLocalHost, usesAccess } from '@/lib/admin/auth';
import { audit } from '@/lib/admin/audit';
import { envAsync } from '@/lib/env';

/** Local development only: sign in as an allowed admin email. Refused when Access is set up. */
export async function POST(req: Request) {
  const h = await headers();
  if ((await usesAccess()) || !isLocalHost(h.get('host'))) {
    return Response.json({ error: 'Use Cloudflare Access to sign in.' }, { status: 403 });
  }
  const { email } = ((await req.json().catch(() => ({}))) ?? {}) as { email?: string };
  const e = String(email ?? '')
    .trim()
    .toLowerCase();
  if (!allowList((await envAsync()).ADMIN_EMAILS).includes(e)) {
    return Response.json({ error: 'This email is not on the admin list.' }, { status: 403 });
  }
  (await cookies()).set(DEV_COOKIE, e, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  await audit(e, 'dev-login').catch(() => {});
  return Response.json({ ok: true });
}
