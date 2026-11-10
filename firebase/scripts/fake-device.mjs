// Pretend to be a controller so the app can be tested end to end without an ESP32.
// Signs in as the device account from firebase/out/<ID>/device.json (made by new-device),
// follows the same safety rules as the firmware, and writes state / events / usage.
//
//   npm run fake-device -- --id RP-3F2A9C
//   (add --fast to fill 10x faster)
import { readFileSync } from 'node:fs';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, increment, onValue, push, ref, remove, serverTimestamp, set, update } from 'firebase/database';

import { arg, DB_URL, DEVICE_DOMAIN } from './_admin.mjs';

const id = arg('id');
if (!id) {
  console.error('Usage: npm run fake-device -- --id RP-XXXXXX');
  process.exit(1);
}
const fast = process.argv.includes('--fast');
const dev = JSON.parse(readFileSync(new URL(`../out/${id}/device.json`, import.meta.url), 'utf8'));

const app = initializeApp({ apiKey: dev.apiKey, databaseURL: DB_URL, projectId: 'iotcinzo' });
await signInWithEmailAndPassword(getAuth(app), `${id.toLowerCase()}@${DEVICE_DOMAIN}`, dev.password);
const db = getDatabase(app);
const base = `devices/${id}`;
console.log(`Signed in as ${id}. Ctrl+C to stop.`);

// Timings from the firmware (CLAUDE.md §7).
const VALVE_LEAD_MS = 2000;
const PUMP_STOP_MS = 3000;
const COOLDOWN_MS = 60000;
const FILL_PER_S = fast ? 4 : 0.4; // % per second
const DRAIN_PER_S = 0.02;

// v2 customizable system: 1–5 tanks (one tank = no valve, the pump fills it directly) + optional
// main tank sensor (the pump never runs below main.minPct).
let cfg = { tankCount: 3, low: 20, high: 95, maxRunMin: 30, tanks: [], main: { enabled: false, minPct: 10 } };
const levels = [60, 35, 80, 50, 50];
const valves = Array(5).fill(false);
let mainPct = 70;
let pump = false;
let auto = true;
let msg = '';
let pumpStart = 0;
let lastStop = 0;
let busy = false; // in a valve-lead / stop sequence
let active = -1;
let pumpAuto = false;

const n = () => cfg.tankCount;
const single = () => n() === 1;
const mainLow = () => cfg.main?.enabled && mainPct < cfg.main.minPct;
const day = () => new Date().toISOString().slice(0, 10);
const event = (type, tank, extra = {}) =>
  push(ref(db, `${base}/events`), { type, tank, ts: Date.now(), ...extra }).catch((e) => console.error(e.message));

async function pushState() {
  await set(ref(db, `${base}/state`), {
    online: true,
    lastSeen: serverTimestamp(),
    rssi: -55 - Math.round(Math.random() * 8),
    ssid: 'FakeWiFi',
    pump,
    auto,
    msg,
    active: pump ? active : null,
    tanks: Array.from({ length: n() }, (_, i) => ({ pct: Math.round(levels[i]), valve: !single() && valves[i], ok: true })),
    main: cfg.main?.enabled ? { pct: Math.round(mainPct), ok: true } : null,
    detected: { tanks: [0, 1, 2, 3, 4].map((i) => i < n()), main: !!cfg.main?.enabled },
  }).catch((e) => console.error('state:', e.message));
}

async function startFill(t, isAuto) {
  if (busy) return;
  if (mainLow()) {
    msg = 'Main tank low';
    event('main_low', -1);
    return;
  }
  busy = true;
  valves.fill(false);
  if (!single()) valves[t] = true; // one tank: no valve, pump on at once
  await pushState();
  setTimeout(async () => {
    pump = true;
    active = t;
    pumpAuto = isAuto;
    pumpStart = Date.now();
    busy = false;
    msg = '';
    event('pump_on', t, { auto: isAuto });
    console.log(`Pump ON → Tank ${t + 1}`);
    await pushState();
  }, single() ? 0 : VALVE_LEAD_MS);
}

