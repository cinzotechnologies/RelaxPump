// In-memory backend that behaves like a fleet of v3 controllers, for UI work without Firebase or a
// board (Expo Go, or EXPO_PUBLIC_BACKEND=mock). One account, many boards
// (docs/two-module-system.md §5):
//  - Household board: the v2 fill engine in miniature. 1–5 tanks (one tank = no valve, the pump
//    fills it directly), optional main tank sensor, Auto, pump check, test pulses.
//  - PHE board: services/mockPhe.ts (1–5 lines, no pump, supply comes and goes).
//  - Every board: installer PIN, OTA from firmware/stable (services/mockOta.ts).
//
//   EXPO_PUBLIC_MOCK_FLEET   both (default) | household | phe | none
//   EXPO_PUBLIC_MOCK_LAYOUT  household tanks "<n>[,main]", e.g. "1", "3,main" (default), "5,main"
//   EXPO_PUBLIC_MOCK_PHE     PHE lines 1–5 (default 2)
//   EXPO_PUBLIC_MOCK_SUPPLY  on (default) | off (PHE water never comes)
//   EXPO_PUBLIC_MOCK_OTA     available (default) | running | failed | none

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
import type { PheConfig } from '@/model/phe';
import type {
  CheckRow,
  DeviceCommand,
  DeviceEvent,
  DeviceInfo,
  DeviceState,
  FirmwareStable,
  ModuleType,
  Profile,
  SessionUser,
  UsageDay,
} from '@/model/types';

import { AuthError, ClaimError, type Backend, type Unsub } from './backend';
import { MOCK_DEVICE_ID, MOCK_NEW_BOARDS, MOCK_PHE_ID } from './mockBoards';
import { MOCK_STABLE, mockOtaMode, OtaSim, type MockOtaMode } from './mockOta';
import { createPheSim } from './mockPhe';

export { MOCK_DEVICE_ID, MOCK_PHE_ID } from './mockBoards';
export { mockPheConfig } from './mockPhe';

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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['Roof', 'Kitchen', 'Bathroom', 'Garden', 'Guest'];
const PCTS = [82, 46, 18, 64, 90];
const LITRES = [1000, 500, 500, 1000, 500];
const HEIGHTS = [30, 12, 20, 25, 15];
const TICK_MS = 700;

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

export type MockFleet = 'both' | 'household' | 'phe' | 'none';
export function mockFleet(v = process.env.EXPO_PUBLIC_MOCK_FLEET): MockFleet {
  return v === 'household' || v === 'phe' || v === 'none' ? v : 'both';
}

/** One simulated board, whatever its type: what the backend routes to by device id. */
type Board = {
  type: ModuleType;
  infoCh: Channel<DeviceInfo | null>;
  stateCh: Channel<DeviceState | null>;
  configCh: Channel<LayoutConfig | null>;
  pheConfigCh: Channel<PheConfig | null>;
  eventsCh: Channel<DeviceEvent[]>;
  usage: (days: string[]) => UsageDay[];
  apply: (cmd: Omit<DeviceCommand, 'ts'>) => void;
  patch: (p: Record<string, string | number | null>) => void;
  saveLayout: (cfg: LayoutConfig) => void;
  savePhe: (cfg: PheConfig) => void;
  pin: string | null;
  pinOk: boolean;
  owner: string | null;
  setOwner: (uid: string | null) => void;
};

// ------------------------------------------------------------------ household board

