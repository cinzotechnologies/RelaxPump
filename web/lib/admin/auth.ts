// Admin sign-in (docs/website-brief.md §3). Production: Cloudflare Access (email one-time PIN)
// protects /admin and /api/admin; the Worker re-checks the signed Access JWT and the allow-list.
// Local dev without Access: a dev cookie from /admin/login, accepted on localhost only.
import 'server-only';

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';

import { envAsync } from '@/lib/env';

export const DEV_COOKIE = 'rp_dev_admin';

export type Admin = { email: string; name: string };

const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** "a@x.com, B@y.com" → ["a@x.com", "b@y.com"] */
export function allowList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isLocalHost(host: string | null): boolean {
  const h = (host ?? '').split(':')[0];
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

const nameOf = (email: string) =>
  email.startsWith('cinzotechnologies') ? 'CINZO Admin' : email.split('@')[0];

/** Verify a Cloudflare Access JWT; returns the email or null. */
export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  aud: string,
): Promise<string | null> {
  const issuer = `https://${teamDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  let set = jwks.get(issuer);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwks.set(issuer, set);
  }
  try {
    const { payload } = await jwtVerify(token, set, { issuer, audience: aud });
    return typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The signed-in admin for this request, or null. */
export async function currentAdmin(): Promise<Admin | null> {
  const env = await envAsync();
  const allowed = allowList(env.ADMIN_EMAILS);
  const h = await headers();

  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const token = h.get('cf-access-jwt-assertion');
    if (!token) return null;
    const email = await verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
    return email && allowed.includes(email) ? { email, name: nameOf(email) } : null;
  }

  // No Access configured: only local development may sign in, with the dev cookie.
  if (!isLocalHost(h.get('host'))) return null;
  const email = (await cookies()).get(DEV_COOKIE)?.value?.toLowerCase();
  return email && allowed.includes(email) ? { email, name: nameOf(email) } : null;
}

/** Whether this server uses Cloudflare Access (else the dev login page is offered). */
export async function usesAccess(): Promise<boolean> {
  const env = await envAsync();
  return !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
}

/** For API routes: the admin, or a 401 Response to return. */
export async function adminOr401(): Promise<Admin | Response> {
  const a = await currentAdmin();
  return a ?? Response.json({ error: 'Not signed in' }, { status: 401 });
}
