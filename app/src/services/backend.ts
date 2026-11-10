import type {
  DeviceCommand,
  DeviceConfig,
  DeviceEvent,
  DeviceInfo,
  DeviceState,
  Profile,
  SessionUser,
  UsageDay,
} from '@/model/types';

export type Unsub = () => void;

export class AuthError extends Error {
  constructor(
    public code:
      'wrong-password' | 'no-account' | 'phone-taken' | 'weak-password' | 'network' | 'too-many' | 'unknown',
    message: string,
  ) {
    super(message);
  }
}

export class ClaimError extends Error {
  constructor(
    public code: 'bad-code' | 'already-claimed' | 'not-found' | 'network' | 'unknown',
    message: string,
  ) {
    super(message);
  }
}

/** Everything the app needs from the cloud. Implemented by Firebase and by an in-memory mock. */
export interface Backend {
  readonly kind: 'firebase' | 'mock';

  onAuth(cb: (user: SessionUser | null) => void): Unsub;
  signIn(phone: string, password: string): Promise<void>;
  signUp(name: string, phone: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
  /** Store requirement: delete the account, release its controllers, then sign out. */
  deleteAccount(password: string): Promise<void>;

  /** Save this phone's push token for the signed-in user (and keep it fresh). */
  registerPush(uid: string): Unsub;

  /** Server clock minus phone clock, in ms, so a wrong phone clock can't fake "online". */
  onServerOffset(cb: (ms: number) => void): Unsub;

  onProfile(uid: string, cb: (p: Profile | null) => void): Unsub;

  onInfo(deviceId: string, cb: (v: DeviceInfo | null) => void): Unsub;
  onState(deviceId: string, cb: (v: DeviceState | null) => void): Unsub;
  onConfig(deviceId: string, cb: (v: DeviceConfig | null) => void): Unsub;
  onEvents(deviceId: string, limit: number, cb: (v: DeviceEvent[]) => void): Unsub;
  onUsage(deviceId: string, days: string[], cb: (v: UsageDay[]) => void): Unsub;

  sendCommand(deviceId: string, cmd: Omit<DeviceCommand, 'ts'>): Promise<void>;
  /**
   * Customer edits (no PIN): leaf paths under config, e.g. {"low": 30, "semi/2/name": "Roof"}.
   * null removes the field.
   */
  patchConfig(deviceId: string, patch: Record<string, string | number | null>): Promise<void>;

  /** Installer PIN: 'none' before the first setup, else 'set'. */
  pinStatus(deviceId: string): Promise<'none' | 'set'>;
  /** True when the PIN is right (the rules then allow layout writes for 15 minutes). */
  verifyPin(deviceId: string, pin: string): Promise<boolean>;
  /** Installer setup Save: the whole layout in one write (+ the PIN on the first setup). */
  saveSetup(deviceId: string, cfg: DeviceConfig, newPin?: string): Promise<void>;
  /** Forget the PIN entry on this account (wizard closed). */
  endSetup(deviceId: string): Promise<void>;

  /** Link a controller to the signed-in user with the code from the box. */
  claimDevice(deviceId: string, claimCode: string): Promise<void>;
}
