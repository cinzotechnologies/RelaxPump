import { describe, expect, it } from 'vitest';

import { deleteOwnAccount } from '@/lib/firebase/selfDelete';

const cfg = { apiKey: 'k', dbUrl: 'https://db.test/' };
type Call = { url: string; method: string; body: string };

function fake(opts: {
  login?: 'ok' | 'bad' | 'many';
  devices?: Record<string, true> | null;
  patch?: number;
  del?: number;
}) {
  const calls: Call[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET', body: String(init?.body ?? '') });
    if (url.includes('signInWithPassword')) {
      if (opts.login === 'bad')
        return Response.json({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }, { status: 400 });
      if (opts.login === 'many')
        return Response.json({ error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER' } }, { status: 400 });
      return Response.json({ idToken: 'tok', localId: 'u1' });
    }
    if (url.includes('/users/u1/devices.json')) return Response.json(opts.devices ?? null);
    if (url.startsWith('https://db.test/.json')) return new Response('{}', { status: opts.patch ?? 200 });
    if (url.includes('accounts:delete')) return new Response('{}', { status: opts.del ?? 200 });
    return new Response('?', { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}

describe('website account deletion', () => {
  it('signs in, wipes the profile and releases controllers, then deletes the sign-in', async () => {
    const { f, calls } = fake({ devices: { 'RP-1': true, 'RP-2': true } });
    const r = await deleteOwnAccount('9876543210', 'secret1', cfg, f);
    expect(r).toEqual({ ok: true, uid: 'u1', devices: 2 });
    expect(JSON.parse(calls[0].body)).toMatchObject({
      email: '919876543210@users.relaxpump.app',
      password: 'secret1',
    });
    expect(calls[1].url).toBe('https://db.test/users/u1/devices.json?auth=tok');
    expect(calls[2].method).toBe('PATCH');
    expect(JSON.parse(calls[2].body)).toEqual({
      'users/u1': null,
      'devices/RP-1/info/ownerUid': null,
      'devices/RP-2/info/ownerUid': null,
    });
    expect(JSON.parse(calls[3].body)).toEqual({ idToken: 'tok' });
  });
  it('says wrong number or password without touching data', async () => {
    const { f, calls } = fake({ login: 'bad' });
    expect(await deleteOwnAccount('9876543210', 'x12345', cfg, f)).toMatchObject({
      ok: false,
      reason: 'bad-login',
    });
    expect(calls).toHaveLength(1);
  });
  it('passes on Firebase rate limiting', async () => {
    const { f } = fake({ login: 'many' });
    expect(await deleteOwnAccount('9876543210', 'x12345', cfg, f)).toMatchObject({ reason: 'too-many' });
  });
  it('does not delete the sign-in when the data wipe fails', async () => {
    const { f, calls } = fake({ devices: null, patch: 401 });
    expect((await deleteOwnAccount('9876543210', 'secret1', cfg, f)).ok).toBe(false);
    expect(calls.some((c) => c.url.includes('accounts:delete'))).toBe(false);
  });
});
