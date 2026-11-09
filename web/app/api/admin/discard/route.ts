import { adminForChange } from '@/lib/admin/auth';
import { discardAll } from '@/lib/admin/content';

/** Throw away every unpublished change. */
export async function POST(req: Request) {
  const admin = await adminForChange(req);
  if (admin instanceof Response) return admin;
  await discardAll(admin.email);
  return Response.json({ ok: true });
}
