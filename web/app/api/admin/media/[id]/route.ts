import { adminForChange } from '@/lib/admin/auth';
import { deleteMedia } from '@/lib/admin/media';

/** Delete a file nothing uses. */
export async function DELETE(req: Request, ctx: RouteContext<'/api/admin/media/[id]'>) {
  const admin = await adminForChange(req);
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  const r = await deleteMedia(id, admin.email);
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status });
}
