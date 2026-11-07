import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';

// Local notifications for controller events while the app is running.
// Push (FCM) when the app is closed needs Cloud Functions → Blaze plan (docs/blaze-upgrade.md).
let ready: Promise<boolean> | null = null;

function setup(): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      try {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
        await Notifications.setNotificationChannelAsync('events', {
          name: 'Tank events',
          importance: AndroidImportance.DEFAULT,
        });
        const p = await Notifications.getPermissionsAsync();
        if (p.granted) return true;
        return (await Notifications.requestPermissionsAsync()).granted;
      } catch {
        return false;
      }
    })();
  }
  return ready;
}

export async function notify(title: string, body?: string) {
  if (!(await setup())) return;
  Notifications.scheduleNotificationAsync({
    content: { title, body: body ?? '' },
    trigger: { channelId: 'events' },
  }).catch(() => {});
}

export function prepareNotifications() {
  void setup();
}
