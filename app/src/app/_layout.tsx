import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Outfit_300Light, Outfit_500Medium, Outfit_600SemiBold } from '@expo-google-fonts/outfit';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Toast } from '@/components/Toast';
import { Sheets } from '@/features/sheets/Sheets';
import { prepareNotifications } from '@/services/notify';
import { useDevice } from '@/state/device';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Outfit_300Light,
    Outfit_500Medium,
    Outfit_600SemiBold,
  });
  const status = useSession((st) => st.status);
  const deviceId = useSession((st) => st.deviceId);

  useEffect(() => useSession.getState().start(), []);
  useEffect(() => useDevice.getState().attach(deviceId), [deviceId]);
  useEffect(() => {
    if (deviceId) prepareNotifications();
  }, [deviceId]);

  // Auth gate: signed in → Home; signed out from inside the app → Auth.
  useEffect(() => {
    if (status === 'loading') return;
    const ui = useUi.getState();
    if (status === 'in' && (ui.route === 'welcome' || ui.route === 'auth')) {
      ui.setRoute('home');
      router.replace('/home');
    } else if (status === 'out' && !['welcome', 'auth'].includes(ui.route)) {
      ui.closeSheet();
      ui.setRoute('auth');
      router.replace('/auth');
    }
  }, [status]);

  const ready = fontsLoaded && status !== 'loading';
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.base }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'none',
              contentStyle: { backgroundColor: colors.base },
            }}
          />
          <Sheets />
          <Toast />
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
