// relaxpump-jobs: Cloudflare cron Worker (see wrangler.jsonc next to this file).
//   "* * * * *"  → push notifications for new controller events
//   "30 21 * * *" (03:00 IST) → clean old events / usage days, and old handled password requests
import { runCleanup, runPush, type Cursors } from '../lib/jobs/firebaseJobs';
import { parseServiceAccount } from '../lib/firebase/identity';

type Env = { DB: D1Database; FIREBASE_SERVICE_ACCOUNT?: string; FIREBASE_DB_URL: string };

const CURSOR_KEY = 'push_cursors';
const DAILY = '30 21 * * *';

async function loadCursors(env: Env): Promise<Cursors> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
    .bind(CURSOR_KEY)
    .first<{ value: string }>();
  try {
    return row ? (JSON.parse(row.value) as Cursors) : {};
  } catch {
    return {};
  }
}

async function saveCursors(env: Env, c: Cursors) {
  await env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2',
  )
    .bind(CURSOR_KEY, JSON.stringify(c))
    .run();
}

export default {
  async scheduled(ctrl: ScheduledController, env: Env): Promise<void> {
    const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
    if (!sa) {
      console.warn('relaxpump-jobs: FIREBASE_SERVICE_ACCOUNT is not set');
      return;
    }
    const base = { sa, dbUrl: env.FIREBASE_DB_URL, fetch: fetch.bind(globalThis), now: Date.now() };
    if (ctrl.cron === DAILY) {
      const r = await runCleanup(base);
      // handled password requests: keep 6 months (privacy policy)
      await env.DB.prepare("DELETE FROM reset_requests WHERE status = 'done' AND handled_at < ?")
        .bind(Date.now() - 183 * 86_400_000)
        .run();
      console.log('cleanup', r);
      return;
    }
    const r = await runPush({
      ...base,
      loadCursors: () => loadCursors(env),
      saveCursors: (c) => saveCursors(env, c),
    });
    if (r.events) console.log('push', r);
  },

  async fetch(): Promise<Response> {
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
