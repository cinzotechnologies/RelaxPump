// Security rules tests — run with `npm test` (starts the Realtime Database emulator).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, remove, set, update } from 'firebase/database';

const ID = 'RP-3F2A9C';
const CODE = 'K7QM2XPA9TRD';
const hash = (id, code) => createHash('sha256').update(`${id}:${code}`).digest('hex');
const DEVICE_EMAIL = `${ID.toLowerCase()}@devices.relaxpump.app`;

const t0 = { emptyCm: 120, fullCm: 30, litres: 1000 };
const config = { tankCount: 3, low: 20, high: 95, maxRunMin: 30, tanks: [t0, t0, t0] };
const state = { online: true, lastSeen: 1, rssi: -55, ssid: 'Home', pump: false, auto: true, msg: '', tanks: [] };

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-relaxpump',
    database: { rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `claims/${ID}`), { codeHash: hash(ID, CODE) });
    await set(ref(db, `devices/${ID}`), { info: { name: 'RelaxPump Controller', fw: '1.0.0', maxTanks: 3 }, config });
    await set(ref(db, 'users/alice'), { name: 'Alice', phone: '9876543210', createdAt: 1 });
    await set(ref(db, 'users/bob'), { name: 'Bob', phone: '9123456789', createdAt: 1 });
  });
});

const user = (uid) => env.authenticatedContext(uid).database();
const device = (verified = true, email = DEVICE_EMAIL) =>
  env.authenticatedContext('dev-uid', { email, email_verified: verified }).database();

async function claim(db, uid, code = CODE) {
  return update(ref(db), {
    [`claimAttempts/${ID}/${uid}`]: hash(ID, code),
    [`devices/${ID}/info/ownerUid`]: uid,
    [`users/${uid}/devices/${ID}`]: true,
  });
}

async function giveTo(uid) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), `devices/${ID}/info/ownerUid`), uid);
    await set(ref(ctx.database(), `users/${uid}/devices/${ID}`), true);
  });
}

describe('users', () => {
  it('a user reads and writes only their own profile', async () => {
    await assertSucceeds(get(ref(user('alice'), 'users/alice')));
    await assertSucceeds(set(ref(user('alice'), 'users/alice/name'), 'Alice Home'));
    await assertFails(get(ref(user('alice'), 'users/bob')));
    await assertFails(set(ref(user('alice'), 'users/bob/name'), 'x'));
    await assertFails(get(ref(env.unauthenticatedContext().database(), 'users/alice')));
  });
  it('validates name and phone', async () => {
    await assertFails(set(ref(user('alice'), 'users/alice/phone'), '12345'));
    await assertFails(set(ref(user('alice'), 'users/alice/name'), 'x'.repeat(41)));
  });

  it('saves and removes own push tokens only', async () => {
    const tok = 'fAbc123:APA91b-xyz_9';
    await assertSucceeds(set(ref(user('alice'), `users/alice/fcm/${tok}`), true));
    await assertFails(set(ref(user('alice'), `users/alice/fcm/${tok}`), 'yes'));
    await assertFails(set(ref(user('bob'), `users/alice/fcm/${tok}`), true));
    await assertSucceeds(set(ref(user('alice'), `users/alice/fcm/${tok}`), null));
  });
  it('cannot list a device it does not own', async () => {
    await assertFails(set(ref(user('alice'), `users/alice/devices/${ID}`), true));
  });
});

