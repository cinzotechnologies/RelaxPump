// In-memory backend that behaves like a v2 controller (fill engine in miniature): 1–8 tanks,
// optional sensor/valve per tank, PHE line, main tank, Auto, timer fills, pump check, installer PIN.
// Used for UI work without Firebase or a controller (Expo Go, or EXPO_PUBLIC_BACKEND=mock).
//
// Pick the demo layout with EXPO_PUBLIC_MOCK_LAYOUT, e.g. "8", "5,phe", "3,main,ns2", "1,ns1":
//   <tanks>[,phe][,main][,ns<n> = tank n has no sensor]. Default "4,phe,main,ns3".

import AsyncStorage from '@react-native-async-storage/async-storage';

import { pickLowest } from '@/logic/pump';
import {
  DEFAULT_LAYOUT,
  DEFAULT_SEMI,
  V2_PORTS,
  autoCapable,
  firstSource,
  type LayoutConfig,
  type Source,
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
const NAMES = ['Roof', 'Kitchen', 'Bathroom', 'Garden', 'Guest', 'Office', 'Store', 'Terrace'];
const PCTS = [82, 46, 18, 64, 90, 35, 55, 27];
const LITRES = [1000, 500, 500, 1000, 500, 1000, 1000, 500];

/** Demo layouts for the simulator and the tests: "5,phe,main,ns3". */
export function mockLayout(spec = '4,phe,main,ns3'): LayoutConfig {
  const parts = spec.split(',').map((p) => p.trim());
  const n = Math.max(1, Math.min(8, parseInt(parts[0], 10) || 4));
  const ns = parts.find((p) => /^ns\d$/.test(p));
  const noSensor = ns ? parseInt(ns.slice(2), 10) - 1 : -1;
  const phe = parts.includes('phe');
  const main = parts.includes('main');
  return {
    ...DEFAULT_LAYOUT,
    semi: Array.from({ length: n }, (_, i) => ({
      ...DEFAULT_SEMI,
      name: NAMES[i],
      litres: LITRES[i],
      sensor: i !== noSensor,
      valve: n > 1 || i !== noSensor,
      fillMin: i === noSensor ? 10 : null,
    })),
    main: { ...DEFAULT_LAYOUT.main, enabled: main, sensor: main, litres: main ? 5000 : null },
    phe: { ...DEFAULT_LAYOUT.phe, enabled: phe },
    mode: phe ? 'auto' : 'pump',
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

/** Seconds of simulator time per real tick: timer fills of 10 min end in about a minute. */
const TICK_MS = 700;
const TIMER_SPEED = 10;

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
    fw: '2.0.0',
    board: 'v2',
    maxTanks: 8,
    ports: V2_PORTS,
    ownerUid: 'demo',
  };
  let config: LayoutConfig = mockLayout(spec || undefined);
  const levels = PCTS.slice();
  let mainPct = 72;
  let pin: string | null = null;
  let pinOk = false;

  // Live controller state
  let src: Source | null = null;
  let active = -1;
  let timedLeft = 0; // seconds left on a timer fill
  let runAuto = false;
  let autoMode = true;
  let msg = '';
  const valves = new Array<boolean>(8).fill(false);
  let check: { run: boolean; rows: CheckRow[] } | null = null;

  const now = Date.now();
  const events: DeviceEvent[] = [
    { id: 'e3', type: 'full', tank: 0, ts: now - 10 * 60000 },
    { id: 'e2', type: 'low', tank: 2, ts: now - 60 * 60000 },
    { id: 'e1', type: 'pump_off', tank: 1, ts: new Date().setHours(6, 40, 0, 0), min: 25, auto: true },
  ];
  let evSeq = 4;
  let runStart = Date.now();

  const n = () => config.semi.length;
  const snapshot = (): DeviceState => ({
    online: true,
    lastSeen: Date.now(),
    rssi: -55,
    ssid: 'Home_WiFi',
    pump: src === 'pump',
    phe: src === 'phe',
    auto: autoMode,
    msg,
    src,
    active: active >= 0 ? active : null,
    semi: config.semi.map((t, i) => ({
      pct: t.sensor ? Math.round(levels[i]) : null,
      valve: valves[i],
      ok: true,
    })),
    main: config.main.enabled && config.main.sensor ? { pct: Math.round(mainPct), ok: true } : null,
    detected: { s: Array.from({ length: 8 }, (_, i) => i < 6), main: true },
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

  const fillable = (i: number) => i >= 0 && i < n() && (n() === 1 || config.semi[i].valve);

  const start = (i: number, s: Source, auto: boolean) => {
    if (!fillable(i)) {
      msg = `Tank ${i + 1} needs a valve.`;
      return;
    }
    if (s === 'pump' && config.mode === 'phe') s = 'phe';
    if (s === 'phe' && (!config.phe.enabled || config.mode === 'pump')) s = 'pump';
    if (s === 'pump' && config.main.enabled && config.main.sensor && mainPct < config.main.minPct) {
      msg = 'Main tank is low. The pump will not start.';
      return;
    }
    valves.fill(false);
    if (config.semi[i].valve) valves[i] = true;
    active = i;
    src = s;
    runAuto = auto;
    runStart = Date.now();
    timedLeft = config.semi[i].sensor ? 0 : (config.semi[i].fillMin ?? 10) * 60;
    msg = '';
    addEvent({ type: s === 'pump' ? 'pump_on' : 'phe_on', tank: i, auto });
  };

  const stop = (stopped = true) => {
    if (src && stopped)
      addEvent({
        type: src === 'pump' ? 'pump_off' : 'phe_off',
        tank: Math.max(0, active),
        auto: runAuto,
        min: (Date.now() - runStart) / 60000,
      });
    src = null;
    active = -1;
    timedLeft = 0;
    setTimeout(() => {
      if (!src) valves.fill(false);
      stateCh.emit();
    }, 1200);
  };

  const autoPick = (except = -1) =>
    pickLowest(
      config.semi.map((t, i) => ({
        pct: autoCapable(config, i) ? levels[i] : null,
        ok: true,
      })),
      config.low,
      except,
    );

  // Simulation loop.
  setInterval(() => {
    for (let i = 0; i < n(); i++) if (i !== active) levels[i] = Math.max(0, levels[i] - 0.08);
    mainPct = Math.min(100, mainPct + (src === 'pump' ? -0.25 : 0.05));
    if (check?.run) {
      // handled by the pumpCheck timer
    } else if (src && active >= 0) {
      if (src === 'pump' && config.main.enabled && config.main.sensor && mainPct < config.main.minPct) {
        msg = 'Main tank is low. Pump stopped.';
        stop();
      } else if (timedLeft > 0) {
        timedLeft -= (TICK_MS / 1000) * TIMER_SPEED;
        if (timedLeft <= 0) {
          addEvent({ type: 'timeout', tank: active, min: config.semi[active].fillMin ?? 10 });
          stop();
        }
      } else {
        levels[active] = Math.min(100, levels[active] + 1.2);
        if (levels[active] >= config.high) {
          addEvent({ type: 'full', tank: active });
          const next = runAuto && autoMode ? autoPick(active) : -1;
          if (next >= 0) {
            valves[next] = true;
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
      if (low >= 0) start(low, firstSource(config.mode, config.phe.enabled), true);
    }
    stateCh.emit();
  }, TICK_MS);

  const applyCommand = (cmd: Omit<DeviceCommand, 'ts'>) => {
    msg = '';
    if (cmd.auto !== undefined) autoMode = cmd.auto;
    const manual = cmd.pump !== undefined || cmd.phe !== undefined || !!cmd.valve || !!cmd.fill;
    if (manual) autoMode = false;
    if (cmd.pump === false || cmd.phe === false) stop();
    if (cmd.pump || cmd.phe) {
      const open = valves.findIndex((v, i) => v && i < n());
      const i = open >= 0 ? open : n() === 1 ? 0 : -1;
      if (i < 0) msg = 'Open a valve first';
      else start(i, cmd.phe ? 'phe' : 'pump', false);
    }
    if (cmd.valve) {
      const { i, open } = cmd.valve;
      if (!open && src && active === i) {
        msg = 'Pump stopped first';
        stop();
      } else if (open && src && i !== active && fillable(i)) {
        valves[i] = true;
        const prev = active;
        active = i;
        setTimeout(() => (valves[prev] = false), 1000);
      } else if (!src && config.semi[i]?.valve) valves[i] = open;
    }
    if (cmd.fill) {
      if (src) stop(true);
      start(cmd.fill.i, cmd.fill.src, false);
    }
    if (cmd.pumpCheck) {
      const tanks = config.semi.flatMap((t, i) => (autoCapable(config, i) ? [i] : []));
      if (src || !tanks.length) msg = src ? 'Busy. Stop filling first.' : 'No tank with a sensor to check.';
      else {
        check = { run: true, rows: [] };
        setTimeout(() => {
          check = {
            run: false,
            rows: tanks.map((i, k) => {
              const pctMin = [4.2, 11, 0.9, 6, 3, 7, 5, 2][k % 8];
              const litres = config.semi[i].litres;
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
    const pheShare = config.phe.enabled ? 0.4 : 0;
    const share = config.semi.map((_, i) => 1 / (i + 2));
    const sum = share.reduce((a, b) => a + b, 0);
    return days.map((date, i) => ({
      date,
      litres: use[i % 7],
      pumpMin: pt[i % 7] * (1 - pheShare),
      pheLitres: use[i % 7] * pheShare,
      perTank: share.map((f) => ({
        litres: (use[i % 7] * f) / sum,
        pumpMin: (pt[i % 7] * (1 - pheShare) * f) / sum,
        pheLitres: (use[i % 7] * pheShare * f) / sum,
      })),
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
      if (src && !fillable(active)) stop();
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
