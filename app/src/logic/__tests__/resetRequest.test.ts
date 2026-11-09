import { sendResetRequest } from '@/services/resetRequest';

jest.mock('expo-constants', () => ({ expoConfig: { extra: { WEB_API: 'https://web.test/' } } }));

const okFetch = jest.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 }));

describe('sendResetRequest', () => {
  beforeEach(() => okFetch.mockClear());

  it('posts name and phone to the website', async () => {
    const r = await sendResetRequest('  Lal   Ruati ', '9876543210', {
      fetchFn: okFetch as unknown as typeof fetch,
    });
    expect(r).toEqual({ ok: true });
    const [url, init] = okFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://web.test/api/reset-requests');
    expect(JSON.parse(String(init.body))).toEqual({ name: 'Lal Ruati', phone: '9876543210' });
  });

  it('checks the input before sending', async () => {
    expect(
      await sendResetRequest('', '9876543210', { fetchFn: okFetch as unknown as typeof fetch }),
    ).toMatchObject({
      ok: false,
    });
    expect(await sendResetRequest('Lal', '12345', { fetchFn: okFetch as unknown as typeof fetch })).toEqual({
      ok: false,
      error: 'Enter a 10-digit number',
    });
    expect(okFetch).not.toHaveBeenCalled();
  });

  it('shows the server message (e.g. too many requests)', async () => {
    const f = jest.fn(
      async () => new Response(JSON.stringify({ error: 'Too many requests today.' }), { status: 429 }),
    ) as unknown as typeof fetch;
    expect(await sendResetRequest('Lal', '9876543210', { fetchFn: f })).toEqual({
      ok: false,
      error: 'Too many requests today.',
    });
  });

  it('handles no internet', async () => {
    const f = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const r = await sendResetRequest('Lal', '9876543210', { fetchFn: f });
    expect(r.ok).toBe(false);
  });
});
