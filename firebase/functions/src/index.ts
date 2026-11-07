// NOT DEPLOYED — needs the Blaze plan. See docs/blaze-upgrade.md.
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getMessaging } from 'firebase-admin/messaging';
import { onValueCreated } from 'firebase-functions/v2/database';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();
const REGION = 'asia-southeast1';

const TEXT: Record<string, (t: number) => string> = {
  full: (t) => `Tank ${t + 1} is full`,
  low: (t) => `Tank ${t + 1} is low`,
  dry_run: (t) => `Pump stopped: Tank ${t + 1} not rising. Check the sump.`,
  timeout: () => 'Pump stopped: ran too long',
  sensor: (t) => `Tank ${t + 1} sensor error. Pump stopped.`,
};

/** Push a notification to the owner's phones when the controller logs an event. */
export const onDeviceEvent = onValueCreated(
  { ref: '/devices/{id}/events/{eventId}', region: REGION, instance: 'iotcinzo-default-rtdb' },
  async (e) => {
    const ev = e.data.val() as { type: string; tank: number };
    const text = TEXT[ev.type]?.(ev.tank);
    if (!text) return;
    const db = getDatabase();
    const owner = (await db.ref(`devices/${e.params.id}/info/ownerUid`).get()).val() as string | null;
    if (!owner) return;
    // The app would store FCM tokens at users/{uid}/fcm/{token}: true (add to rules when enabled).
    const tokens = Object.keys((await db.ref(`users/${owner}/fcm`).get()).val() ?? {});
    if (!tokens.length) return;
    await getMessaging().sendEachForMulticast({ tokens, notification: { title: 'RelaxPump', body: text } });
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
