// In-memory backend that behaves like the design prototype's simulator (Main.dc.html `tick()`).
// Used for UI work without Firebase or a controller: EXPO_PUBLIC_BACKEND=mock.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { activeTank, pickLowest } from '@/logic/pump';
import {
  DEFAULT_CONFIG,
  type DeviceCommand,
  type DeviceConfig,
  type DeviceEvent,
  type DeviceInfo,
  type DeviceState,
  type Profile,
  type SessionUser,
  type UsageDay,
} from '@/model/types';

import { AuthError, ClaimError, type Backend, type Unsub } from './backend';

type Listener<T> = (v: T) => void;

class Channel<T> {
  private ls = new Set<Listener<T>>();
  constructor(private get: () => T) {}
  sub(cb: Listener<T>): Unsub {
    this.ls.add(cb);
    cb(this.get());
    return () => this.ls.delete(cb);
  }
  emit() {
    const v = this.get();
    this.ls.forEach((l) => l(v));
  }
}

const DEMO_ID = 'RP-3F2A9C';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Demo accounts survive app restarts (Expo Go has no Firebase; this is the simulator's own store). */
const STORE_KEY = 'rp.mock.accounts.v1';
type Saved = {
  accounts: [string, { password: string; uid: string }][];
  profiles: [string, Profile][];
  /** Signed-in uid, so the demo stays signed in like Firebase does. */
  session?: string | null;
};

export function createMockBackend(): Backend {
  let user: SessionUser | null = null;
  const accounts = new Map<string, { password: string; uid: string }>([
    ['9876543210', { password: 'relax123', uid: 'demo' }],
  ]);
  const profiles = new Map<string, Profile>([
    ['demo', { name: 'My Home', phone: '9876543210', devices: { [DEMO_ID]: true }, createdAt: Date.now() }],
  ]);
  const ready = AsyncStorage.getItem(STORE_KEY)
    .then((raw) => {
      if (!raw) return;
      const s = JSON.parse(raw) as Saved;
      s.accounts.forEach(([k, v]) => accounts.set(k, v));
      s.profiles.forEach(([k, v]) => profiles.set(k, v));
      if (s.session && profiles.has(s.session) && !user) {
        user = { uid: s.session };
        auth.emit();
      }
    })
    .catch(() => {});
  const save = () => {
    const s: Saved = {
      accounts: [...accounts.entries()],
      profiles: [...profiles.entries()],
      session: user?.uid ?? null,
    };
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(s)).catch(() => {});
  };

  const info: DeviceInfo = { name: 'RelaxPump Controller', fw: '1.0.0', maxTanks: 3, ownerUid: 'demo' };
  const config: DeviceConfig = {
    ...DEFAULT_CONFIG,
    tanks: [
      { emptyCm: 120, fullCm: 30, litres: 1000 },
      { emptyCm: 120, fullCm: 30, litres: 500 },
      { emptyCm: 120, fullCm: 30, litres: null },
    ],
  };
  const levels = [75, 40, 90];
  const state: DeviceState = {
    online: true,
    lastSeen: Date.now(),
    rssi: -55,
    ssid: 'Home_WiFi',
    pump: true,
    auto: true,
    msg: '',
    tanks: [
      { pct: 75, valve: false, ok: true },
      { pct: 40, valve: true, ok: true },
      { pct: 90, valve: false, ok: true },
    ],
  };
  const now = Date.now();
  const events: DeviceEvent[] = [
    { id: 'e3', type: 'full', tank: 2, ts: now - 10 * 60000 },
    { id: 'e2', type: 'low', tank: 1, ts: now - 60 * 60000 },
    { id: 'e1', type: 'pump_off', tank: 0, ts: new Date().setHours(6, 40, 0, 0), min: 25, auto: true },
  ];
  let evSeq = 4;
  let pumpStart = Date.now();

  const auth = new Channel<SessionUser | null>(() => user);
  const stateCh = new Channel<DeviceState | null>(() => ({
    ...state,
    tanks: state.tanks.map((t) => ({ ...t })),
  }));
  const configCh = new Channel<DeviceConfig | null>(() => ({
    ...config,
    tanks: config.tanks.map((t) => ({ ...t })),
  }));
  const infoCh = new Channel<DeviceInfo | null>(() => ({ ...info }));
  const eventsCh = new Channel<DeviceEvent[]>(() => events.slice(0, 30));
  const profileChs = new Map<string, Channel<Profile | null>>();
  const profileCh = (uid: string) => {
    let ch = profileChs.get(uid);
    if (!ch) {
      ch = new Channel(() => profiles.get(uid) ?? null);
      profileChs.set(uid, ch);
    }
    return ch;
  };

  const addEvent = (e: Omit<DeviceEvent, 'id' | 'ts'>) => {
    events.unshift({ ...e, id: `e${evSeq++}`, ts: Date.now() });
    eventsCh.emit();
  };

  const setPump = (on: boolean, auto: boolean) => {
    if (on === state.pump) return;
    state.pump = on;
    const t = state.tanks.findIndex((x) => x.valve);
    if (on) {
      pumpStart = Date.now();
      addEvent({ type: 'pump_on', tank: Math.max(0, t), auto });
    } else {
      addEvent({ type: 'pump_off', tank: Math.max(0, t), auto, min: (Date.now() - pumpStart) / 60000 });
    }
  };

  // Simulation loop (700 ms, like the prototype).
  setInterval(() => {
    const n = state.tanks.length;
    const active = activeTank(state.pump, state.tanks);
    for (let i = 0; i < n; i++) if (i !== active) levels[i] = Math.max(0, levels[i] - 0.12);
    if (active >= 0) {
      levels[active] = Math.min(config.high, levels[active] + 1.2);
      if (levels[active] >= config.high) {
        setPump(false, state.auto);
        state.tanks.forEach((t) => (t.valve = false));
        addEvent({ type: 'full', tank: active });
      }
    } else if (state.auto) {
      const low = pickLowest(
        state.tanks.map((t, i) => ({ ...t, pct: levels[i] })),
        config.low,
      );
      if (low >= 0) {
        state.tanks.forEach((t, i) => (t.valve = i === low));
        setPump(true, true);
      }
    }
    state.tanks.forEach((t, i) => (t.pct = Math.round(levels[i])));
    state.lastSeen = Date.now();
    stateCh.emit();
  }, 700);

  const applyCommand = (cmd: Omit<DeviceCommand, 'ts'>) => {
    state.msg = '';
    if (cmd.auto !== undefined) state.auto = cmd.auto;
    if (cmd.pump !== undefined) {
      state.auto = false;
      if (cmd.pump) {
        if (state.tanks.some((t) => t.valve)) setPump(true, false);
        else state.msg = 'Open a valve first';
      } else {
        setPump(false, false);
        setTimeout(() => {
          state.tanks.forEach((t) => (t.valve = false));
          stateCh.emit();
        }, 1200);
      }
    }
    if (cmd.valve) {
      const { i, open } = cmd.valve;
      state.auto = false;
      const openCount = state.tanks.filter((t) => t.valve).length;
      if (!open && state.pump && openCount === 1 && state.tanks[i]?.valve) {
        setPump(false, false);
        state.tanks.forEach((t) => (t.valve = false));
      } else if (state.tanks[i]) state.tanks[i].valve = open;
    }
    stateCh.emit();
  };

  const usage = (days: string[]): UsageDay[] => {
    const use = [160, 120, 240, 180, 150, 210, 180];
    const pt = [55, 40, 80, 60, 50, 70, 25];
    const share = [0.42, 0.33, 0.25];
    return days.map((date, i) => ({
      date,
      litres: use[i % 7],
      pumpMin: pt[i % 7],
      perTank: share
        .slice(0, config.tankCount)
        .map((f) => ({ litres: use[i % 7] * f, pumpMin: pt[i % 7] * f })),
    }));
  };

  return {
    kind: 'mock',
    onAuth: (cb) => auth.sub(cb),
    async signIn(phone, password) {
      await Promise.all([wait(900), ready]);
      const a = accounts.get(phone);
      if (!a) throw new AuthError('no-account', 'No account with this number');
      if (a.password !== password) throw new AuthError('wrong-password', 'Wrong password');
      user = { uid: a.uid };
      save();
      auth.emit();
    },
    async signUp(name, phone, password) {
      await Promise.all([wait(900), ready]);
      if (accounts.has(phone)) throw new AuthError('phone-taken', 'This number already has an account');
      const uid = `u${Date.now().toString(36)}`;
      accounts.set(phone, { password, uid });
      profiles.set(uid, { name: name || 'My Home', phone, devices: {}, createdAt: Date.now() });
      user = { uid };
      save();
      auth.emit();
    },
    async signOut() {
      user = null;
      save();
      auth.emit();
    },
    async deleteAccount(password) {
      await wait(700);
      const phone = [...accounts.entries()].find(([, a]) => a.uid === user?.uid)?.[0];
      const entry = phone ? accounts.get(phone) : undefined;
      if (!phone || !entry || entry.password !== password)
        throw new AuthError('wrong-password', 'Password is wrong');
      accounts.delete(phone);
      profiles.delete(entry.uid);
      user = null;
      save();
      auth.emit();
    },
    registerPush: () => () => {},
    onServerOffset: (cb) => {
      cb(0);
      return () => {};
    },
    async changePassword(current, next) {
      await wait(600);
      const entry = [...accounts.values()].find((a) => a.uid === user?.uid);
      if (!entry || entry.password !== current)
        throw new AuthError('wrong-password', 'Current password is wrong');
      entry.password = next;
      save();
    },
    onProfile: (uid, cb) => profileCh(uid).sub(cb),
    onInfo: (_id, cb) => infoCh.sub(cb),
    onState: (_id, cb) => stateCh.sub(cb),
    onConfig: (_id, cb) => configCh.sub(cb),
    onEvents: (_id, _limit, cb) => eventsCh.sub(cb),
    onUsage: (_id, days, cb) => {
      cb(usage(days));
      return () => {};
    },
    async sendCommand(_id, cmd) {
      applyCommand(cmd);
    },
    async setConfig(_id, cfg) {
      Object.assign(config, cfg);
      while (state.tanks.length < cfg.tankCount) {
        state.tanks.push({ pct: 50, valve: false, ok: true });
        levels.push(50);
      }
      state.tanks.length = cfg.tankCount;
      levels.length = cfg.tankCount;
      if (!state.tanks.some((t) => t.valve)) state.pump = false;
      configCh.emit();
      stateCh.emit();
    },
    async claimDevice(deviceId, code) {
      await wait(800);
      if (code.length < 6) throw new ClaimError('bad-code', 'That code does not match this controller');
      const p = user && profiles.get(user.uid);
      if (p) {
        p.devices = { ...p.devices, [deviceId]: true };
        save();
        profileCh(user!.uid).emit();
      }
    },
  };
}

export const MOCK_DEVICE_ID = DEMO_ID;
