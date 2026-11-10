// Firebase implementation of the Backend (React Native Firebase, modular API).
// Needs a development build — React Native Firebase is not part of Expo Go.
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from '@react-native-firebase/auth';
import {
  connectDatabaseEmulator,
  get,
  getDatabase,
  limitToLast,
  onValue,
  orderByKey,
  query,
  ref,
  serverTimestamp,
  set,
  remove,
  update,
} from '@react-native-firebase/database';
import { getMessaging, getToken, onTokenRefresh } from '@react-native-firebase/messaging';
import Constants from 'expo-constants';

import { claimHash, pinHash } from '@/logic/claim';
import { normalizeConfig, serializeConfig } from '@/model/layout';
import { normalizeInfo, normalizeState, normalizeUsage } from '@/model/state';
import type { DeviceEvent, Profile, UsageDay } from '@/model/types';

import { AuthError, ClaimError, type Backend } from './backend';

const USER_DOMAIN = 'users.relaxpump.app';
/** Phone + password login: Firebase Email/Password with a synthetic email (CLAUDE.md §5). */
export const phoneEmail = (phone: string) => `91${phone}@${USER_DOMAIN}`;

const extra = (Constants.expoConfig?.extra ?? {}) as { firebaseDatabaseURL?: string };

let pushToken: string | null = null;

function mapAuthError(e: unknown, signingUp = false): AuthError {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':
      return new AuthError('phone-taken', 'This number already has an account');
    case 'auth/user-not-found':
      return new AuthError('no-account', 'No account with this number');
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return new AuthError('wrong-password', signingUp ? 'Could not sign up' : 'Wrong number or password');
    case 'auth/weak-password':
      return new AuthError('weak-password', 'Use at least 6 characters');
    case 'auth/network-request-failed':
      return new AuthError('network', 'No internet connection');
    case 'auth/too-many-requests':
      return new AuthError('too-many', 'Too many tries. Wait a minute.');
    default:
      return new AuthError('unknown', 'Something went wrong. Try again.');
  }
}

