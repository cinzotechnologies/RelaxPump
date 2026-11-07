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

const config = { tankCount: 3, low: 20, high: 95, maxRunMin: 30, tanks: [{ emptyCm: 120, fullCm: 30, litres: 1000 }] };
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
