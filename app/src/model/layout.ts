// v2 customizable system (docs/flexible-system.md): 1–5 semi tanks, each with a sensor + valve
// pair (one tank = sensor only, the pump fills it directly), optional main-tank sensor, 6 relays
// (V1–V5 + pump), no PHE. Pure functions, shared by the stores, the installer setup and the tests.
// The same rules are enforced by database.rules.json and the firmware.

export const MAX_TANKS = 5;
/** Relay channels on the controller: V1–V5 + pump. */
export const RELAYS = 6;
export const MAIN_MIN_PCT_MIN = 5;
export const MAIN_MIN_PCT_MAX = 40;

export type Board = 'v1' | 'v2';

export type TankConfig = {
  name?: string | null;
  litres: number | null;
  emptyCm: number;
  fullCm: number;
  /** Height above the main tank (pump sizing, Auto tie-break). */
  heightFt?: number | null;
};

export type MainConfig = {
  enabled: boolean;
  litres: number | null;
  emptyCm: number;
  fullCm: number;
  /** The pump never starts, and stops, below this level. */
  minPct: number;
};

/** The `config` node. `tankCount` in the database = `tanks.length` here. */
export type LayoutConfig = {
  tanks: TankConfig[];
  main: MainConfig;
  low: number;
  high: number;
  maxRunMin: number;
};

export const DEFAULT_TANK: TankConfig = { litres: null, emptyCm: 120, fullCm: 30 };
export const DEFAULT_MAIN: MainConfig = {
  enabled: false,
  litres: null,
  emptyCm: 200,
  fullCm: 30,
  minPct: 10,
};

export const DEFAULT_LAYOUT: LayoutConfig = {
  tanks: [DEFAULT_TANK, DEFAULT_TANK, DEFAULT_TANK],
  main: DEFAULT_MAIN,
  low: 20,
  high: 95,
  maxRunMin: 30,
};

// ------------------------------------------------------------------ rules

/** 2+ tanks: every tank has a valve. One tank: no valve, the pump fills it directly. */
export function hasValves(count: number): boolean {
  return count >= 2;
}

export function valveCount(count: number): number {
  return hasValves(count) ? count : 0;
}

/** Relays in use: one per valve + the pump ("Relays used x of 6"). */
export function relaysUsed(count: number): number {
  return valveCount(count) + 1;
}

/** "2 of 5 tank ports free". */
export function freePorts(count: number, maxTanks = MAX_TANKS): number {
  return Math.max(0, Math.min(MAX_TANKS, maxTanks) - count);
}

export function clampCount(n: number, maxTanks = MAX_TANKS): number {
  return Math.max(1, Math.min(Math.min(MAX_TANKS, maxTanks), Math.round(n)));
}

/** Port label of tank i in the setup: "T2 · sensor + valve" / "T1 · sensor only". */
export function portLabel(i: number, count: number): string {
  return hasValves(count) ? `T${i + 1} · sensor + valve` : 'T1 · sensor only';
}

// ------------------------------------------------------------------ reading the database

type Raw = Record<string, unknown> | null | undefined;
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

/**
 * RTDB returns arrays as arrays or, with gaps, as {"0": …, "2": …} objects. Every entry keeps its
 * index (a gap becomes undefined), so tank 3 never slides into tank 2's place.
 */
export function list<T = unknown>(v: unknown): (T | undefined)[] {
  if (Array.isArray(v)) return Array.from(v as T[]);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).filter((k) => /^\d+$/.test(k) && +k < 100);
    if (!keys.length) return [];
    const len = Math.max(...keys.map(Number)) + 1;
    return Array.from({ length: len }, (_, i) => (v as Record<string, T>)[String(i)]);
  }
  return [];
}

function tankOf(t: Raw): TankConfig {
  return {
    name: str(t?.name),
    litres: numOrNull(t?.litres),
    emptyCm: num(t?.emptyCm, DEFAULT_TANK.emptyCm),
    fullCm: num(t?.fullCm, DEFAULT_TANK.fullCm),
    heightFt: numOrNull(t?.heightFt),
  };
}

/** `config` → LayoutConfig. Older configs (no `main`) mean "no main tank sensor". */
export function normalizeConfig(raw: Raw): LayoutConfig {
  if (!raw) return DEFAULT_LAYOUT;
  const tanksRaw = list<Raw>(raw.tanks);
  const count = clampCount(num(raw.tankCount, tanksRaw.length || 3));
  const m = raw.main as Raw;
  return {
    tanks: Array.from({ length: count }, (_, i) => tankOf(tanksRaw[i])),
    main: {
      enabled: bool(m?.enabled, false),
      litres: numOrNull(m?.litres),
      emptyCm: num(m?.emptyCm, DEFAULT_MAIN.emptyCm),
      fullCm: num(m?.fullCm, DEFAULT_MAIN.fullCm),
      minPct: num(m?.minPct, DEFAULT_MAIN.minPct),
    },
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
    tankCount: c.tanks.length,
    tanks: c.tanks.map((t) =>
      clean({
        name: t.name?.trim() || null,
        litres: t.litres,
        emptyCm: t.emptyCm,
        fullCm: t.fullCm,
        heightFt: t.heightFt,
      }),
    ),
    main: clean({ ...c.main }),
    low: c.low,
    high: c.high,
    maxRunMin: c.maxRunMin,
  };
}
