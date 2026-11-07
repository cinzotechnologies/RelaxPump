import Constants, { ExecutionEnvironment } from 'expo-constants';

import type { Backend } from './backend';
import { createMockBackend } from './mockBackend';

/** Expo Go has no React Native Firebase / BLE provisioning native code, so it always runs the simulator. */
export const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** `EXPO_PUBLIC_BACKEND=mock` forces the simulator in a development build too. */
export const mockMode = inExpoGo || process.env.EXPO_PUBLIC_BACKEND === 'mock';

let instance: Backend | null = null;

export function backend(): Backend {
  if (!instance) {
    if (mockMode) {
      instance = createMockBackend();
    } else {
      // Lazy require keeps the native Firebase modules out of Expo Go.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      instance = (require('./firebaseBackend') as typeof import('./firebaseBackend')).createFirebaseBackend();
    }
  }
  return instance;
}
