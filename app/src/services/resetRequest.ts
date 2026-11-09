// Forgot password while SMS codes are off (docs/website-brief.md §7): send { name, phone } to
// the website; an admin sets a new password and sends it on WhatsApp.
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { WEB_API?: string };

export type ResetResult = { ok: true } | { ok: false; error: string };

const TIMEOUT_MS = 15_000;

export async function sendResetRequest(
  name: string,
  phone: string,
  opts: { base?: string; fetchFn?: typeof fetch; mock?: boolean } = {},
): Promise<ResetResult> {
  const n = name.replace(/\s+/g, ' ').trim();
  if (!n || n.length > 60) return { ok: false, error: 'Type your name' };
  if (!/^[6-9]\d{9}$/.test(phone)) return { ok: false, error: 'Enter a 10-digit number' };
  if (opts.mock) {
    await new Promise((r) => setTimeout(r, 600));
    return { ok: true };
  }
  const base = (opts.base ?? extra.WEB_API ?? '').replace(/\/$/, '');
  if (!base) return { ok: false, error: 'Could not send. Please call us.' };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await (opts.fetchFn ?? fetch)(`${base}/api/reset-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: n, phone }),
      signal: ctrl.signal,
    });
    if (r.ok) return { ok: true };
    const b = (await r.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: b?.error ?? 'Could not send. Try again.' };
  } catch {
    return { ok: false, error: 'No internet? Check your connection and try again.' };
  } finally {
    clearTimeout(t);
  }
}
