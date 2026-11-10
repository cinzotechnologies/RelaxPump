// v2 flexible system (docs/flexible-system.md §2, §5): 1–8 semi tanks with optional sensor/valve,
// optional PHE line and main-tank sensor. Pure functions, shared by the stores, the installer
// setup and the tests. The same rules are enforced by database.rules.json and the firmware.

export const MAX_SEMI = 8;
export const FILL_MIN_MIN = 1;
export const FILL_MIN_MAX = 120;
export const MAIN_MIN_PCT_MIN = 5;
export const MAIN_MIN_PCT_MAX = 40;

export type Board = 'v1' | 'v2';
export type Ports = { sensors: number; valves: number; phe: boolean; main: boolean };
export type Mode = 'auto' | 'phe' | 'pump';
export type Source = 'pump' | 'phe';

export type SemiConfig = {
  name?: string | null;
  litres: number | null;
  emptyCm: number;
  fullCm: number;
  heightFt?: number | null;
  sensor: boolean;
  valve: boolean;
  /** Required when there is no sensor: the fill runs for this many minutes. */
  fillMin?: number | null;
};

export type MainConfig = {
  enabled: boolean;
  sensor: boolean;
  litres: number | null;
  emptyCm: number;
  fullCm: number;
  /** The pump never starts, and stops, below this level. */
  minPct: number;
};

export type PheConfig = { enabled: boolean; probeMin: number; retryMin: number };

export type LayoutConfig = {
  semi: SemiConfig[];
  main: MainConfig;
  phe: PheConfig;
  mode: Mode;
  low: number;
  high: number;
  maxRunMin: number;
};

export const V1_PORTS: Ports = { sensors: 3, valves: 3, phe: false, main: false };
export const V2_PORTS: Ports = { sensors: 8, valves: 8, phe: true, main: true };

export const DEFAULT_SEMI: SemiConfig = { litres: null, emptyCm: 120, fullCm: 30, sensor: true, valve: true };
export const DEFAULT_MAIN: MainConfig = {
  enabled: false,
  sensor: false,
  litres: null,
  emptyCm: 200,
  fullCm: 30,
  minPct: 10,
};
export const DEFAULT_PHE: PheConfig = { enabled: false, probeMin: 4, retryMin: 30 };

export const DEFAULT_LAYOUT: LayoutConfig = {
  semi: [DEFAULT_SEMI, DEFAULT_SEMI, DEFAULT_SEMI],
  main: DEFAULT_MAIN,
  phe: DEFAULT_PHE,
  mode: 'pump',
  low: 20,
  high: 95,
  maxRunMin: 30,
};

// ------------------------------------------------------------------ validation

export type TankError = 'needs-valve' | 'needs-fill-time' | 'no-port';
export const TANK_ERROR_TEXT: Record<TankError, string> = {
  'needs-valve': 'Needs a valve — you have more than one tank.',
  'needs-fill-time': 'Set a fill time — this tank has no sensor.',
  'no-port': 'This controller has no port for this tank.',
};

export type LayoutErrors = {
  /** One entry per semi tank (null = fine). */
  tanks: (TankError | null)[];
  count?: 'too-few' | 'too-many';
  main?: 'no-port';
  phe?: 'no-port';
  mode?: 'phe-missing';
};

export function tankError(t: SemiConfig, i: number, count: number, ports: Ports): TankError | null {
  if (i >= ports.sensors && t.sensor) return 'no-port';
  if (i >= ports.valves && t.valve) return 'no-port';
  if (count > 1 && !t.valve) return 'needs-valve';
  if (!t.sensor) {
    const m = t.fillMin ?? 0;
    if (!(m >= FILL_MIN_MIN && m <= FILL_MIN_MAX)) return 'needs-fill-time';
  }
  return null;
}

export function validateLayout(cfg: LayoutConfig, ports: Ports): LayoutErrors {
  const n = cfg.semi.length;
  const out: LayoutErrors = { tanks: cfg.semi.map((t, i) => tankError(t, i, n, ports)) };
  if (n < 1) out.count = 'too-few';
  if (n > Math.max(ports.sensors, ports.valves) || n > MAX_SEMI) out.count = 'too-many';
  if (cfg.main.enabled && !ports.main) out.main = 'no-port';
  if (cfg.phe.enabled && !ports.phe) out.phe = 'no-port';
  if (cfg.mode === 'phe' && !cfg.phe.enabled) out.mode = 'phe-missing';
  return out;
}

export function isLayoutValid(e: LayoutErrors): boolean {
  return !e.count && !e.main && !e.phe && !e.mode && e.tanks.every((t) => t === null);
}

// ------------------------------------------------------------------ helpers

/** Which tanks Auto may fill: sensor + valve (or the single tank with a sensor). */
export function autoTanks(cfg: Pick<LayoutConfig, 'semi'>): number[] {
  const n = cfg.semi.length;
  return cfg.semi.flatMap((t, i) => (t.sensor && (t.valve || n === 1) ? [i] : []));
}

/** Modes offered to the user: PHE only when the PHE line is installed. */
export function modeOptions(phe: boolean): { k: Mode; label: string }[] {
  return [
    { k: 'auto' as Mode, label: 'Auto' },
    ...(phe ? [{ k: 'phe' as Mode, label: 'PHE only' }] : []),
    { k: 'pump' as Mode, label: 'Pump only' },
  ];
}

/** A stored mode that no longer fits the layout (PHE removed) falls back to Auto. */
export function effectiveMode(mode: Mode, phe: boolean): Mode {
  return mode === 'phe' && !phe ? 'auto' : mode;
}

