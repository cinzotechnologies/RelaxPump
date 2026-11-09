import { exportPKCS8, generateKeyPair } from 'jose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { _resetTokenCache, type ServiceAccount } from '@/lib/firebase/identity';
import { type Cursors, pushText, runCleanup, runPush } from '@/lib/jobs/firebaseJobs';

let sa: ServiceAccount;
beforeAll(async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  sa = {
    project_id: 'iotcinzo',
    client_email: 'svc@x.iam.gserviceaccount.com',
    private_key: await exportPKCS8(privateKey),
  };
});
beforeEach(() => _resetTokenCache());

type Call = { url: string; method: string; body: string };
const DB = 'https://db.test';

/** A tiny fake of the RTDB REST API + FCM. */
function fake(data: Record<string, unknown>, fcmStatus: Record<string, number> = {}) {
  const calls: Call[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: String(init?.body ?? '') });
    if (url.host === 'oauth2.googleapis.com') return Response.json({ access_token: 'tok', expires_in: 3600 });
    if (url.host === 'fcm.googleapis.com') {
      const t = JSON.parse(String(init?.body)).message.token as string;
      return new Response('{}', { status: fcmStatus[t] ?? 200 });
    }
    const path = decodeURIComponent(url.pathname.replace(/\.json$/, '').slice(1));
    let node: unknown = path
      .split('/')
      .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], data);
    if (init?.method === 'PATCH') return Response.json({});
    if (url.searchParams.get('shallow') && node && typeof node === 'object') {
      node = Object.fromEntries(Object.keys(node).map((k) => [k, true]));
    }
    const start = url.searchParams.get('startAt');
    const end = url.searchParams.get('endAt');
    if ((start || end) && node && typeof node === 'object') {
      node = Object.fromEntries(
        Object.entries(node as Record<string, { ts: number }>).filter(
          ([, v]) => (!start || v.ts >= Number(start)) && (!end || v.ts <= Number(end)),
        ),
      );
    }
    return Response.json(node ?? null);
  }) as typeof fetch;
  return { f, calls };
}

const data = () => ({
  devices: {
    'RP-1': {
      info: { ownerUid: 'u1' },
      config: { tanks: [{ name: 'Roof' }, {}] },
      events: {
        a: { type: 'full', tank: 0, ts: 1000 },
        b: { type: 'pump_on', tank: 1, ts: 2000, auto: false }, // own tap: no push
        c: { type: 'dry_run', tank: 1, ts: 3000 },
      },
    },
  },
  users: { u1: { fcm: { tokA: true, tokDead: true } } },
});

describe('push job', () => {
  it('starts new controllers from now (no old history)', async () => {
    const { f, calls } = fake(data());
    let saved: Cursors = {};
    const r = await runPush({
      sa,
      dbUrl: DB,
      fetch: f,
      now: 5000,
      loadCursors: async () => ({}),
      saveCursors: async (c) => void (saved = c),
    });
    expect(r.sent).toBe(0);
    expect(saved).toEqual({ 'RP-1': 5000 });
    expect(calls.some((c) => c.url.includes('fcm'))).toBe(false);
  });

  it('pushes new events with tank names, skips own taps, drops dead tokens, moves the cursor', async () => {
    const { f, calls } = fake(data(), { tokDead: 404 });
    let saved: Cursors = {};
    const r = await runPush({
      sa,
      dbUrl: DB,
      fetch: f,
      now: 5000,
      loadCursors: async () => ({ 'RP-1': 500 }),
      saveCursors: async (c) => void (saved = c),
    });
    const sends = calls
      .filter((c) => c.url.includes('fcm.googleapis.com'))
      .map((c) => JSON.parse(c.body).message);
    expect(sends.filter((m) => m.token === 'tokA').map((m) => m.notification.title)).toEqual([
      'Roof is full',
      'Pump stopped',
    ]);
    expect(sends.find((m) => m.notification.body === 'Tank 2 not rising. Check the sump.')).toBeTruthy();
    expect(r.sent).toBe(2);
    expect(r.events).toBe(3);
    expect(saved['RP-1']).toBe(3000);
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toContain('/users/u1/fcm.json');
    expect(JSON.parse(patch!.body)).toEqual({ tokDead: null });
    expect(calls.every((c) => !c.url.includes('access_token=') || c.url.includes('access_token=tok'))).toBe(
      true,
    );
  });

  it('stays inside the request budget and resumes next time', async () => {
    const { f, calls } = fake(data());
    let saved: Cursors = {};
    await runPush({
      sa,
      dbUrl: DB,
      fetch: f,
      now: 5000,
      budget: 7,
      loadCursors: async () => ({ 'RP-1': 500 }),
      saveCursors: async (c) => void (saved = c),
    });
    expect(calls.length).toBeLessThanOrEqual(7);
    expect(saved['RP-1'] ?? 500).toBeLessThan(3000);
  });

  it('words every event like the app', () => {
    expect(pushText({ type: 'pump_off', tank: 0, ts: 1, auto: true, min: 12.4 }, 'Roof')).toEqual({
      title: 'Pump ran 12 min',
      body: 'Auto stopped the pump',
    });
    expect(pushText({ type: 'nope', tank: 0, ts: 1 }, 'x')).toBeNull();
  });
});

describe('cleanup job', () => {
  it('drops events older than 30 days and usage older than a year', async () => {
    const now = Date.UTC(2026, 10, 9);
    const day = 86_400_000;
    const { f, calls } = fake({
      devices: {
        'RP-1': {
          events: {
            old: { type: 'full', tank: 0, ts: now - 40 * day },
            fresh: { type: 'low', tank: 0, ts: now - day },
          },
          usage: { '2025-01-01': { litres: 1, pumpMin: 1 }, '2026-11-01': { litres: 1, pumpMin: 1 } },
        },
      },
    });
    const r = await runCleanup({ sa, dbUrl: DB, fetch: f, now });
    expect(r).toEqual({ events: 1, days: 1 });
    const patches = calls.filter((c) => c.method === 'PATCH').map((c) => JSON.parse(c.body));
    expect(patches).toEqual([{ old: null }, { '2025-01-01': null }]);
  });
});
