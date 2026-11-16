// Simulated PHE board for the mock backend: the PHE engine in miniature (firmware
// lib/engine/src/phe.h). 1–5 lines, each a sensor + valve. Auto opens a valve below `low` and closes
// it at `high`; a valve opened by hand still closes at `high`. PHE water comes and goes on its own
// schedule (EXPO_PUBLIC_MOCK_SUPPLY=off keeps it dry): open lines rise only while it flows.
import { DEFAULT_PHE, type PheConfig } from '@/model/phe';
import type { DeviceCommand, DeviceEvent, DeviceInfo, DeviceState, UsageDay } from '@/model/types';

const NAMES = ['Main tank', 'Kitchen line', 'Garden tank', 'Shop tank', 'Back tank'];
const PCTS = [64, 97, 40, 88, 22];
const LITRES = [1000, 500, 1000, 500, 750];

export function mockPheConfig(lines = 2): PheConfig {
  const n = Math.max(1, Math.min(5, lines));
  return {
    lines: Array.from({ length: n }, (_, i) => ({
      ...DEFAULT_PHE.lines[0],
      name: NAMES[i],
      litres: LITRES[i],
    })),
    low: 85,
    high: 95,
  };
}

export type PheSim = {
  info: () => DeviceInfo;
  state: () => DeviceState;
  config: () => PheConfig;
  events: () => DeviceEvent[];
  usage: (days: string[]) => UsageDay[];
  apply: (cmd: Omit<DeviceCommand, 'ts'>) => void;
  setConfig: (c: PheConfig) => void;
  patch: (p: Record<string, string | number | null>) => void;
  tick: () => void;
};

export function createPheSim(
  id: string,
  lines: number,
  opts: { supply: boolean; fw: string; owner: string; emitEvents: () => void },
): PheSim {
  let config = mockPheConfig(lines);
  const levels = PCTS.slice();
  const manual = new Array<boolean | null>(5).fill(null); // null = auto decides
  const valves = new Array<boolean>(5).fill(false);
  const risingSince = new Array<number>(5).fill(0);
  let autoMode = true;
  let msg = '';
  let flowing = opts.supply;
  let flowFlip = Date.now() + 45_000;
  let lastSupply: DeviceState['supply'] = 'unknown';
  const events: DeviceEvent[] = [
    { id: `${id}-e2`, type: 'phe_full', tank: 1, ts: Date.now() - 25 * 60000 },
    { id: `${id}-e1`, type: 'flow_start', tank: -1, ts: Date.now() - 50 * 60000 },
  ];
  let seq = 3;
  const n = () => config.lines.length;
  const addEvent = (type: DeviceEvent['type'], tank: number) => {
    events.unshift({ id: `${id}-e${seq++}`, type, tank, ts: Date.now(), auto: autoMode });
    opts.emitEvents();
  };

  const decide = () => {
    for (let i = 0; i < n(); i++) {
      const full = levels[i] >= config.high;
      if (full && valves[i]) {
        valves[i] = false;
        manual[i] = null;
        addEvent('phe_full', i);
        continue;
      }
      if (manual[i] !== null) valves[i] = !!manual[i] && !full;
      else if (autoMode) {
        if (levels[i] < config.low) valves[i] = true;
      } else valves[i] = false;
    }
    for (let i = n(); i < 5; i++) valves[i] = false;
  };
  decide();

  const supply = (): DeviceState['supply'] => {
    const open = valves.slice(0, n()).some(Boolean);
    if (!open) return 'unknown';
    return flowing ? 'flowing' : 'none';
  };

  return {
    info: () => ({
      name: 'RelaxPump PHE',
      fw: opts.fw,
      board: 'v3',
      maxTanks: 5,
      ownerUid: opts.owner,
      type: 'phe',
      flash: 8,
    }),
    state: () => ({
      online: true,
      lastSeen: Date.now(),
      rssi: -61,
      ssid: 'Home_WiFi',
      pump: false,
      auto: autoMode,
      msg,
      active: null,
      tanks: config.lines.map((_, i) => ({
        pct: Math.round(levels[i]),
        valve: valves[i],
        ok: true,
        rising: valves[i] && flowing && Date.now() - risingSince[i] > 1500,
      })),
      main: null,
      detected: { tanks: Array.from({ length: 5 }, (_, i) => i < n() + 1), main: false },
      cm: Array.from({ length: 6 }, (_, i) => {
        const t = config.lines[i];
        return t ? Math.round(t.emptyCm - (levels[i] / 100) * (t.emptyCm - t.fullCm)) : null;
      }),
      check: null,
      supply: supply(),
      fwAvailable: null,
      ota: null,
    }),
    config: () => JSON.parse(JSON.stringify(config)) as PheConfig,
    events: () => events.slice(0, 30),
    usage: (days) =>
      days.map((date, d) => {
        const per = config.lines.map((l, i) => ({ litres: ((l.litres ?? 500) * ((d + i) % 4)) / 10, pumpMin: 0 }));
        return { date, litres: per.reduce((a, p) => a + p.litres, 0), pumpMin: 0, perTank: per };
      }),
    apply: (cmd) => {
      msg = '';
      if (cmd.auto !== undefined) {
        autoMode = cmd.auto;
        manual.fill(null);
      }
      if (cmd.valve && cmd.valve.i < n()) {
        const { i, open } = cmd.valve;
        if (open && levels[i] >= config.high) msg = `${config.lines[i].name ?? `Line ${i + 1}`} is already full.`;
        else {
          manual[i] = open;
          if (open && !valves[i]) risingSince[i] = Date.now();
        }
      }
      decide();
    },
    setConfig: (c) => {
      config = JSON.parse(JSON.stringify(c)) as PheConfig;
      decide();
    },
    patch: (p) => {
      const c = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
      for (const [path, v] of Object.entries(p)) {
        const keys = path.replace(/^tanks\//, 'lines/').split('/');
        let o = c;
        for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
        o[keys[keys.length - 1]] = v;
      }
      config = c as unknown as PheConfig;
      decide();
    },
    tick: () => {
      if (opts.supply && Date.now() > flowFlip) {
        flowing = !flowing;
        flowFlip = Date.now() + (flowing ? 60_000 : 30_000);
      }
      for (let i = 0; i < n(); i++) {
        if (valves[i] && flowing) levels[i] = Math.min(100, levels[i] + 0.9);
        else levels[i] = Math.max(0, levels[i] - 0.05);
      }
      decide();
      const s = supply();
      if (s !== lastSupply && s !== 'unknown') {
        if (s === 'flowing') addEvent('flow_start', -1);
        else if (lastSupply === 'flowing') addEvent('flow_stop', -1);
      }
      lastSupply = s;
    },
  };
}
