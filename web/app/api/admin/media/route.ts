import { adminForChange, adminOr401 } from '@/lib/admin/auth';
import { listMedia, uploadMedia } from '@/lib/admin/media';

/** Every file in the library, newest first, with where it is used. */
export async function GET() {
  const admin = await adminOr401();
  if (admin instanceof Response) return admin;
  return Response.json({ items: await listMedia() });
}

/** Upload one file (multipart field "file") to R2. */
export async function POST(req: Request) {
  const admin = await adminForChange(req);
  if (admin instanceof Response) return admin;
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'No file' }, { status: 400 });
  const r = await uploadMedia(file, admin.email);
  return r.ok
    ? Response.json({ ok: true, item: r.item }, { status: 201 })
    : Response.json({ error: r.error }, { status: r.status });
}
