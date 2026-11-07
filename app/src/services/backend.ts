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

  onProfile(uid: string, cb: (p: Profile | null) => void): Unsub;

  onInfo(deviceId: string, cb: (v: DeviceInfo | null) => void): Unsub;
  onState(deviceId: string, cb: (v: DeviceState | null) => void): Unsub;
  onConfig(deviceId: string, cb: (v: DeviceConfig | null) => void): Unsub;
  onEvents(deviceId: string, limit: number, cb: (v: DeviceEvent[]) => void): Unsub;
  onUsage(deviceId: string, days: string[], cb: (v: UsageDay[]) => void): Unsub;

  sendCommand(deviceId: string, cmd: Omit<DeviceCommand, 'ts'>): Promise<void>;
  setConfig(deviceId: string, cfg: DeviceConfig): Promise<void>;

  /** Link a controller to the signed-in user with the code from the box. */
  claimDevice(deviceId: string, claimCode: string): Promise<void>;
}
