import type { ExpoConfig } from 'expo/config';

// google-services.json is git-ignored (public repo). Locally it sits next to this file;
// on EAS Build it comes from the GOOGLE_SERVICES_JSON file environment variable.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';

const config: ExpoConfig = {
  name: 'RelaxPump',
  slug: 'relaxpump',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'relaxpump',
  userInterfaceStyle: 'dark',
  backgroundColor: '#021A20',
  ios: {
    bundleIdentifier: 'com.cinzo.relaxpump',
    supportsTablet: false,
    googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST ?? './GoogleService-Info.plist',
  },
  android: {
    package: 'com.cinzo.relaxpump',
    googleServicesFile,
    adaptiveIcon: {
      backgroundColor: '#021A20',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { backgroundColor: '#021A20', image: './assets/images/splash-icon.png', imageWidth: 96 },
    ],
    'expo-font',
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    '@react-native-firebase/messaging',
    ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
    [
      'expo-camera',
      {
        cameraPermission: 'Allow RelaxPump to scan the code on your controller box.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    ['expo-notifications', { color: '#7FE3EC' }],
    [
      '@orbital-systems/react-native-esp-idf-provisioning',
      {
        transport: 'ble',
        neverForLocation: true,
        bluetoothAlwaysPermission: 'Allow RelaxPump to find your controller over Bluetooth.',
      },
    ],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    // Feature flags (see CLAUDE.md §5)
    ENABLE_PHONE_OTP: false,
    SUPPORT_WHATSAPP: 'https://wa.me/910000000000',
    firebaseDatabaseURL: 'https://iotcinzo-default-rtdb.asia-southeast1.firebasedatabase.app',
  },
};

export default config;
