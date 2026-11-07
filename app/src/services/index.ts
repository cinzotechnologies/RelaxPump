import type { Backend } from './backend';
import { createMockBackend } from './mockBackend';

let instance: Backend | null = null;

/** The app's backend: Firebase in real builds, the in-memory simulator when EXPO_PUBLIC_BACKEND=mock. */
export function backend(): Backend {
  if (!instance) {
    if (process.env.EXPO_PUBLIC_BACKEND === 'firebase') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      instance = (require('./firebaseBackend') as typeof import('./firebaseBackend')).createFirebaseBackend();
    } else {
      instance = createMockBackend();
    }
  }
  return instance;
}
