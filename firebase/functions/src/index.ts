// NOT DEPLOYED — needs the Blaze plan. See docs/blaze-upgrade.md.
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getMessaging } from 'firebase-admin/messaging';
import { onValueCreated } from 'firebase-functions/v2/database';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();
const REGION = 'asia-southeast1';

type Ev = { type: string; tank: number; auto?: boolean; min?: number };

/** Same wording as the app's Notifications sheet. `tank` is the user's name or "Tank N". */
const TEXT: Record<string, (tank: string, ev: Ev) => { title: string; body: string } | null> = {
  full: (t) => ({ title: `${t} is full`, body: 'Pump stopped' }),
  low: (t) => ({ title: `${t} is low`, body: 'Below your start level' }),
  // Pump on/off: only when Auto did it — the user doesn't need a push for their own tap.
  pump_on: (t, ev) => (ev.auto ? { title: `Filling ${t}`, body: 'Auto started the pump' } : null),
  pump_off: (_t, ev) =>
    ev.auto
      ? { title: ev.min ? `Pump ran ${Math.round(ev.min)} min` : 'Pump stopped', body: 'Auto stopped the pump' }
      : null,
  dry_run: (t) => ({ title: 'Pump stopped', body: `${t} not rising. Check the sump.` }),
  timeout: () => ({ title: 'Pump stopped', body: 'Ran too long' }),
  sensor: (t) => ({ title: `${t} sensor error`, body: 'Pump stopped' }),
};

/** Push a notification to the owner's phones when the controller logs an event. */
export const onDeviceEvent = onValueCreated(
  { ref: '/devices/{id}/events/{eventId}', region: REGION, instance: 'iotcinzo-default-rtdb' },
  async (e) => {
    const ev = e.data.val() as Ev;
    if (!TEXT[ev.type]) return;
    const db = getDatabase();
    const id = e.params.id;
    const owner = (await db.ref(`devices/${id}/info/ownerUid`).get()).val() as string | null;
    if (!owner) return;
    const name = (await db.ref(`devices/${id}/config/tanks/${ev.tank}/name`).get()).val() as string | null;
    const msg = TEXT[ev.type](name?.trim() || `Tank ${ev.tank + 1}`, ev);
    if (!msg) return;
    // The app saves each phone's token at users/{uid}/fcm/{token}: true.
    const tokens = Object.keys((await db.ref(`users/${owner}/fcm`).get()).val() ?? {});
    if (!tokens.length) return;
    const res = await getMessaging().sendEachForMulticast({ tokens, notification: msg });
    // Forget tokens of uninstalled apps / signed-out phones.
    const dead: Record<string, null> = {};
    res.responses.forEach((r, i) => {
      const code = r.error?.code ?? '';
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument')
        dead[`users/${owner}/fcm/${tokens[i]}`] = null;
    });
    if (Object.keys(dead).length) await db.ref().update(dead);
  },
);

/** Keep the database small: drop events older than 30 days and usage older than a year. */
export const dailyCleanup = onSchedule({ schedule: 'every day 03:00', timeZone: 'Asia/Kolkata', region: REGION }, async () => {
  const db = getDatabase();
  const devices = (await db.ref('devices').get()).val() ?? {};
  const cutoff = Date.now() - 30 * 86400000;
  for (const id of Object.keys(devices)) {
    const old = await db.ref(`devices/${id}/events`).orderByChild('ts').endAt(cutoff).get();
    const del: Record<string, null> = {};
    old.forEach((c) => {
      del[`devices/${id}/events/${c.key}`] = null;
    });
    if (Object.keys(del).length) await db.ref().update(del);
  }
});