export function createFirebaseBackend(): Backend {
  const auth = getAuth();
  const db = getDatabase(undefined, extra.firebaseDatabaseURL);

  // Local Emulator Suite: EXPO_PUBLIC_EMULATOR_HOST=192.168.x.x (your PC's LAN IP).
  const emu = process.env.EXPO_PUBLIC_EMULATOR_HOST;
  if (emu) {
    connectAuthEmulator(auth, `http://${emu}:9099`);
    connectDatabaseEmulator(db, emu, 9000);
  }

  const watch = <T>(path: string, map: (v: unknown) => T, cb: (v: T) => void) =>
    onValue(
      ref(db, path),
      (snap) => cb(map(snap.val())),
      () => cb(map(null)),
    );

  return {
    kind: 'firebase',

    onAuth: (cb) => onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid } : null)),

    async signIn(phone, password) {
      try {
        await signInWithEmailAndPassword(auth, phoneEmail(phone), password);
      } catch (e) {
        throw mapAuthError(e);
      }
    },

    async signUp(name, phone, password) {
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(auth, phoneEmail(phone), password);
      } catch (e) {
        throw mapAuthError(e, true);
      }
      await set(ref(db, `users/${cred.user.uid}`), {
        name: name || 'My Home',
        phone,
        createdAt: serverTimestamp(),
      });
    },

    registerPush(uid) {
      // Push token at users/{uid}/fcm/{token}. The Cloud Function (Blaze) sends to these.
      const save = (token: string) => {
        if (!token) return;
        pushToken = token;
        set(ref(db, `users/${uid}/fcm/${token}`), true).catch(() => {});
      };
      let stop: (() => void) | undefined;
      try {
        const m = getMessaging();
        getToken(m).then(save, () => {}); // iOS without APNs set up: no token, no crash
        stop = onTokenRefresh(m, save);
      } catch {
        // Messaging not available in this build.
      }
      return () => stop?.();
    },

    async signOut() {
      // Stop pushes to this phone for the account that is leaving.
      const u = auth.currentUser;
      if (u && pushToken) await remove(ref(db, `users/${u.uid}/fcm/${pushToken}`)).catch(() => {});
      pushToken = null;
      await signOut(auth);
    },

    async changePassword(current, next) {
      const u = auth.currentUser;
      if (!u?.email) throw new AuthError('unknown', 'Sign in again');
      try {
        await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
      } catch (e) {
        const err = mapAuthError(e);
        throw err.code === 'wrong-password'
          ? new AuthError('wrong-password', 'Current password is wrong')
          : err;
      }
      try {
        await updatePassword(u, next);
      } catch (e) {
        throw mapAuthError(e);
      }
    },

    async deleteAccount(password) {
      const u = auth.currentUser;
      if (!u?.email) throw new AuthError('unknown', 'Sign in again');
      try {
        await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
      } catch (e) {
        const err = mapAuthError(e);
        throw err.code === 'wrong-password' ? new AuthError('wrong-password', 'Password is wrong') : err;
      }
      try {
        // Release every controller (so it can be set up again) and drop the profile in one write.
        const snap = await get(ref(db, `users/${u.uid}/devices`));
        const ids = Object.keys((snap.val() ?? {}) as Record<string, true>);
        const wipe: Record<string, null> = { [`users/${u.uid}`]: null };
        for (const id of ids) wipe[`devices/${id}/info/ownerUid`] = null;
        await update(ref(db), wipe);
        await deleteUser(u);
      } catch (e) {
        throw mapAuthError(e);
      }
    },

    onServerOffset: (cb) =>
      onValue(
        ref(db, '.info/serverTimeOffset'),
        (snap) => cb(Number(snap.val() ?? 0)),
        () => cb(0),
      ),

    onProfile: (uid, cb) =>
      watch(
        `users/${uid}`,
        (v) => {
          if (!v) return null;
          const p = v as Partial<Profile>;
          return {
            name: String(p.name ?? ''),
            phone: String(p.phone ?? ''),
            devices: (p.devices ?? {}) as Record<string, true>,
            createdAt: Number(p.createdAt ?? 0),
          };
        },
        cb,
      ),

    onInfo: (id, cb) =>
      watch(`devices/${id}/info`, (v) => normalizeInfo(v as Record<string, unknown> | null), cb),
    onState: (id, cb) =>
      watch(`devices/${id}/state`, (v) => normalizeState(v as Record<string, unknown> | null), cb),
    onConfig: (id, cb) =>
      watch(`devices/${id}/config`, (v) => (v ? normalizeConfig(v as Record<string, unknown>) : null), cb),

    onEvents: (id, limit, cb) =>
      onValue(
        query(ref(db, `devices/${id}/events`), orderByKey(), limitToLast(limit)),
        (snap) => {
          const out: DeviceEvent[] = [];
          snap.forEach((c) => {
            out.push({ ...(c.val() as Omit<DeviceEvent, 'id'>), id: c.key as string });
            return undefined;
          });
          cb(out.sort((a, b) => b.ts - a.ts));
        },
        () => cb([]),
      ),

    onUsage: (id, days, cb) => {
      const byDay = new Map<string, UsageDay>();
      const emit = () => cb(days.map((d) => byDay.get(d) ?? normalizeUsage(d, null)));
      const unsubs = days.map((d) =>
        onValue(ref(db, `devices/${id}/usage/${d}`), (snap) => {
          const v = snap.val() as Record<string, unknown> | null;
          if (v) byDay.set(d, normalizeUsage(d, v));
          else byDay.delete(d);
          emit();
        }),
      );
      emit();
      return () => unsubs.forEach((u) => u());
    },

    async sendCommand(id, cmd) {
      await set(ref(db, `devices/${id}/cmd`), { ...cmd, ts: serverTimestamp() });
    },

    async patchConfig(id, patch) {
      // Each key is its own path: the rules allow these customer fields without the installer PIN.
      await update(ref(db, `devices/${id}/config`), patch);
    },

    async pinStatus(id) {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Sign in again');
      // With no attempt on file, a pinCheck write only passes while no PIN is set.
      await remove(ref(db, `pinAttempts/${id}/${uid}`));
      try {
        await set(ref(db, `pinChecks/${id}/${uid}`), serverTimestamp());
        return 'none';
      } catch {
        return 'set';
      }
    },

    async verifyPin(id, pin) {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Sign in again');
      await set(ref(db, `pinAttempts/${id}/${uid}`), { hash: await pinHash(id, pin), ts: serverTimestamp() });
      try {
        await set(ref(db, `pinChecks/${id}/${uid}`), serverTimestamp());
        return true;
      } catch {
        return false;
      }
    },

    async saveSetup(id, cfg, newPin) {
      const all: Record<string, unknown> = { [`devices/${id}/config`]: serializeConfig(cfg) };
      if (newPin) all[`installerPins/${id}`] = { hash: await pinHash(id, newPin) };
      await update(ref(db), all);
    },

    async endSetup(id) {
      const uid = auth.currentUser?.uid;
      if (uid) await remove(ref(db, `pinAttempts/${id}/${uid}`)).catch(() => {});
    },

    async claimDevice(deviceId, code) {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new ClaimError('unknown', 'Sign in again');
      const hash = await claimHash(deviceId, code);
      // One atomic multi-path write. The rules accept ownerUid only when the hash matches
      // claims/{deviceId}/codeHash and the device has no owner yet.
      try {
        await update(ref(db), {
          [`claimAttempts/${deviceId}/${uid}`]: hash,
          [`devices/${deviceId}/info/ownerUid`]: uid,
          [`users/${uid}/devices/${deviceId}`]: true,
        });
      } catch (e) {
        const c = (e as { code?: string })?.code ?? '';
        if (c.includes('permission-denied'))
          throw new ClaimError(
            'bad-code',
            'That code does not match, or this controller already has an owner',
          );
        throw new ClaimError('network', 'Could not reach the server');
      }
    },
  };
}
