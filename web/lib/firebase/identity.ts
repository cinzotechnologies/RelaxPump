// Set a RelaxPump app user's password from the Worker (docs/website-brief.md §7), without
// firebase-admin: a Google service-account token signed here with `jose`, then the Identity
// Toolkit REST API — accounts:lookup by email, accounts:update with the new password. Works on
// the Spark plan. The password is never stored or logged.
import { importPKCS8, SignJWT } from 'jose';

/** App accounts are "91XXXXXXXXXX@users.relaxpump.app" (app/src/services/firebaseBackend.ts). */
export const USER_DOMAIN = 'users.relaxpump.app';
export const emailOfPhone = (phone10: string) => `91${phone10}@${USER_DOMAIN}`;

export type ServiceAccount = { project_id: string; client_email: string; private_key: string };

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const IDT = 'https://identitytoolkit.googleapis.com/v1/projects';
const SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';

export function parseServiceAccount(json: string | undefined): ServiceAccount | null {
  if (!json) return null;
  try {
    const sa = JSON.parse(json) as Partial<ServiceAccount>;
    return sa.project_id && sa.client_email && sa.private_key
      ? { project_id: sa.project_id, client_email: sa.client_email, private_key: sa.private_key }
      : null;
  } catch {
    return null;
  }
}

let cached: { email: string; token: string; exp: number } | null = null;

/** OAuth access token for the service account (cached until 5 min before it expires). */
export async function accessToken(sa: ServiceAccount, f: typeof fetch = fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.email === sa.client_email && cached.exp - 300 > now) return cached.token;
  const key = await importPKCS8(sa.private_key.replace(/\\n/g, '\n'), 'RS256');
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const r = await f(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const b = (await r.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!r.ok || !b?.access_token) throw new Error(`Google sign-in failed (${r.status})`);
  cached = { email: sa.client_email, token: b.access_token, exp: now + (b.expires_in ?? 3600) };
  return b.access_token;
}

export type SetPasswordResult = { ok: true } | { ok: false; reason: 'no-account' | 'error'; message: string };

/** Find the app user for this phone and give them a new password (old sessions are signed out). */
export async function setPasswordForPhone(
  sa: ServiceAccount,
  phone10: string,
  password: string,
  f: typeof fetch = fetch,
): Promise<SetPasswordResult> {
  try {
    const token = await accessToken(sa, f);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const base = `${IDT}/${encodeURIComponent(sa.project_id)}`;

    const look = await f(`${base}/accounts:lookup`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: [emailOfPhone(phone10)] }),
    });
    const lb = (await look.json().catch(() => null)) as { users?: { localId: string }[] } | null;
    if (!look.ok) return { ok: false, reason: 'error', message: `Firebase lookup failed (${look.status})` };
    const uid = lb?.users?.[0]?.localId;
    if (!uid)
      return { ok: false, reason: 'no-account', message: 'No RelaxPump account uses this phone number.' };

    const up = await f(`${base}/accounts:update`, {
      method: 'POST',
      headers,
      // validSince = now: tokens issued before this stop working (sign out other devices)
      body: JSON.stringify({ localId: uid, password, validSince: String(Math.floor(Date.now() / 1000)) }),
    });
    if (!up.ok) {
      const ub = (await up.json().catch(() => null)) as { error?: { message?: string } } | null;
      const msg = ub?.error?.message ?? '';
      if (msg.startsWith('WEAK_PASSWORD'))
        return { ok: false, reason: 'error', message: 'Firebase says the password is too weak.' };
      return { ok: false, reason: 'error', message: `Firebase update failed (${up.status})` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message || 'Firebase error' };
  }
}

/** Test hook: forget the cached token. */
export function _resetTokenCache() {
  cached = null;
}