function householdBoard(id: string, spec: string | undefined, otaMode: MockOtaMode, owner: string | null): Board {
  const info: DeviceInfo = {
    name: 'RelaxPump Controller',
    fw: '3.0.0',
    board: 'v1',
    maxTanks: MAX_TANKS,
    ownerUid: owner,
    type: 'household',
    flash: 4,
  };
  let config: LayoutConfig = mockLayout(spec || undefined);
  const levels = PCTS.slice();
  let mainPct = 72;

  // Live controller state
  let pump = false;
  let active = -1;
  let runAuto = false;
  let manyOpen = false; // manual fill: every open valve fills
  let autoMode = true;
  let msg = '';
  const valves = new Array<boolean>(MAX_TANKS).fill(false);
  let check: { run: boolean; rows: CheckRow[] } | null = null;

  const now = Date.now();
  const events: DeviceEvent[] = [
    { id: `${id}-e3`, type: 'full', tank: 0, ts: now - 10 * 60000 },
    { id: `${id}-e2`, type: 'low', tank: 2 % config.tanks.length, ts: now - 60 * 60000 },
    { id: `${id}-e1`, type: 'pump_off', tank: 0, ts: new Date().setHours(6, 40, 0, 0), min: 25, auto: true },
  ];
  let evSeq = 4;
  let runStart = Date.now();

  const n = () => config.tanks.length;
  const valved = () => hasValves(n());
  const mainLow = () => config.main.enabled && mainPct < config.main.minPct;
  const addEvent = (e: Omit<DeviceEvent, 'id' | 'ts'>) => {
    events.unshift({ ...e, id: `${id}-e${evSeq++}`, ts: Date.now() });
    eventsCh.emit();
  };
  const snapshot = (): DeviceState => ({
    online: true,
    lastSeen: Date.now(),
    rssi: -55,
    ssid: 'Home_WiFi',
    pump,
    auto: autoMode,
    msg: ota.busy ? 'Updating software' : msg,
    active: pump && active >= 0 ? active : null,
    tanks: config.tanks.map((_, i) => ({
      pct: Math.round(levels[i]),
      valve: valved() && valves[i],
      ok: true,
      rising: false,
    })),
    main: config.main.enabled ? { pct: Math.round(mainPct), ok: true } : null,
    // Ports T1–T4 and MAIN answer in the demo; T5 has no cable.
    detected: { tanks: Array.from({ length: MAX_TANKS }, (_, i) => i < 4), main: true },
    // Distance the level would give with each tank's sensor distances (T5: no cable).
    cm: Array.from({ length: MAX_TANKS + 1 }, (_, i) => {
      if (i === MAX_TANKS) return config.main.enabled ? 60 : null;
      const t = config.tanks[i];
      if (i >= 4 || !t) return i < 4 ? 80 : null;
      return Math.round(t.emptyCm - (levels[i] / 100) * (t.emptyCm - t.fullCm));
    }),
    check,
    supply: null,
    fwAvailable: ota.available,
    ota: ota.ota,
  });

  const stateCh = new Channel<DeviceState | null>(snapshot);
  const configCh = new Channel<LayoutConfig | null>(() => JSON.parse(JSON.stringify(config)) as LayoutConfig);
  const infoCh = new Channel<DeviceInfo | null>(() => ({ ...info }));
  const eventsCh = new Channel<DeviceEvent[]>(() => events.slice(0, 30));
  const ota: OtaSim = new OtaSim(
    info.fw,
    otaMode,
    () => stateCh.emit(),
    (fw) => {
      info.fw = fw;
      infoCh.emit();
      addEvent({ type: 'ota_done', tank: -1 });
    },
  );

  const start = (i: number, auto: boolean) => {
    if (i < 0 || i >= n() || ota.busy) return;
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
    manyOpen = false;
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
    if (ota.busy) {
      // Updating: pump off, valves closed (the firmware's allStop).
      if (pump) stop();
    } else if (check?.run) {
      // handled by the pumpCheck timer
    } else if (pump && manyOpen) {
      // Manual fill (firmware 2.2): every open valve fills; a full tank closes its valve,
      // the last one stops the pump.
      if (mainLow()) {
        msg = 'Main tank is low. Pump stopped.';
        addEvent({ type: 'main_low', tank: -1 });
        stop();
      } else {
        for (let i = 0; i < n(); i++) {
          if (!valves[i]) continue;
          levels[i] = Math.min(100, levels[i] + 1.2);
          if (levels[i] >= config.high) {
            addEvent({ type: 'full', tank: i });
            if (valves.filter((v, k) => v && k < n()).length <= 1) stop();
            else valves[i] = false;
          }
        }
        if (pump) active = valves.findIndex((v, k) => v && k < n());
      }
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

  const apply = (cmd: Omit<DeviceCommand, 'ts'>) => {
    if (cmd.ota) {
      ota.request(cmd.ota.version, pump);
      return;
    }
    if (ota.busy) return; // the firmware ignores other commands while updating
    msg = '';
    if (cmd.auto !== undefined) autoMode = cmd.auto;
    if (cmd.pump !== undefined || cmd.valve) autoMode = false;
    if (cmd.valve && valved() && cmd.valve.i < n()) {
      // Firmware 2.2: opening a valve starts the pump; several valves may be open together.
      const { i, open } = cmd.valve;
      const openCount = valves.filter((v, k) => v && k < n()).length;
      if (open && levels[i] >= config.high) msg = `Tank ${i + 1} is already full.`;
      else if (open && pump) {
        valves[i] = true;
        manyOpen = true;
      } else if (open) {
        start(i, false);
        manyOpen = pump;
      } else if (pump && openCount <= 1) stop();
      else valves[i] = false;
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
    type: 'household',
    infoCh,
    stateCh,
    configCh,
    pheConfigCh: new Channel<PheConfig | null>(() => null),
    eventsCh,
    usage,
    apply,
    patch: (p) => {
      const c = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
      for (const [path, v] of Object.entries(p)) {
        const keys = path.split('/');
        let o = c as Record<string, unknown>;
        for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
        o[keys[keys.length - 1]] = v;
      }
      config = c as unknown as LayoutConfig;
      configCh.emit();
    },
    saveLayout: (cfg) => {
      // Tank removed, or one tank ↔ several (the water path changed): stop, like the firmware.
      if (pump && (active >= cfg.tanks.length || hasValves(cfg.tanks.length) !== valved())) stop();
      config = JSON.parse(JSON.stringify(cfg)) as LayoutConfig;
      configCh.emit();
      stateCh.emit();
    },
    savePhe: () => {},
    pin: null,
    pinOk: false,
    owner,
    setOwner(uid) {
      this.owner = uid;
      info.ownerUid = uid;
      infoCh.emit();
    },
  };
}

// ------------------------------------------------------------------ PHE board

function pheBoard(id: string, lines: number, supply: boolean, otaMode: MockOtaMode, firstOwner: string | null): Board {
  let owner = firstOwner;
  const sim = createPheSim(id, lines, { supply, fw: '3.0.0', owner: owner ?? '', emitEvents: () => eventsCh.emit() });
  let fw = '3.0.0';
  const stateCh = new Channel<DeviceState | null>(() => {
    const st = sim.state();
    return {
      ...st,
      msg: ota.busy ? 'Updating software' : st.msg,
      tanks: ota.busy ? st.tanks.map((t) => ({ ...t, valve: false, rising: false })) : st.tanks,
      fwAvailable: ota.available,
      ota: ota.ota,
    };
  });
  const infoCh = new Channel<DeviceInfo | null>(() => ({ ...sim.info(), fw, ownerUid: owner }));
  const pheConfigCh = new Channel<PheConfig | null>(() => sim.config());
  const eventsCh = new Channel<DeviceEvent[]>(() => sim.events());
  const ota: OtaSim = new OtaSim(
    fw,
    otaMode,
    () => stateCh.emit(),
    (v) => {
      fw = v;
      infoCh.emit();
    },
  );
  setInterval(() => {
    if (!ota.busy) sim.tick();
    stateCh.emit();
  }, TICK_MS);
  return {
    type: 'phe',
    infoCh,
    stateCh,
    configCh: new Channel<LayoutConfig | null>(() => null),
    pheConfigCh,
    eventsCh,
    usage: sim.usage,
    apply: (cmd) => {
      if (cmd.ota) ota.request(cmd.ota.version, false);
      else if (!ota.busy) sim.apply(cmd);
      stateCh.emit();
    },
    patch: (p) => {
      sim.patch(p);
      pheConfigCh.emit();
    },
    saveLayout: () => {},
    savePhe: (cfg) => {
      sim.setConfig(cfg);
      pheConfigCh.emit();
      stateCh.emit();
    },
    pin: null,
    pinOk: false,
    owner,
    setOwner(uid) {
      this.owner = uid;
      owner = uid;
      infoCh.emit();
    },
  };
}

// ------------------------------------------------------------------ backend

/** Demo accounts survive app restarts (Expo Go has no Firebase; this is the simulator's own store). */
const STORE_KEY = 'rp.mock.accounts.v1';
type Saved = {
  accounts: [string, { password: string; uid: string }][];
  profiles: [string, Profile][];
  /** Signed-in uid, so the demo stays signed in like Firebase does. */
  session?: string | null;
};

const isNewBoard = (id: string) => MOCK_NEW_BOARDS.some((b) => b.deviceId === id);

export function createMockBackend(
  spec = process.env.EXPO_PUBLIC_MOCK_LAYOUT,
  fleet: MockFleet = mockFleet(),
): Backend {
  const otaMode = mockOtaMode();
  const pheLines = parseInt(process.env.EXPO_PUBLIC_MOCK_PHE ?? '', 10) || 2;
  const supply = process.env.EXPO_PUBLIC_MOCK_SUPPLY !== 'off';

  let user: SessionUser | null = null;
  const demoDevices: Record<string, true> = {};
  if (fleet === 'both' || fleet === 'household') demoDevices[MOCK_DEVICE_ID] = true;
  if (fleet === 'both' || fleet === 'phe') demoDevices[MOCK_PHE_ID] = true;
  const accounts = new Map<string, { password: string; uid: string }>([
    ['9876543210', { password: 'relax123', uid: 'demo' }],
  ]);
  const profiles = new Map<string, Profile>([
    ['demo', { name: 'My Home', phone: '9876543210', devices: demoDevices, createdAt: Date.now() }],
  ]);

  // Boards are created on first use, so a fleet without PHE runs no PHE simulation.
  const boards = new Map<string, Board>();
  const typeOf = (id: string): ModuleType =>
    id === MOCK_PHE_ID ? 'phe' : (MOCK_NEW_BOARDS.find((b) => b.deviceId === id)?.type ?? 'household');
  const board = (id: string): Board => {
    let b = boards.get(id);
    if (!b) {
      const owner = id === MOCK_DEVICE_ID || id === MOCK_PHE_ID ? 'demo' : null;
      b =
        typeOf(id) === 'phe'
          ? pheBoard(id, id === MOCK_PHE_ID ? pheLines : 1, supply, otaMode, owner)
          : householdBoard(id, id === MOCK_DEVICE_ID ? spec : '2', otaMode, owner);
      boards.set(id, b);
    }
    return b;
  };

  const ready = AsyncStorage.getItem(STORE_KEY)
    .then((raw) => {
      if (!raw) return;
      const s = JSON.parse(raw) as Saved;
      s.accounts.forEach(([k, v]) => accounts.set(k, v));
      s.profiles.forEach(([k, v]) => profiles.set(k, v));
      // The demo account always shows the fleet picked by EXPO_PUBLIC_MOCK_FLEET (+ boards it added).
      const demo = profiles.get('demo');
      if (demo) {
        const added = Object.keys(demo.devices).filter(isNewBoard);
        demo.devices = { ...demoDevices, ...Object.fromEntries(added.map((id) => [id, true as const])) };
      }
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

  const auth = new Channel<SessionUser | null>(() => user);
  const stableCh = new Channel<FirmwareStable | null>(() => (otaMode === 'none' ? null : MOCK_STABLE));
  const profileChs = new Map<string, Channel<Profile | null>>();
  const profileCh = (uid: string) => {
    let ch = profileChs.get(uid);
    if (!ch) {
      ch = new Channel(() => profiles.get(uid) ?? null);
      profileChs.set(uid, ch);
    }
    return ch;
  };
  const setDevice = (id: string, on: boolean) => {
    const uid = user?.uid;
    const p = uid ? profiles.get(uid) : undefined;
    if (!uid || !p) return;
    const devices = { ...p.devices };
    if (on) devices[id] = true;
    else delete devices[id];
    p.devices = devices;
    save();
    profileCh(uid).emit();
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
    onInfo: (id, cb) => board(id).infoCh.sub(cb),
    onState: (id, cb) => board(id).stateCh.sub(cb),
    onConfig: (id, cb) => board(id).configCh.sub(cb),
    onPheConfig: (id, cb) => board(id).pheConfigCh.sub(cb),
    onEvents: (id, _limit, cb) => board(id).eventsCh.sub(cb),
    onUsage: (id, days, cb) => {
      cb(board(id).usage(days));
      return () => {};
    },
    onStable: (cb) => stableCh.sub(cb),
    async sendCommand(id, cmd) {
      board(id).apply(cmd);
    },
    async patchConfig(id, patch) {
      board(id).patch(patch);
    },
    async pinStatus(id) {
      await wait(300);
      return board(id).pin ? 'set' : 'none';
    },
    async verifyPin(id, p) {
      await wait(400);
      const b = board(id);
      b.pinOk = b.pin === null || p === b.pin;
      return b.pinOk;
    },
    async saveSetup(id, cfg, newPin) {
      await wait(600);
      const b = board(id);
      if (b.pin && !b.pinOk) throw new Error('PIN needed');
      if (newPin) b.pin = newPin;
      b.saveLayout(cfg);
    },
    async savePheSetup(id, cfg, newPin) {
      await wait(600);
      const b = board(id);
      if (b.pin && !b.pinOk) throw new Error('PIN needed');
      if (newPin) b.pin = newPin;
      b.savePhe(cfg);
    },
    async endSetup(id) {
      board(id).pinOk = false;
    },
    async claimDevice(deviceId, code) {
      await wait(800);
      if (code.length < 6) throw new ClaimError('bad-code', 'That code does not match this controller');
      const b = board(deviceId);
      if (b.owner && b.owner !== user?.uid)
        throw new ClaimError('already-claimed', 'This controller already has an owner');
      b.setOwner(user?.uid ?? null);
      setDevice(deviceId, true);
    },
    async releaseDevice(deviceId) {
      await wait(500);
      board(deviceId).setOwner(null);
      setDevice(deviceId, false);
    },
  };
}
