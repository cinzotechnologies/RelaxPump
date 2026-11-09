import { cookies } from 'next/headers';

import { DEV_COOKIE, usesAccess } from '@/lib/admin/auth';

/** Relative redirect: stays on the host the browser used. */
const go = (path: string) => new Response(null, { status: 302, headers: { location: path } });

/** Sign out: Cloudflare Access logout in production, drop the dev cookie locally. */
export async function GET() {
  if (await usesAccess()) {
    return go('/cdn-cgi/access/logout');
  }
  (await cookies()).delete(DEV_COOKIE);
  return go('/admin/login');
}
