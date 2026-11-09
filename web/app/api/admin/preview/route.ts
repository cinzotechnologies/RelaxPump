import { draftMode } from 'next/headers';

import { currentAdmin } from '@/lib/admin/auth';

/** Relative redirect: stays on the host the browser used (admin host or site). */
const go = (path: string) => new Response(null, { status: 302, headers: { location: path } });

/** GET ?to=/store — admin only: turn on preview (drafts) and open that page. ?off=1 turns it off. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = url.searchParams.get('to') ?? '/';
  const dest = /^\/(?!\/)[^\s\\]*$/.test(to) ? to : '/';
  const dm = await draftMode();
  if (url.searchParams.get('off')) {
    dm.disable();
    return go(dest);
  }
  if (!(await currentAdmin())) return Response.json({ error: 'Not signed in' }, { status: 401 });
  dm.enable();
  return go(dest);
}