export function modeHelp(mode: Mode, phe: boolean): string {
  if (mode === 'phe') return 'Fills only from the PHE line. The pump is never started.';
  if (mode === 'pump') return 'Fills only with the pump from the main tank.';
  return phe
    ? 'Uses PHE water when it comes. If no water arrives in 4 minutes, it switches to the pump.'
    : 'Fills any tank that drops below its start level, using the pump.';
}

/** First source to try for a fill in this mode. */
export function firstSource(mode: Mode, phe: boolean): Source {
  return effectiveMode(mode, phe) === 'pump' || !phe ? 'pump' : 'phe';
}

/** Free tank ports, for "5 of 8 tank ports free". */
export function freePorts(cfg: Pick<LayoutConfig, 'semi'>, ports: Ports): number {
  return Math.max(0, Math.max(ports.sensors, ports.valves) - cfg.semi.length);
}

// ------------------------------------------------------------------ reading the database

type Raw = Record<string, unknown> | null | undefined;
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

/** RTDB returns arrays as arrays or, with gaps, as {"0": …} objects. */
export function list<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object')
    return Object.keys(v)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => +a - +b)
      .map((k) => (v as Record<string, T>)[k]);
  return [];
}

export function portsOf(info: { ports?: Partial<Ports> | null; maxTanks?: number | null; board?: string | null } | null): Ports {
  if (info?.ports && typeof info.ports.sensors === 'number')
    return {
      sensors: num(info.ports.sensors, 3),
      valves: num(info.ports.valves, num(info.ports.sensors, 3)),
      phe: bool(info.ports.phe, false),
      main: bool(info.ports.main, false),
    };
  if (info?.board === 'v2') return V2_PORTS;
  const n = Math.max(1, Math.min(MAX_SEMI, num(info?.maxTanks, 3)));
  return { sensors: n, valves: n, phe: false, main: false };
}

function semiOf(t: Raw): SemiConfig {
  const sensor = bool(t?.sensor, true);
  return {
    name: str(t?.name),
    litres: numOrNull(t?.litres),
    emptyCm: num(t?.emptyCm, DEFAULT_SEMI.emptyCm),
    fullCm: num(t?.fullCm, DEFAULT_SEMI.fullCm),
    heightFt: numOrNull(t?.heightFt),
    sensor,
    valve: bool(t?.valve, true),
    fillMin: numOrNull(t?.fillMin),
  };
}

/**
 * Reads either shape: v2 (`semi`, `main`, `phe`, `mode`) or v1 (`tankCount` + `tanks`, every
 * tank with sensor and valve). The app reads both until every controller is migrated.
 */
export function normalizeConfig(raw: Raw): LayoutConfig {
  if (!raw) return DEFAULT_LAYOUT;
  const semiRaw = list<Raw>(raw.semi);
  let semi: SemiConfig[];
  if (semiRaw.length) semi = semiRaw.map(semiOf);
  else {
    const tanks = list<Raw>(raw.tanks);
    const count = Math.max(1, Math.min(MAX_SEMI, num(raw.tankCount, tanks.length || 3)));
    semi = Array.from({ length: count }, (_, i) => ({ ...semiOf(tanks[i]), sensor: true, valve: true }));
  }
  const m = raw.main as Raw;
  const p = raw.phe as Raw;
  const phe: PheConfig = {
    enabled: bool(p?.enabled, false),
    probeMin: num(p?.probeMin, DEFAULT_PHE.probeMin),
    retryMin: num(p?.retryMin, DEFAULT_PHE.retryMin),
  };
  const modeRaw = raw.mode;
  const mode: Mode = modeRaw === 'auto' || modeRaw === 'phe' || modeRaw === 'pump' ? modeRaw : 'pump';
  return {
    semi,
    main: {
      enabled: bool(m?.enabled, false),
      sensor: bool(m?.sensor, false),
      litres: numOrNull(m?.litres),
      emptyCm: num(m?.emptyCm, DEFAULT_MAIN.emptyCm),
      fullCm: num(m?.fullCm, DEFAULT_MAIN.fullCm),
      minPct: num(m?.minPct, DEFAULT_MAIN.minPct),
    },
    phe,
    mode,
    low: num(raw.low, DEFAULT_LAYOUT.low),
    high: num(raw.high, DEFAULT_LAYOUT.high),
    maxRunMin: num(raw.maxRunMin, DEFAULT_LAYOUT.maxRunMin),
  };
}

/** What the database stores for a layout (no nulls/undefined; RTDB drops them anyway). */
export function serializeConfig(c: LayoutConfig): Record<string, unknown> {
  const clean = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
  return {
    semi: c.semi.map((t) =>
      clean({
        name: t.name?.trim() || null,
        litres: t.litres,
        emptyCm: t.emptyCm,
        fullCm: t.fullCm,
        heightFt: t.heightFt,
        sensor: t.sensor,
        valve: t.valve,
        fillMin: t.sensor ? null : t.fillMin,
      }),
    ),
    main: clean({ ...c.main }),
    phe: { ...c.phe },
    mode: c.mode,
    low: c.low,
    high: c.high,
    maxRunMin: c.maxRunMin,
  };
}

/** May Auto (and the pump check) fill tank i? Sensor + valve, or the single tank with a sensor. */
export function autoCapable(cfg: Pick<LayoutConfig, 'semi'>, i: number): boolean {
  const t = cfg.semi[i];
  return !!t && t.sensor && (t.valve || cfg.semi.length === 1);
}
