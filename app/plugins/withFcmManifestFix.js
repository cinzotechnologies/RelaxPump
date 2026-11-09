// expo-notifications and @react-native-firebase/messaging both declare the FCM default
// notification meta-data (color, and icon/channel when set), so the release manifest merge fails:
//   "Attribute meta-data#com.google.firebase.messaging.default_notification_color@resource
//    value=(@color/notification_icon_color) ... is also present at [:react-native-firebase_messaging]"
// Mark ours with tools:replace so the app's values (from expo-notifications) win.
const { withAndroidManifest } = require('expo/config-plugins');

const PREFIX = 'com.google.firebase.messaging.default_notification_';

module.exports = function withFcmManifestFix(config) {
  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    for (const app of manifest.application || []) {
      for (const meta of app['meta-data'] || []) {
        const name = meta.$ && meta.$['android:name'];
        if (!name || !name.startsWith(PREFIX)) continue;
        const attr = meta.$['android:resource'] !== undefined ? 'android:resource' : 'android:value';
        meta.$['tools:replace'] = attr;
      }
    }
    return c;
  });
};