describe('claiming', () => {
  it('nobody can read claims or claim attempts', async () => {
    await assertFails(get(ref(user('alice'), `claims/${ID}`)));
    await assertFails(get(ref(device(), `claims/${ID}`)));
    await assertFails(get(ref(user('alice'), `claimAttempts/${ID}/alice`)));
  });
  it('fails with the wrong code', async () => {
    await assertFails(claim(user('alice'), 'alice', 'WRONGCODE1'));
  });
  it('succeeds with the right code while the device has no owner', async () => {
    await assertSucceeds(claim(user('alice'), 'alice'));
    await assertSucceeds(get(ref(user('alice'), `devices/${ID}`)));
  });
  it('a second user cannot take an owned device, even with the code', async () => {
    await assertSucceeds(claim(user('alice'), 'alice'));
    await assertFails(claim(user('bob'), 'bob'));
  });
  it('a user cannot set ownerUid for someone else', async () => {
    await assertFails(
      update(ref(user('alice')), {
        [`claimAttempts/${ID}/alice`]: hash(ID, CODE),
        [`devices/${ID}/info/ownerUid`]: 'bob',
      }),
    );
  });
  it('the owner can release the device', async () => {
    await giveTo('alice');
    await assertSucceeds(remove(ref(user('alice'), `devices/${ID}/info/ownerUid`)));
  });
});

describe('owner', () => {
  beforeEach(() => giveTo('alice'));

  it('reads the device; strangers cannot', async () => {
    await assertSucceeds(get(ref(user('alice'), `devices/${ID}`)));
    await assertFails(get(ref(user('bob'), `devices/${ID}`)));
    await assertFails(get(ref(user('bob'), `devices/${ID}/state`)));
  });
  it('writes valid config and rejects bad values', async () => {
    const db = user('alice');
    await assertSucceeds(set(ref(db, `devices/${ID}/config`), { ...config, low: 30, high: 90 }));
    await assertFails(set(ref(db, `devices/${ID}/config`), { ...config, low: 90, high: 95 }));
    await assertFails(set(ref(db, `devices/${ID}/config`), { ...config, low: 50, high: 55 }));
    await assertFails(set(ref(db, `devices/${ID}/config`), { ...config, tankCount: 4 }));
    await assertFails(set(ref(user('bob'), `devices/${ID}/config`), config));
  });

  it('accepts a tank name up to 14 characters', async () => {
    const db = user('alice');
    const named = (name) => ({ ...config, tanks: [{ ...t0, name }, t0, t0] });
    await assertSucceeds(set(ref(db, `devices/${ID}/config`), named('Kitchen roof')));
    await assertFails(set(ref(db, `devices/${ID}/config`), named('A very long tank name')));
    await assertFails(set(ref(db, `devices/${ID}/config`), named(42)));
  });
  it('sends commands but cannot fake device state, events or usage', async () => {
    const db = user('alice');
    await assertSucceeds(set(ref(db, `devices/${ID}/cmd`), { pump: true, ts: Date.now() }));
    await assertSucceeds(set(ref(db, `devices/${ID}/cmd`), { valve: { i: 1, open: true }, ts: Date.now() }));
    await assertFails(set(ref(db, `devices/${ID}/cmd`), { pump: 'yes', ts: Date.now() }));
    await assertFails(set(ref(db, `devices/${ID}/state`), state));
    await assertFails(set(ref(db, `devices/${ID}/events/e1`), { type: 'full', tank: 0, ts: 1 }));
    await assertFails(set(ref(db, `devices/${ID}/usage/2026-11-07`), { litres: 1, pumpMin: 1 }));
    await assertFails(set(ref(db, `devices/${ID}/info/maxTanks`), 8));
  });
  it('strangers cannot send commands', async () => {
    await assertFails(set(ref(user('bob'), `devices/${ID}/cmd`), { pump: true, ts: Date.now() }));
  });
});

// ---------------------------------------------------------------- v2 customizable system (1–5 tanks)
const tank = (o = {}) => ({ name: 'Roof', litres: 1000, emptyCm: 120, fullCm: 30, heightFt: 20, ...o });
const v2 = (n, o = {}) => ({
  tankCount: n,
  tanks: Array.from({ length: n }, () => tank()),
  low: 20,
  high: 95,
  maxRunMin: 30,
  main: { enabled: false, minPct: 10 },
  ...o,
});
const pinHash = (pin) => hash(ID, `pin:${pin}`); // sha256("<id>:pin:<pin>")

