import { adminForChange } from '@/lib/admin/auth';
import { publishAll } from '@/lib/admin/content';

/** Publish every draft to the live website. */
export async function POST(req: Request) {
  const admin = await adminForChange(req);
  if (admin instanceof Response) return admin;
  const r = await publishAll(admin.email);
  return Response.json({ ok: true, ...r });
}
