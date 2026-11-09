import { adminForChange } from '@/lib/admin/auth';
import { saveSection, saveShop } from '@/lib/admin/content';
import { sectionDef } from '@/lib/admin/editor';
import type { SectionId } from '@/lib/content/sections';

/** Save a draft: { section, value } for a website section, or { section: "shop", value } for the store. */
export async function PUT(req: Request) {
  const admin = await adminForChange(req);
  if (admin instanceof Response) return admin;
  const body = (await req.json().catch(() => null)) as { section?: unknown; value?: unknown } | null;
  if (!body || typeof body.section !== 'string')
    return Response.json({ error: 'Bad request' }, { status: 400 });

  if (body.section === 'shop') {
    const r = await saveShop(body.value, admin.email);
    return r.ok
      ? Response.json({ ok: true, value: r.value })
      : Response.json({ error: r.error }, { status: 400 });
  }
  if (!sectionDef(body.section)) return Response.json({ error: 'Unknown section' }, { status: 400 });
  const r = await saveSection(body.section as SectionId, body.value, admin.email);
  return r.ok
    ? Response.json({ ok: true, value: r.value })
    : Response.json({ error: r.error }, { status: 400 });
}
