// Background jobs on Cloudflare cron instead of Cloud Functions (no Blaze plan needed):
//   * every minute — push a notification for each new controller event (FCM HTTP v1)
//   * daily — drop events older than 30 days and usage days older than a year
// Same behaviour as firebase/functions/src/index.ts. Reads and writes the Realtime Database over
// REST with a service-account token. Pure: everything comes in through `JobDeps`.
import { accessToken, type ServiceAccount } from '../firebase/identity';

export const JOB_SCOPE = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/firebase.messaging',
].join(' ');

export type Ev = { type: string; tank: number; ts: number; auto?: boolean; min?: number };

/** Same wording as the app's Notifications sheet. */
export function pushText(ev: Ev, tank: string): { title: string; body: string } | null {
  switch (ev.type) {
    case 'full':
      return { title: `${tank} is full`, body: 'Pump stopped' };
    case 'low':
      return { title: `${tank} is low`, body: 'Below your start level' };
    case 'pump_on':
      return ev.auto ? { title: `Filling ${tank}`, body: 'Auto started the pump' } : null;
    case 'pump_off':
      return ev.auto
        ? {
            title: ev.min ? `Pump ran ${Math.round(ev.min)} min` : 'Pump stopped',
            body: 'Auto stopped the pump',
          }
        : null;
    case 'dry_run':
      return { title: 'Pump stopped', body: `${tank} not rising. Check the sump.` };
    case 'timeout':
      return { title: 'Pump stopped', body: 'Ran too long' };
    case 'sensor':
      return { title: `${tank} sensor error`, body: 'Pump stopped' };
    default:
      return null;
  }
}

/** Per-device "last event ts already handled". */
export type Cursors = Record<string, number>;

export type JobDeps = {
  sa: ServiceAccount;
  dbUrl: string;
  fetch: typeof fetch;
  now: number;
  loadCursors: () => Promise<Cursors>;
  saveCursors: (c: Cursors) => Promise<void>;
  /** Free Workers allow 50 outgoing requests per run; stop before that and carry on next minute. */
  budget?: number;
};

class Budget {
  used = 0;
  constructor(
    private f: typeof fetch,
    private max: number,
  ) {}
  get left() {
    return this.max - this.used;
  }
  call: typeof fetch = (input, init) => {
    if (this.used >= this.max) return Promise.reject(new Error('budget'));
    this.used++;
    return this.f(input, init);
  };
}

const enc = (s: string) => encodeURIComponent(s);

