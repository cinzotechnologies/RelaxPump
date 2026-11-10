// In-memory backend that behaves like a v2 controller (fill engine in miniature): 1–5 tanks
// (one tank = no valve, the pump fills it directly), optional main tank sensor, Auto, pump check,
// test pulses, installer PIN. Used for UI work without Firebase or a controller (Expo Go, or
// EXPO_PUBLIC_BACKEND=mock).
//
// Pick the demo layout with EXPO_PUBLIC_MOCK_LAYOUT: "<tanks>[,main]", e.g. "1", "2", "3,main",
// "5,main". Default "3,main".

import AsyncStorage from '@react-native-async-storage/async-storage';

import { pickLowest } from '@/logic/pump';
import {
  clampCount,
  DEFAULT_LAYOUT,
  DEFAULT_TANK,
  hasValves,
  MAX_TANKS,
  type LayoutConfig,
} from '@/model/layout';
import type {
  CheckRow,
  DeviceCommand,
  DeviceEvent,
  DeviceInfo,
  DeviceState,
  Profile,
  SessionUser,
  UsageDay,
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
const NAMES = ['Roof', 'Kitchen', 'Bathroom', 'Garden', 'Guest'];
const PCTS = [82, 46, 18, 64, 90];
const LITRES = [1000, 500, 500, 1000, 500];
const HEIGHTS = [30, 12, 20, 25, 15];

/** Demo layouts for the simulator and the tests: "3,main" = 3 tanks + main tank sensor. */
export function mockLayout(spec = '3,main'): LayoutConfig {
  const parts = spec.split(',').map((p) => p.trim());
  const n = clampCount(parseInt(parts[0], 10) || 3);
  const main = parts.includes('main');
  return {
    ...DEFAULT_LAYOUT,
    tanks: Array.from({ length: n }, (_, i) => ({
      ...DEFAULT_TANK,
      name: NAMES[i],
      litres: LITRES[i],
      heightFt: HEIGHTS[i],
    })),
    main: { ...DEFAULT_LAYOUT.main, enabled: main, litres: main ? 5000 : null },
    low: 30,
    high: 95,
  };
}

/** Demo accounts survive app restarts (Expo Go has no Firebase; this is the simulator's own store). */
const STORE_KEY = 'rp.mock.accounts.v1';
type Saved = {
  accounts: [string, { password: string; uid: string }][];
  profiles: [string, Profile][];
  /** Signed-in uid, so the demo stays signed in like Firebase does. */
  session?: string | null;
};

const TICK_MS = 700;

export function createMockBackend(spec = process.env.EXPO_PUBLIC_MOCK_LAYOUT): Backend {
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

  const info: DeviceInfo = {
    name: 'RelaxPump Controller',
    fw: '2.1.0',
    board: 'v1',
    maxTanks: MAX_TANKS,
    ownerUid: 'demo',
  };
  let config: LayoutConfig = mockLayout(spec || undefined);
  const levels = PCTS.slice();
  let mainPct = 72;
  let pin: string | null = null;
  let pinOk = false;

  // Live controller state
  let pump = false;
  let active = -1;
  let runAuto = false;
  let autoMode = true;
  let msg = '';
  const valves = new Array<boolean>(MAX_TANKS).fill(false);
  let check: { run: boolean; rows: CheckRow[] } | null = null;

  const now = Date.now();
  const events: DeviceEvent[] = [
    { id: 'e3', type: 'full', tank: 0, ts: now - 10 * 60000 },
    { id: 'e2', type: 'low', tank: 2 % config.tanks.length, ts: now - 60 * 60000 },
    { id: 'e1', type: 'pump_off', tank: 0, ts: new Date().setHours(6, 40, 0, 0), min: 25, auto: true },
  ];
  let evSeq = 4;
  let runStart = Date.now();

  const n = () => config.tanks.length;
  const valved = () => hasValves(n());
  const mainLow = () => config.main.enabled && mainPct < config.main.minPct;
  const snapshot = (): DeviceState => ({
    online: true,
    lastSeen: Date.now(),
    rssi: -55,
    ssid: 'Home_WiFi',
    pump,
    auto: autoMode,
    msg,
    active: pump && active >= 0 ? active : null,
    tanks: config.tanks.map((_, i) => ({
      pct: Math.round(levels[i]),
      valve: valved() && valves[i],
      ok: true,
    })),
    main: config.main.enabled ? { pct: Math.round(mainPct), ok: true } : null,
    // Ports T1–T4 and MAIN answer in the demo; T5 has no cable.
    detected: { tanks: Array.from({ length: MAX_TANKS }, (_, i) => i < 4), main: true },
    check,
  });

  const auth = new Channel<SessionUser | null>(() => user);
  const stateCh = new Channel<DeviceState | null>(snapshot);
  const configCh = new Channel<LayoutConfig | null>(() => JSON.parse(JSON.stringify(config)) as LayoutConfig);
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

  const start = (i: number, auto: boolean) => {
    if (i < 0 || i >= n()) return;
    if (mainLow()) {
      msg = 'Main tank is low. The pump will not start.';
      return;
    }
    valves.fill(false);
    if (valved()) valves[i] = true;
    active = i;
    pump = true;
    runAuto = auto;
    runStart = Date.now();
    msg = '';
    addEvent({ type: 'pump_on', tank: i, auto });
  };

  const stop = (stopped = true) => {
    if (pump && stopped)
      addEvent({
        type: 'pump_off',
        tank: Math.max(0, active),
        auto: runAuto,
        min: (Date.now() - runStart) / 60000,
      });
    pump = false;
    active = -1;
    setTimeout(() => {
      if (!pump) valves.fill(false);
      stateCh.emit();
    }, 1200);
  };

  const autoPick = (except = -1) =>
    pickLowest(
      config.tanks.map((_, i) => ({ pct: levels[i], ok: true })),
      config.low,
      except,
    );

  // Simulation loop.
  setInterval(() => {
    for (let i = 0; i < n(); i++) if (i !== active) levels[i] = Math.max(0, levels[i] - 0.08);
    mainPct = Math.min(100, mainPct + (pump ? -0.25 : 0.05));
    if (check?.run) {
      // handled by the pumpCheck timer
    } else if (pump && active >= 0) {
      if (mainLow()) {
        msg = 'Main tank is low. Pump stopped.';
        addEvent({ type: 'main_low', tank: -1 });
        stop();
      } else {
        levels[active] = Math.min(100, levels[active] + 1.2);
        if (levels[active] >= config.high) {
          addEvent({ type: 'full', tank: active });
          const next = runAuto && autoMode && valved() ? autoPick(active) : -1;
          if (next >= 0) {
            valves[next] = true; // open the next valve first, close the old one after
            const prev = active;
            active = next;
            setTimeout(() => {
              valves[prev] = false;
              stateCh.emit();
            }, 1000);
          } else stop();
        }
      }
    } else if (autoMode) {
      const low = autoPick();
      if (low >= 0) start(low, true);
    }
    stateCh.emit();
  }, TICK_MS);

  const applyCommand = (cmd: Omit<DeviceCommand, 'ts'>) => {
    msg = '';
    if (cmd.auto !== undefined) autoMode = cmd.auto;
    if (cmd.pump !== undefined || cmd.valve) autoMode = false;
    if (cmd.valve && valved()) {
      const { i, open } = cmd.valve;
      if (!open && pump && active === i) {
        msg = 'Pump stopped first';
        stop();
      } else if (open && pump && i !== active) {
        valves[i] = true;
        const prev = active;
        active = i;
        setTimeout(() => (valves[prev] = false), 1000);
      } else if (!pump && i < n()) {
        if (open) valves.fill(false); // idle: one valve open at a time
        valves[i] = open;
      }
    }
    if (cmd.pump === false) stop();
    if (cmd.pump && !pump) {
      const open = valves.findIndex((v, i) => v && i < n());
      const i = valved() ? open : 0;
      if (i < 0) msg = 'Open a valve first';
      else start(i, false);
    }
    if (cmd.pumpCheck) {
      const tanks = config.tanks.map((_, i) => i).filter((i) => levels[i] < config.high - 2);
      if (pump || !tanks.length)
        msg = pump ? 'Busy. Stop filling first.' : 'No tank to check: all full or no sensor answer.';
      else {
        check = { run: true, rows: [] };
        setTimeout(() => {
          check = {
            run: false,
            rows: tanks.map((i, k) => {
              const pctMin = [4.2, 11, 0.9, 6, 3][k % 5];
              const litres = config.tanks[i].litres;
              return {
                i,
                skipped: false,
                pctMin,
                lpm: litres ? Math.round(((pctMin * litres) / 100) * 10) / 10 : null,
                minToFull: Math.round(100 / pctMin),
                slow: pctMin < 0.4 * 3,
              };
            }),
          };
          addEvent({ type: 'check_done', tank: -1 });
          stateCh.emit();
        }, 2600);
      }
    }
    stateCh.emit();
  };

  const usage = (days: string[]): UsageDay[] => {
    const use = [160, 120, 240, 180, 150, 210, 180];
    const pt = [55, 40, 80, 60, 50, 70, 25];
    const share = config.tanks.map((_, i) => 1 / (i + 2));
    const sum = share.reduce((a, b) => a + b, 0);
    return days.map((date, i) => ({
      date,
      litres: use[i % 7],
      pumpMin: pt[i % 7],
      perTank: share.map((f) => ({ litres: (use[i % 7] * f) / sum, pumpMin: (pt[i % 7] * f) / sum })),
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
    async patchConfig(_id, patch) {
      const c = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
      for (const [path, v] of Object.entries(patch)) {
        const keys = path.split('/');
        let o = c as Record<string, unknown>;
        for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
        o[keys[keys.length - 1]] = v;
      }
      config = c as unknown as LayoutConfig;
      configCh.emit();
    },
    async pinStatus() {
      await wait(300);
      return pin ? 'set' : 'none';
    },
    async verifyPin(_id, p) {
      await wait(400);
      pinOk = pin === null || p === pin;
      return pinOk;
    },
    async saveSetup(_id, cfg, newPin) {
      await wait(600);
      if (pin && !pinOk) throw new Error('PIN needed');
      if (newPin) pin = newPin;
      // Tank removed, or one tank ↔ several (the water path changed): stop, like the firmware.
      if (pump && (active >= cfg.tanks.length || hasValves(cfg.tanks.length) !== valved())) stop();
      config = JSON.parse(JSON.stringify(cfg)) as LayoutConfig;
      configCh.emit();
      stateCh.emit();
    },
    async endSetup() {
      pinOk = false;
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
