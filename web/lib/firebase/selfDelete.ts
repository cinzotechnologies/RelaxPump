// Account deletion from the website (Play Store "delete account" URL). The user proves who they
// are with their phone + password; everything then runs with *their own* Firebase ID token, the
// same writes the app's Account › Delete account does — no admin key on the public Worker.
//   1. accounts:signInWithPassword → idToken, uid
//   2. RTDB multi-path update: users/{uid} = null, devices/{id}/info/ownerUid = null (rules allow)
//   3. accounts:delete with the idToken
import { emailOfPhone } from './identity';

export type SelfDeleteConfig = { apiKey: string; dbUrl: string };
export type SelfDeleteResult =
  | { ok: true; uid: string; devices: number }
  | { ok: false; reason: 'bad-login' | 'too-many' | 'error'; message: string };

const IDT = 'https://identitytoolkit.googleapis.com/v1';

export async function deleteOwnAccount(
  phone10: string,
  password: string,
  cfg: SelfDeleteConfig,
  f: typeof fetch = fetch,
): Promise<SelfDeleteResult> {
  try {
    const key = encodeURIComponent(cfg.apiKey);
    const login = await f(`${IDT}/accounts:signInWithPassword?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: emailOfPhone(phone10), password, returnSecureToken: true }),
    });
    const lb = (await login.json().catch(() => null)) as {
      idToken?: string;
      localId?: string;
      error?: { message?: string };
    } | null;
    if (!login.ok || !lb?.idToken || !lb.localId) {
      const m = lb?.error?.message ?? '';
      if (m.startsWith('TOO_MANY_ATTEMPTS')) {
        return { ok: false, reason: 'too-many', message: 'Too many tries. Please wait and try again later.' };
      }
      if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|USER_DISABLED|INVALID_EMAIL/.test(m)) {
        return { ok: false, reason: 'bad-login', message: 'Wrong number or password.' };
      }
      return { ok: false, reason: 'error', message: `Sign-in failed (${login.status}). Please try again.` };
    }
    const { idToken, localId: uid } = lb;
    const db = cfg.dbUrl.replace(/\/$/, '');
    const auth = `auth=${encodeURIComponent(idToken)}`;

    const devRes = await f(`${db}/users/${uid}/devices.json?${auth}`);
    if (!devRes.ok) return { ok: false, reason: 'error', message: 'Could not read your account. Try again.' };
    const ids = Object.keys(((await devRes.json()) as Record<string, true> | null) ?? {});

    const wipe: Record<string, null> = { [`users/${uid}`]: null };
    for (const id of ids) wipe[`devices/${id}/info/ownerUid`] = null;
    const up = await f(`${db}/.json?${auth}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(wipe),
    });
    if (!up.ok) return { ok: false, reason: 'error', message: 'Could not remove your data. Try again.' };

    const del = await f(`${IDT}/accounts:delete?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!del.ok)
      return {
        ok: false,
        reason: 'error',
        message: 'Your data was removed, but the sign-in could not be deleted. Contact us.',
      };
    return { ok: true, uid, devices: ids.length };
  } catch {
    return { ok: false, reason: 'error', message: 'Something went wrong. Please try again.' };
  }
}
