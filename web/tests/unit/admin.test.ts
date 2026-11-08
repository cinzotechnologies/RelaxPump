import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock('@/lib/env', () => ({ envAsync: vi.fn(), env: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: vi.fn(), schema: {} }));

const { allowList, isLocalHost, verifyAccessJwt } = await import('@/lib/admin/auth');
const { whenLabel } = await import('@/lib/admin/data');
const { ago, initials, phoneFmt } = await import('@/components/admin/icons');

describe('admin auth helpers', () => {
  it('parses the allow-list case-insensitively', () => {
    expect(allowList(' A@X.com, b@y.com ,,')).toEqual(['a@x.com', 'b@y.com']);
    expect(allowList(undefined)).toEqual([]);
  });
  it('only treats loopback hosts as local', () => {
    expect(isLocalHost('localhost:3000')).toBe(true);
    expect(isLocalHost('127.0.0.1:8788')).toBe(true);
    expect(isLocalHost('relaxpump.cinzotechnologies.com')).toBe(false);
    expect(isLocalHost('localhost.evil.com')).toBe(false);
    expect(isLocalHost(null)).toBe(false);
  });
  it('rejects a junk Access token', async () => {
    expect(await verifyAccessJwt('not-a-jwt', 'team.cloudflareaccess.com', 'aud')).toBeNull();
  });
});

describe('admin formatting', () => {
  it('formats names, phones and times', () => {
    expect(initials('Lal Rina Khiangte')).toBe('LR');
    expect(phoneFmt('9876543210')).toBe('98765 43210');
    const now = Date.UTC(2026, 10, 9, 12, 0);
    expect(ago(now - 5 * 60000, now)).toBe('5 min ago');
    expect(ago(now - 2 * 3600000, now)).toBe('2 h ago');
    expect(ago(now - 30 * 3600000, now)).toBe('Yesterday');
    expect(whenLabel(null)).toBe('never');
    expect(whenLabel(now - 60000, now)).toMatch(/^today, /);
    expect(whenLabel(now - 3 * 86400000, now)).toMatch(/^6 Nov, /);
  });
});
