import { adminForChange } from '@/lib/admin/auth';
import { markRequestDone } from '@/lib/admin/resets';

/** Mark a request as done (who and when are recorded). */
export async function POST(req: Request, ctx: RouteContext<'/api/admin/reset-requests/[id]/done'>) {
  const admin = await adminForChange(req);
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  const r = await markRequestDone(id, admin.email);
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status });
}