function rtdb(dbUrl: string, token: string, b: Budget) {
  const base = dbUrl.replace(/\/$/, '');
  const url = (path: string, q = '') => `${base}/${path}.json?access_token=${enc(token)}${q}`;
  return {
    async get<T>(path: string, q = ''): Promise<T | null> {
      const r = await b.call(url(path, q));
      if (!r.ok) throw new Error(`RTDB GET ${path} ${r.status}`);
      return (await r.json()) as T | null;
    },
    async patch(path: string, body: Record<string, null>) {
      const r = await b.call(url(path), { method: 'PATCH', body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`RTDB PATCH ${path} ${r.status}`);
    },
  };
}

/** Push new events to their owners' phones. Returns how many notifications were sent. */
export async function runPush(d: JobDeps): Promise<{ sent: number; events: number; devices: number }> {
  const b = new Budget(d.fetch, d.budget ?? 45);
  const token = await accessToken(d.sa, b.call, JOB_SCOPE);
  const db = rtdb(d.dbUrl, token, b);
  const cursors = await d.loadCursors();
  const ids = Object.keys((await db.get<Record<string, true>>('devices', '&shallow=true')) ?? {}).sort();
  let sent = 0;
  let events = 0;
  let changed = false;

  for (const id of ids) {
    if (b.left < 6) break; // the rest next minute
    if (cursors[id] === undefined) {
      // first time we see this controller: start from now, never push old history
      cursors[id] = d.now;
      changed = true;
      continue;
    }
    const q = `&orderBy=${enc('"ts"')}&startAt=${cursors[id] + 1}&limitToFirst=10`;
    const evs = Object.values((await db.get<Record<string, Ev>>(`devices/${enc(id)}/events`, q)) ?? {})
      .filter((e) => typeof e?.ts === 'number')
      .sort((a, c) => a.ts - c.ts);
    if (!evs.length) continue;

    const owner = await db.get<string>(`devices/${enc(id)}/info/ownerUid`);
    const names = owner
      ? ((await db.get<{ name?: string }[] | Record<string, { name?: string }>>(
          `devices/${enc(id)}/config/tanks`,
        )) ?? {})
      : {};
    const tokens = owner
      ? Object.keys((await db.get<Record<string, true>>(`users/${enc(owner)}/fcm`, '&shallow=true')) ?? {})
      : [];
    const dead: Record<string, null> = {};

    for (const ev of evs) {
      const name =
        (names as Record<string, { name?: string }>)[String(ev.tank)]?.name?.trim() || `Tank ${ev.tank + 1}`;
      const msg = pushText(ev, name);
      if (msg && tokens.length) {
        if (b.left < tokens.length + 2) break; // keep this event for the next run
        for (const t of tokens) {
          if (dead[t] !== undefined) continue;
          const r = await b.call(
            `https://fcm.googleapis.com/v1/projects/${enc(d.sa.project_id)}/messages:send`,
            {
              method: 'POST',
              headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
              body: JSON.stringify({
                message: { token: t, notification: msg, android: { priority: 'HIGH' } },
              }),
            },
          );
          if (r.ok) sent++;
          else if (r.status === 404 || r.status === 400) dead[t] = null; // uninstalled / signed out
        }
      }
      cursors[id] = ev.ts;
      changed = true;
      events++;
    }
    if (owner && Object.keys(dead).length && b.left > 0) {
      await db.patch(`users/${enc(owner)}/fcm`, dead).catch(() => {});
    }
  }

  // forget controllers that no longer exist
  for (const k of Object.keys(cursors)) {
    if (!ids.includes(k)) {
      delete cursors[k];
      changed = true;
    }
  }
  if (changed) await d.saveCursors(cursors);
  return { sent, events, devices: ids.length };
}

const DAY = 86_400_000;

/** Keep the database small: events > 30 days and usage > 1 year go. */
export async function runCleanup(
  d: Omit<JobDeps, 'loadCursors' | 'saveCursors'>,
): Promise<{ events: number; days: number }> {
  const b = new Budget(d.fetch, d.budget ?? 45);
  const token = await accessToken(d.sa, b.call, JOB_SCOPE);
  const db = rtdb(d.dbUrl, token, b);
  const ids = Object.keys((await db.get<Record<string, true>>('devices', '&shallow=true')) ?? {});
  const evCut = d.now - 30 * DAY;
  const dayCut = new Date(d.now - 366 * DAY).toISOString().slice(0, 10);
  let events = 0;
  let days = 0;
  for (const id of ids) {
    if (b.left < 4) break;
    const old = await db.get<Record<string, unknown>>(
      `devices/${enc(id)}/events`,
      `&orderBy=${enc('"ts"')}&endAt=${evCut}&limitToFirst=500`,
    );
    const evDel = Object.fromEntries(Object.keys(old ?? {}).map((k) => [k, null] as const));
    if (Object.keys(evDel).length) {
      await db.patch(`devices/${enc(id)}/events`, evDel);
      events += Object.keys(evDel).length;
    }
    const usage = Object.keys(
      (await db.get<Record<string, true>>(`devices/${enc(id)}/usage`, '&shallow=true')) ?? {},
    );
    const dayDel = Object.fromEntries(usage.filter((k) => k < dayCut).map((k) => [k, null] as const));
    if (Object.keys(dayDel).length) {
      await db.patch(`devices/${enc(id)}/usage`, dayDel);
      days += Object.keys(dayDel).length;
    }
  }
  return { events, days };
}