async function maxTanks(n = 5) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await update(ref(ctx.database(), `devices/${ID}/info`), { maxTanks: n });
  });
}
async function setPin(pin) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), `installerPins/${ID}`), { hash: pinHash(pin) });
  });
}
const attempt = (db, uid, pin, ts = Date.now()) => set(ref(db, `pinAttempts/${ID}/${uid}`), { hash: pinHash(pin), ts });

describe('v2 layout validation', () => {
  beforeEach(async () => {
    await giveTo('alice');
    await maxTanks(5);
  });
  const save = (cfg) => set(ref(user('alice'), `devices/${ID}/config`), cfg);

  it('accepts 1 to 5 tanks', async () => {
    for (const n of [1, 2, 3, 4, 5]) await assertSucceeds(save(v2(n)));
  });
  it('rejects 0 or 6 tanks', async () => {
    await assertFails(save(v2(0)));
    await assertFails(save({ ...v2(5), tankCount: 6, tanks: Array.from({ length: 6 }, () => tank()) }));
  });
  it('tanks length must equal tankCount', async () => {
    await assertFails(save({ ...v2(3), tankCount: 2 })); // one tank too many
    await assertFails(save({ ...v2(2), tankCount: 3 })); // one tank missing
    await assertFails(save({ ...v2(3), tanks: { 0: tank(), 2: tank(), 3: tank() } }));
  });
  it('never more tanks than the firmware reports', async () => {
    await maxTanks(3);
    await assertSucceeds(save(v2(3)));
    await assertFails(save(v2(4)));
  });
  it('main tank sensor: minPct 5–40', async () => {
    const main = (o) => v2(2, { main: { enabled: true, minPct: 10, emptyCm: 200, fullCm: 30, litres: 5000, ...o } });
    await assertSucceeds(save(main({})));
    await assertSucceeds(save(main({ minPct: 40 })));
    await assertFails(save(main({ minPct: 4 })));
    await assertFails(save(main({ minPct: 45 })));
    await assertFails(save(v2(2, { main: { enabled: true } })));
  });
  it('a single field write cannot break the length rule', async () => {
    await assertSucceeds(save(v2(2)));
    await assertFails(set(ref(user('alice'), `devices/${ID}/config/tankCount`), 3));
    await assertFails(set(ref(user('alice'), `devices/${ID}/config/tanks/1`), null));
    await assertFails(set(ref(user('alice'), `devices/${ID}/config/tanks/2`), tank()));
  });
  it('rejects the old 8-tank / PHE fields and unknown fields', async () => {
    await assertFails(save(v2(1, { phe: { enabled: false, probeMin: 4, retryMin: 30 } })));
    await assertFails(save(v2(1, { mode: 'pump' })));
    await assertFails(save(v2(1, { semi: [tank()] })));
    await assertFails(save({ ...v2(1), tanks: [tank({ sensor: true })] }));
    await assertFails(save(v2(1, { installerPinHash: 'x' })));
  });
});

