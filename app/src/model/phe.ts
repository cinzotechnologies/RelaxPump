// PHE module (docs/two-module-system.md §1, §3, §4.2): 1–5 PHE supply lines, each a sensor + valve
// pair on one tank, no pump. Auto opens a line's valve below `low` (reopen) and closes it at `high`.
// Pure functions shared by the PHE store, Installer setup, Add device and the tests. The same limits
// are enforced by database.rules.json and the firmware (lib/engine/src/phe.h).
import { clampCount, DEFAULT_TANK, list, type TankConfig } from './layout';

export const PHE_LOW_MIN = 50;
export const PHE_LOW_MAX = 95;
export const PHE_HIGH_MIN = 60;
export const PHE_HIGH_MAX = 100;
/** reopen + 5 <= close */
export const PHE_GAP = 5;

/** A PHE line: the tank it fills (name, size, sensor distances). No heightFt. */
export type PheLine = Omit<TankConfig, 'heightFt'>;

/** The `config` node of a PHE board. `tankCount` in the database = `lines.length` here. */
export type PheConfig = {
  lines: PheLine[];
  /** Reopen below (50–95, default 85). */
  low: number;
  /** Close at (60–100, default 95). */
  high: number;
};

export const DEFAULT_PHE: PheConfig = {
  lines: [{ litres: null, emptyCm: DEFAULT_TANK.emptyCm, fullCm: DEFAULT_TANK.fullCm }],
  low: 85,
  high: 95,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

/** Reopen slider: keeps 5 below close. */
export function setPheLow(v: number, high: number): number {
  return clamp(Math.min(v, high - PHE_GAP), PHE_LOW_MIN, PHE_LOW_MAX);
}

/** Close slider: keeps 5 above reopen. */
export function setPheHigh(v: number, low: number): number {
  return clamp(Math.max(v, low + PHE_GAP), PHE_HIGH_MIN, PHE_HIGH_MAX);
}

/** Default name of line i: "Line 1". */
export function lineName(names: readonly (string | null | undefined)[], i: number): string {
  return names[i]?.trim() || `Line ${i + 1}`;
}

type Raw = Record<string, unknown> | null | undefined;
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

export function normalizePheConfig(raw: Raw): PheConfig {
  if (!raw) return DEFAULT_PHE;
  const linesRaw = list<Raw>(raw.tanks);
  const count = clampCount(num(raw.tankCount, linesRaw.length || 1));
  const high = clamp(num(raw.high, DEFAULT_PHE.high), PHE_HIGH_MIN, PHE_HIGH_MAX);
  return {
    lines: Array.from({ length: count }, (_, i) => {
      const t = linesRaw[i];
      return {
        name: str(t?.name),
        litres: numOrNull(t?.litres),
        emptyCm: num(t?.emptyCm, DEFAULT_TANK.emptyCm),
        fullCm: num(t?.fullCm, DEFAULT_TANK.fullCm),
      };
    }),
    low: setPheLow(num(raw.low, DEFAULT_PHE.low), high),
    high,
  };
}

/** What the database stores (the rules refuse main, maxRunMin and heightFt on a PHE board). */
export function serializePheConfig(c: PheConfig): Record<string, unknown> {
  return {
    tankCount: c.lines.length,
    tanks: c.lines.map((t) =>
      Object.fromEntries(
        Object.entries({
          name: t.name?.trim() || null,
          litres: t.litres,
          emptyCm: t.emptyCm,
          fullCm: t.fullCm,
        }).filter(([, v]) => v !== null && v !== undefined),
      ),
    ),
    low: c.low,
    high: c.high,
  };
}

/** Line count change in setup: keeps the lines that stay, adds default ones. */
export function resizeLines(c: PheConfig, n: number): PheConfig {
  const count = clampCount(n);
  return {
    ...c,
    lines: Array.from({ length: count }, (_, i) => c.lines[i] ?? { ...DEFAULT_PHE.lines[0] }),
  };
}
