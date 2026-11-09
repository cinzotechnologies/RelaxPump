import { exportPKCS8, generateKeyPair, decodeJwt } from 'jose';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  generatePassword,
  PW_CHARS,
  passwordError,
  whatsAppLink,
  whatsAppMessage,
} from '@/lib/admin/password';
import {
  _resetTokenCache,
  emailOfPhone,
  parseServiceAccount,
  setPasswordForPhone,
  type ServiceAccount,
} from '@/lib/firebase/identity';

describe('new password rules', () => {
  it('generates 8 characters without look-alikes', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(8);
      for (const c of p) expect(PW_CHARS).toContain(c);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });
  it('checks length and characters', () => {
    expect(passwordError('abc12')).toBe('At least 6 characters');
    expect(passwordError('abc 123')).not.toBeNull();
    expect(passwordError('Ab3dEf7h')).toBeNull();
    expect(passwordError(undefined)).not.toBeNull();
  });
  it('builds the WhatsApp message and link', () => {
    const m = whatsAppMessage('Lalremruati', 'Ab3dEf7h');
    expect(m).toContain('Hello Lalremruati,');
    expect(m).toContain('New password: Ab3dEf7h');
    expect(m).toContain('Account › Change password');
    expect(whatsAppLink('9876543210', 'a b')).toBe('https://wa.me/919876543210?text=a%20b');
  });
});

describe('Firebase Identity Toolkit', () => {
  let sa: ServiceAccount;
  beforeEach(async () => {
    _resetTokenCache();
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    sa = {
      project_id: 'iotcinzo',
      client_email: 'svc@iotcinzo.iam.gserviceaccount.com',
      private_key: await exportPKCS8(privateKey),
    };
  });

  type Call = { url: string; body: string; auth: string | null };
  function fakeFetch(users: { localId: string }[] | undefined, updateStatus = 200) {
    const calls: Call[] = [];
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = String(init?.body ?? '');
      calls.push({ url, body, auth: new Headers(init?.headers).get('authorization') });
      if (url.includes('oauth2')) return Response.json({ access_token: 'tok', expires_in: 3600 });
      if (url.endsWith('accounts:lookup')) return Response.json(users ? { users } : {});
      if (url.endsWith('accounts:update'))
        return Response.json(
          updateStatus === 200 ? { localId: 'u1' } : { error: { message: 'WEAK_PASSWORD' } },
          {
            status: updateStatus,
          },
        );
      return new Response('?', { status: 404 });
    }) as typeof fetch;
    return { f, calls };
  }

  it('reads the service account JSON', () => {
    expect(parseServiceAccount(JSON.stringify(sa))?.project_id).toBe('iotcinzo');
    expect(parseServiceAccount('{bad')).toBeNull();
    expect(parseServiceAccount(undefined)).toBeNull();
  });

  it('looks the user up by phone email, then updates the password and signs out old sessions', async () => {
    const { f, calls } = fakeFetch([{ localId: 'u1' }]);
    const r = await setPasswordForPhone(sa, '9876543210', 'Ab3dEf7h', f);
    expect(r).toEqual({ ok: true });
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['token', 'accounts:lookup', 'accounts:update']);

    const assertion = new URLSearchParams(calls[0].body).get('assertion')!;
    const claims = decodeJwt(assertion);
    expect(claims.iss).toBe(sa.client_email);
    expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
    expect(claims.scope).toBe('https://www.googleapis.com/auth/identitytoolkit');

    expect(calls[1].url).toBe('https://identitytoolkit.googleapis.com/v1/projects/iotcinzo/accounts:lookup');
    expect(JSON.parse(calls[1].body)).toEqual({ email: [emailOfPhone('9876543210')] });
    expect(emailOfPhone('9876543210')).toBe('919876543210@users.relaxpump.app');
    expect(calls[1].auth).toBe('Bearer tok');
    const upd = JSON.parse(calls[2].body);
    expect(upd.localId).toBe('u1');
    expect(upd.password).toBe('Ab3dEf7h');
    expect(Number(upd.validSince)).toBeGreaterThan(1_700_000_000);
  });

  it('says when no account uses the phone, and does not update', async () => {
    const { f, calls } = fakeFetch(undefined);
    const r = await setPasswordForPhone(sa, '9876543210', 'Ab3dEf7h', f);
    expect(r).toMatchObject({ ok: false, reason: 'no-account' });
    expect(calls.some((c) => c.url.endsWith('accounts:update'))).toBe(false);
  });

  it('reports a Firebase refusal without leaking the password', async () => {
    const { f } = fakeFetch([{ localId: 'u1' }], 400);
    const r = await setPasswordForPhone(sa, '9876543210', 'Ab3dEf7h', f);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain('Ab3dEf7h');
  });

  it('reuses the token for the next call', async () => {
    const { f, calls } = fakeFetch([{ localId: 'u1' }]);
    await setPasswordForPhone(sa, '9876543210', 'Ab3dEf7h', f);
    await setPasswordForPhone(sa, '9876543211', 'Ab3dEf7h', f);
    expect(calls.filter((c) => c.url.includes('oauth2'))).toHaveLength(1);
  });
});