describe('installer PIN', () => {
  beforeEach(async () => {
    await giveTo('alice');
    await maxTanks(5);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), `devices/${ID}/config`), v2(2));
    });
  });
  const layout = (db) => update(ref(db, `devices/${ID}/config`), { tankCount: 3, 'tanks/2': tank({ name: 'Garden' }) });

  it('first setup: the owner sets the PIN, strangers cannot', async () => {
    await assertFails(set(ref(user('bob'), `installerPins/${ID}`), { hash: pinHash('1234') }));
    await assertSucceeds(set(ref(user('alice'), `installerPins/${ID}`), { hash: pinHash('1234') }));
    await assertFails(set(ref(user('alice'), `installerPins/${ID}`), { hash: 'short' }));
  });
  it('the PIN hash can never be read', async () => {
    await setPin('1234');
    await assertFails(get(ref(user('alice'), `installerPins/${ID}`)));
    await assertFails(get(ref(device(), `installerPins/${ID}`)));
    await assertFails(get(ref(user('alice'), `pinAttempts/${ID}/alice`)));
  });
  it('with a PIN set, the layout needs a fresh correct attempt', async () => {
    await setPin('1234');
    const db = user('alice');
    await assertFails(layout(db));
    await assertSucceeds(attempt(db, 'alice', '9999'));
    await assertFails(set(ref(db, `pinChecks/${ID}/alice`), Date.now()));
    await assertFails(layout(db));
    await assertSucceeds(attempt(db, 'alice', '1234'));
    await assertSucceeds(set(ref(db, `pinChecks/${ID}/alice`), Date.now()));
    await assertSucceeds(layout(db));
  });
  it('an old attempt cannot be written', async () => {
    await assertFails(attempt(user('alice'), 'alice', '1234', Date.now() - 10 * 60000));
    await assertFails(attempt(user('bob'), 'alice', '1234'));
  });
  it('pinCheck succeeds with no PIN set (first setup)', async () => {
    await assertSucceeds(set(ref(user('alice'), `pinChecks/${ID}/alice`), Date.now()));
    await assertFails(set(ref(user('bob'), `pinChecks/${ID}/bob`), Date.now()));
  });
  it('changing the PIN needs the old one', async () => {
    await setPin('1234');
    const db = user('alice');
    await assertFails(set(ref(db, `installerPins/${ID}`), { hash: pinHash('5555') }));
    await attempt(db, 'alice', '1234');
    await assertSucceeds(set(ref(db, `installerPins/${ID}`), { hash: pinHash('5555') }));
    await assertFails(set(ref(db, `installerPins/${ID}`), null));
  });
  it('customer fields need no PIN: names, litres, low/high', async () => {
    await setPin('1234');
    const db = user('alice');
    await assertSucceeds(set(ref(db, `devices/${ID}/config/tanks/1/name`), 'Kitchen'));
    await assertSucceeds(set(ref(db, `devices/${ID}/config/tanks/1/litres`), 500));
    await assertSucceeds(set(ref(db, `devices/${ID}/config/main/litres`), 5000));
    await assertSucceeds(set(ref(db, `devices/${ID}/config/low`), 30));
    await assertSucceeds(set(ref(db, `devices/${ID}/config/high`), 90));
    await assertFails(set(ref(db, `devices/${ID}/config/tanks/1/emptyCm`), 150));
    await assertFails(set(ref(db, `devices/${ID}/config/tanks/1/heightFt`), 40));
    await assertFails(set(ref(db, `devices/${ID}/config/main/enabled`), true));
    await assertFails(set(ref(db, `devices/${ID}/config/maxRunMin`), 60));
    await assertFails(set(ref(user('bob'), `devices/${ID}/config/tanks/1/name`), 'x'));
  });
});

