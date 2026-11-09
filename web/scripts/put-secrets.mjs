// Upload the Firebase secrets to the Workers (run by hand; never commit keys).
//   cd D:\RelaxPump-kit\web
//   node scripts/put-secrets.mjs
// Reads the service-account file and app/google-services.json locally and pipes each value to
// `wrangler secret put` — nothing is printed.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SA_FILE = process.env.SA_FILE ?? 'D:/keys/iotcinzo-admin.json';
const GS_FILE = new URL('../../app/google-services.json', import.meta.url);

const sa = JSON.stringify(JSON.parse(readFileSync(SA_FILE, 'utf8')));
const apiKey = JSON.parse(readFileSync(GS_FILE, 'utf8')).client[0].api_key[0].current_key;

const jobs = [
  ['FIREBASE_SERVICE_ACCOUNT', sa, ['--env', 'admin'], 'admin Worker (password resets)'],
  ['FIREBASE_SERVICE_ACCOUNT', sa, ['-c', 'jobs/wrangler.jsonc'], 'jobs Worker (push notifications)'],
  ['FIREBASE_WEB_API_KEY', apiKey, [], 'site Worker (delete account page)'],
];

let failed = 0;
for (const [name, value, extra, what] of jobs) {
  process.stdout.write(`${name} → ${what} … `);
  const r = spawnSync('npx', ['wrangler', 'secret', 'put', name, ...extra], {
    input: value,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    cwd: new URL('..', import.meta.url),
  });
  const ok = r.status === 0 && /Success/.test(`${r.stdout}${r.stderr}`);
  console.log(ok ? 'OK' : 'FAILED');
  if (!ok) {
    failed++;
    console.log((r.stderr || r.stdout || '').split('\n').slice(-5).join('\n'));
  }
}
process.exit(failed ? 1 : 0);
