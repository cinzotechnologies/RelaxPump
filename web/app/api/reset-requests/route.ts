import { createRequest } from '@/lib/admin/resets';

/** Public (the app's Forgot password sheet): { name, phone } → a request for the admin. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const ip = req.headers.get('cf-connecting-ip');
  const r = await createRequest(body, ip);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ ok: true, message: 'We will send your new password on WhatsApp.' }, { status: 201 });
}
