import { cookies } from 'next/headers';

import { DEV_COOKIE, usesAccess } from '@/lib/admin/auth';

/** Sign out: Cloudflare Access logout in production, drop the dev cookie locally. */
export async function GET(req: Request) {
  if (await usesAccess()) {
    return Response.redirect(new URL('/cdn-cgi/access/logout', req.url), 302);
  }
  (await cookies()).delete(DEV_COOKIE);
  return Response.redirect(new URL('/admin/login', req.url), 302);
}