describe('v2 commands, events and device info', () => {
  beforeEach(async () => {
    await giveTo('alice');
    await maxTanks(5);
  });
  const cmd = (c) => set(ref(user('alice'), `devices/${ID}/cmd`), { ...c, ts: Date.now() });

  it('accepts valve 0–4, test V1–V5 / PUMP, pumpCheck, auto', async () => {
    await assertSucceeds(cmd({ valve: { i: 4, open: true } }));
    await assertSucceeds(cmd({ test: { port: 'V5', ms: 1000 } }));
    await assertSucceeds(cmd({ test: { port: 'PUMP', ms: 2000 } }));
    await assertSucceeds(cmd({ pumpCheck: true }));
    await assertSucceeds(cmd({ auto: false }));
  });
  it('rejects valve 5, V6, PHE, long pulses and the old fill command', async () => {
    await assertFails(cmd({ valve: { i: 5, open: true } }));
    await assertFails(cmd({ test: { port: 'V6', ms: 1000 } }));
    await assertFails(cmd({ test: { port: 'PHE', ms: 1000 } }));
    await assertFails(cmd({ test: { port: 'PUMP', ms: 5000 } }));
    await assertFails(cmd({ phe: true }));
    await assertFails(cmd({ fill: { i: 0, src: 'pump' } }));
  });
  it('device writes the event types; PHE events are gone', async () => {
    for (const type of ['main_low', 'board_error', 'check_done', 'dry_run']) {
      await assertSucceeds(set(ref(device(), `devices/${ID}/events/${type}`), { type, tank: -1, ts: 1 }));
    }
    await assertFails(set(ref(device(), `devices/${ID}/events/p`), { type: 'phe_on', tank: -1, ts: 1 }));
  });
  it('device reports fw, board and maxTanks ≤ 5; the owner cannot', async () => {
    const db = device();
    await assertSucceeds(set(ref(db, `devices/${ID}/info/fw`), '2.1.0'));
    await assertSucceeds(set(ref(db, `devices/${ID}/info/board`), 'v1'));
    await assertSucceeds(set(ref(db, `devices/${ID}/info/maxTanks`), 5));
    await assertFails(set(ref(db, `devices/${ID}/info/maxTanks`), 8));
    await assertFails(set(ref(db, `devices/${ID}/info/ports`), { sensors: 5 }));
    await assertFails(set(ref(user('alice'), `devices/${ID}/info/maxTanks`), 5));
  });
  it('the device can never write config', async () => {
    await assertFails(set(ref(device(), `devices/${ID}/config`), v2(1)));
    await assertFails(set(ref(device(), `devices/${ID}/config/tankCount`), 1));
  });
});

describe('device account', () => {
  it('writes its own state, events and usage', async () => {
    const db = device();
    await assertSucceeds(set(ref(db, `devices/${ID}/state`), state));
    await assertSucceeds(set(ref(db, `devices/${ID}/events/e1`), { type: 'full', tank: 2, ts: 1 }));
    await assertSucceeds(set(ref(db, `devices/${ID}/usage/2026-11-07`), { litres: 120, pumpMin: 25, perTank: [] }));
  });
  it('events are append-only', async () => {
    const db = device();
    await assertSucceeds(set(ref(db, `devices/${ID}/events/e1`), { type: 'full', tank: 2, ts: 1 }));
    await assertFails(set(ref(db, `devices/${ID}/events/e1`), { type: 'low', tank: 2, ts: 2 }));
    await assertFails(set(ref(db, `devices/${ID}/events/e2`), { type: 'boom', tank: 2, ts: 2 }));
  });
  it('reads config and cmd, deletes cmd, cannot write them', async () => {
    await giveTo('alice');
    await set(ref(user('alice'), `devices/${ID}/cmd`), { pump: true, ts: Date.now() });
    const db = device();
    await assertSucceeds(get(ref(db, `devices/${ID}/config`)));
    await assertSucceeds(get(ref(db, `devices/${ID}/cmd`)));
    await assertSucceeds(remove(ref(db, `devices/${ID}/cmd`)));
    await assertFails(set(ref(db, `devices/${ID}/cmd`), { pump: true, ts: Date.now() }));
    await assertFails(set(ref(db, `devices/${ID}/config`), config));
  });
  it('cannot change ownership or read events of other devices', async () => {
    const db = device();
    await assertFails(set(ref(db, `devices/${ID}/info/ownerUid`), 'dev-uid'));
    await assertFails(set(ref(db, `devices/RP-000001/state`), state));
    await assertFails(get(ref(db, `devices/${ID}/events`)));
  });
  it('an unverified look-alike account is not the device', async () => {
    await assertFails(set(ref(device(false), `devices/${ID}/state`), state));
    await assertFails(get(ref(device(false), `devices/${ID}/cmd`)));
  });
});