async function stopPump(reason) {
  if (!pump || busy) return;
  busy = true;
  pump = false;
  const t = active;
  const min = (Date.now() - pumpStart) / 60000;
  await pushState();
  event('pump_off', Math.max(0, t), { auto: pumpAuto, min: Math.round(min * 10) / 10 });
  if (reason) event(reason, Math.max(0, t));
  const litres = (cfg.tanks[t]?.litres || 0) * (FILL_PER_S * min * 60) / 100;
  update(ref(db, `${base}/usage/${day()}`), {
    litres: increment(Math.round(litres)),
    pumpMin: increment(Math.round(min * 10) / 10),
    [`perTank/${Math.max(0, t)}/litres`]: increment(Math.round(litres)),
    [`perTank/${Math.max(0, t)}/pumpMin`]: increment(Math.round(min * 10) / 10),
  }).catch((e) => console.error('usage:', e.message));
  console.log(`Pump OFF${reason ? ` (${reason})` : ''}`);
  setTimeout(async () => {
    valves.fill(false);
    active = -1;
    lastStop = Date.now();
    busy = false;
    await pushState();
  }, PUMP_STOP_MS);
}

onValue(ref(db, `${base}/config`), (s) => {
  if (s.exists()) {
    const v = s.val();
    cfg = { ...cfg, ...v };
  }
  console.log(`Config: ${cfg.tankCount} tanks, start <${cfg.low}%, stop ${cfg.high}%`);
});

onValue(ref(db, `${base}/cmd`), async (s) => {
  const c = s.val();
  if (!c) return;
  await remove(ref(db, `${base}/cmd`)).catch(() => {});
  msg = '';
  if (typeof c.auto === 'boolean') auto = c.auto;
  if (typeof c.pump === 'boolean') {
    auto = false;
    if (c.pump && !pump) {
      const open = single() ? 0 : valves.findIndex(Boolean);
      if (open < 0) msg = 'Open a valve first';
      else if (mainLow()) msg = 'Main tank low';
      else {
        pump = true;
        active = open;
        pumpAuto = false;
        pumpStart = Date.now();
        event('pump_on', open, { auto: false });
      }
    } else if (!c.pump) await stopPump();
  }
  if (c.valve) {
    const { i, open } = c.valve;
    auto = false;
    const openCount = valves.filter(Boolean).length;
    if (!open && pump && openCount === 1 && valves[i]) await stopPump();
    else if (i < n() && !single()) {
      valves[i] = open;
      if (pump && open) active = i;
    }
  }
  console.log('Command:', JSON.stringify(c));
  await pushState();
});

let tick = 0;
setInterval(async () => {
  for (let i = 0; i < n(); i++) if (!(pump && i === active)) levels[i] = Math.max(0, levels[i] - DRAIN_PER_S);
  if (pump && active >= 0) {
    levels[active] = Math.min(100, levels[active] + FILL_PER_S);
    mainPct = Math.max(0, mainPct - FILL_PER_S / 4);
    if (mainLow()) {
      event('main_low', -1);
      msg = 'Main tank low';
      await stopPump();
    } else if (levels[active] >= cfg.high) {
      event('full', active);
      await stopPump();
    } else if (Date.now() - pumpStart > cfg.maxRunMin * 60000) {
      await stopPump('timeout');
    }
  } else if (cfg.main?.enabled && mainPct < 100) mainPct = Math.min(100, mainPct + 0.05);
  if (!pump && auto && !busy && !mainLow() && Date.now() - lastStop > (lastStop ? COOLDOWN_MS : 0)) {
    let low = -1;
    for (let i = 0; i < n(); i++) if (levels[i] < cfg.low && (low < 0 || levels[i] < levels[low])) low = i;
    if (low >= 0) {
      event('low', low);
      await startFill(low, true);
    }
  }
  if (++tick % 3 === 0) await pushState();
}, 1000);

process.on('SIGINT', async () => {
  await update(ref(db, `${base}/state`), { online: false, pump: false }).catch(() => {});
  process.exit(0);
});
