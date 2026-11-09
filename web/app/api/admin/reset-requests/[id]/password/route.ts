import { adminForChange } from '@/lib/admin/auth';
import { setRequestPassword } from '@/lib/admin/resets';

/** Set the new password in Firebase for this request's phone. The password is not stored. */
export async function POST(req: Request, ctx: RouteContext<'/api/admin/reset-requests/[id]/password'>) {
  const admin = await adminForChange(req);
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const r = await setRequestPassword(id, body?.password, admin.email, req.headers.get('host'));
  return r.ok
    ? Response.json({ ok: true })
    : Response.json({ error: r.error, noAccount: r.noAccount ?? false }, { status: r.status });
}
