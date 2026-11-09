import { draftMode } from 'next/headers';

import { currentAdmin } from '@/lib/admin/auth';

/** GET ?to=/store — admin only: turn on preview (drafts) and open that page. ?off=1 turns it off. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = url.searchParams.get('to') ?? '/';
  const dest = new URL(/^\/(?!\/)/.test(to) ? to : '/', url);
  const dm = await draftMode();
  if (url.searchParams.get('off')) {
    dm.disable();
    return Response.redirect(dest, 302);
  }
  if (!(await currentAdmin())) return Response.json({ error: 'Not signed in' }, { status: 401 });
  dm.enable();
  return Response.redirect(dest, 302);
}
