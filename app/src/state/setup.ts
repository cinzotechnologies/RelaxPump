// Installer setup wizard (reference/design-v2/AppSetup.dc.html): a pure draft + reducer, so the
// steps and their validation are unit-tested without the screen.
//   Household: PIN → 1 Semi tanks (1–5) → 2 Your tanks (name, size, height) → 3 Main tank
//              → 4 Check wiring → 5 Save (summary) → Saved
//   PHE (docs/two-module-system.md §5.2, same PIN): 1 PHE lines (1–5) → 2 Your lines (name, size,
//              sensor distances) → 3 Reopen & close → 4 Check wiring (valves only) → 5 Save
import {
  clampCount,
  DEFAULT_MAIN,
  DEFAULT_TANK,
  hasValves,
  MAIN_MIN_PCT_MAX,
  MAIN_MIN_PCT_MIN,
  MAX_TANKS,
  portLabel,
  RELAYS,
  relaysUsed,
  type LayoutConfig,
  type TankConfig,
} from '@/model/layout';
import { setPheHigh, setPheLow, type PheConfig } from '@/model/phe';

export const STEP_TITLES = ['Semi tanks', 'Your tanks', 'Main tank', 'Check wiring', 'Save'] as const;
export const PHE_STEP_TITLES = ['PHE lines', 'Your lines', 'Reopen & close', 'Check wiring', 'Save'] as const;
/** Reopen / close step: 5 % per tap. */
export const PHE_PCT_STEP = 5;
export const SIZE_CHIPS = [500, 1000, 1500, 2000] as const;
export const HEIGHT_STEP = 5;
export const HEIGHT_MIN = 5;
export const HEIGHT_MAX = 100;
export const HEIGHT_DEFAULT = 20;
export const MIN_PCT_STEP = 5;
/**
 * Level = where the water is between the tank bottom and the full line, seen from the sensor on
 * the lid. Stored as distances from the sensor: fullCm (sensor → full line, the gap above the
 * water) and emptyCm = fullCm + tank height (water depth when full).
 */
export const DIST_STEP = 5;
export const FULL_CM_MIN = 25; // ultrasonic blind zone
export const EMPTY_CM_MAX = 500;
export const DEPTH_MIN = 10;
const DIST_GAP = 10;

/** Tank height in cm (bottom → full water line). */
export const depthOf = (t: Pick<TankConfig, 'emptyCm' | 'fullCm'>) => t.emptyCm - t.fullCm;

/** Level the controller would show for a sensor reading with these distances (0–100, rounded). */
export function levelAt(t: Pick<TankConfig, 'emptyCm' | 'fullCm'>, cm: number): number {
  const span = Math.max(5, t.emptyCm - t.fullCm);
  return Math.round(Math.min(100, Math.max(0, ((t.emptyCm - cm) * 100) / span)));
}

export type Draft = {
  n: number;
  /** Always MAX_TANKS entries, so lowering and raising the count keeps what was typed. */
  tanks: TankConfig[];
  mainOn: boolean;
  minPct: number;
  /** Tank count before this setup (to warn when going from 1 to 2+ tanks). */
  wasN: number;
  /** Most tanks the controller's firmware supports (5; 3 on the first firmware). */
  max: number;
  base: LayoutConfig;
  /** PHE board: tanks = PHE lines (no heights, no main tank, no pump). */
  phe: boolean;
  /** PHE reopen below / close at (household uses base.low/high, set on the Tanks screen). */
  low: number;
  high: number;
};

export function draftFrom(cfg: LayoutConfig, maxTanks = MAX_TANKS): Draft {
  const max = clampCount(maxTanks);
  const tanks = Array.from({ length: MAX_TANKS }, (_, i) => {
    const t = cfg.tanks[i] ?? DEFAULT_TANK;
    return { ...DEFAULT_TANK, ...t, heightFt: t.heightFt ?? HEIGHT_DEFAULT };
  });
  return {
    n: clampCount(cfg.tanks.length || 1, max),
    tanks,
    mainOn: cfg.main.enabled,
    minPct: cfg.main.minPct || DEFAULT_MAIN.minPct,
    wasN: cfg.tanks.length,
    max,
    base: cfg,
    phe: false,
    low: cfg.low,
    high: cfg.high,
  };
}

/** PHE setup draft: the lines take the tanks' place (same name, size and sensor distances). */
export function draftFromPhe(cfg: PheConfig, maxTanks = MAX_TANKS): Draft {
  const d = draftFrom(
    {
      tanks: cfg.lines.map((l) => ({ ...l })),
      main: DEFAULT_MAIN,
      low: cfg.low,
      high: cfg.high,
      maxRunMin: 30,
    },
    maxTanks,
  );
  return { ...d, phe: true, mainOn: false };
}

export function draftToPhe(d: Draft): PheConfig {
  return {
    lines: d.tanks
      .slice(0, d.n)
      .map((t) => ({ name: t.name, litres: t.litres, emptyCm: t.emptyCm, fullCm: t.fullCm })),
    low: d.low,
    high: d.high,
  };
}

export type Action =
  | { type: 'count'; n: number }
  | { type: 'tank'; i: number; patch: Partial<TankConfig> }
  | { type: 'height'; i: number; delta: number }
  /** Tank height in cm (bottom → full water line). */
  | { type: 'depth'; i: number; cm: number }
  /** Sensor → full water line in cm (keeps the tank height). */
  | { type: 'gap'; i: number; cm: number }
  /** Sensor → tank bottom, from a live reading of the empty tank. */
  | { type: 'emptyAt'; i: number; cm: number }
  | { type: 'main'; on: boolean }
  | { type: 'minPct'; delta: number }
  /** PHE reopen below / close at, ±5 % (kept 5 apart). */
  | { type: 'pheLow'; delta: number }
  | { type: 'pheHigh'; delta: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function reduce(d: Draft, a: Action): Draft {
  switch (a.type) {
    case 'count':
      return { ...d, n: clampCount(a.n, d.max) };
    case 'tank': {
      const tanks = d.tanks.slice();
      tanks[a.i] = { ...tanks[a.i], ...a.patch };
      return { ...d, tanks };
    }
    case 'height': {
      const tanks = d.tanks.slice();
      const cur = tanks[a.i].heightFt ?? HEIGHT_DEFAULT;
      tanks[a.i] = { ...tanks[a.i], heightFt: clamp(cur + a.delta, HEIGHT_MIN, HEIGHT_MAX) };
      return { ...d, tanks };
    }
    case 'depth':
    case 'gap':
    case 'emptyAt': {
      const tanks = d.tanks.slice();
      const t = tanks[a.i];
      const cm = Math.round(a.cm);
      if (a.type === 'depth') {
        const depth = clamp(cm, DEPTH_MIN, EMPTY_CM_MAX - t.fullCm);
        tanks[a.i] = { ...t, emptyCm: t.fullCm + depth };
      } else if (a.type === 'gap') {
        const depth = depthOf(t);
        const fullCm = clamp(cm, FULL_CM_MIN, EMPTY_CM_MAX - depth);
        tanks[a.i] = { ...t, fullCm, emptyCm: fullCm + depth };
      } else {
        tanks[a.i] = { ...t, emptyCm: clamp(cm, t.fullCm + DIST_GAP, EMPTY_CM_MAX) };
      }
      return { ...d, tanks };
    }
    case 'main':
      return d.phe ? d : { ...d, mainOn: a.on };
    case 'pheLow':
      return { ...d, low: setPheLow(d.low + a.delta, d.high) };
    case 'pheHigh':
      return { ...d, high: setPheHigh(d.high + a.delta, d.low) };
    case 'minPct':
      return { ...d, minPct: clamp(d.minPct + a.delta, MAIN_MIN_PCT_MIN, MAIN_MIN_PCT_MAX) };
  }
}

/** Help under the big count (step 1). */
export function countHelp(d: Draft): string {
  if (d.phe)
    return 'Each PHE line has a sensor on its tank (T) and a valve on its pipe (V) with the same number. No pump.';
  if (d.n === 1) return 'One tank needs only a sensor — the pump fills it directly, no valve.';
  if (d.wasN === 1)
    return 'With 2 or more tanks every tank needs a valve — fit a valve on tank 1 too, then wire each tank to its port.';
  return 'Each tank has a sensor and a valve: tank 1 uses T1, tank 2 uses T2, and so on.';
}

export function tankPorts(d: Draft, i: number): string {
  return d.phe ? `T${i + 1} · sensor + valve` : portLabel(i, d.n);
}

export function draftToConfig(d: Draft): LayoutConfig {
  return {
    ...d.base,
    tanks: d.tanks.slice(0, d.n).map((t) => ({ ...t })),
    main: { ...(d.base.main ?? DEFAULT_MAIN), enabled: d.mainOn, minPct: d.minPct },
  };
}

export function summaryText(d: Draft): string {
  if (d.phe)
    return `${d.n} PHE ${d.n === 1 ? 'line' : 'lines'} · reopen below ${d.low}% · close at ${d.high}%.`;
  return `${d.n} semi ${d.n === 1 ? 'tank' : 'tanks'}${d.mainOn ? ' · main tank sensor' : ''}.`;
}

export function summaryRows(d: Draft): { k: string; v: string }[] {
  if (d.phe)
    return [
      { k: 'PHE lines', v: String(d.n) },
      { k: 'Sensors', v: String(d.n) },
      { k: 'Valves', v: String(d.n) },
      { k: 'Reopen below', v: `${d.low}%` },
      { k: 'Close at', v: `${d.high}%` },
    ];
  return [
    { k: 'Semi tanks', v: String(d.n) },
    { k: 'Sensors', v: String(d.n) },
    { k: 'Valves', v: hasValves(d.n) ? String(d.n) : 'None (one tank)' },
    { k: 'Main tank sensor', v: d.mainOn ? `Yes · stop below ${d.minPct}%` : 'No' },
    { k: 'Relays used', v: `${relaysUsed(d.n)} of ${RELAYS}` },
  ];
}

const nameOf = (d: Draft, i: number) => d.tanks[i]?.name?.trim() || `${d.phe ? 'Line' : 'Tank'} ${i + 1}`;

/** Outputs to test on step 4: V<n> per tank (2+ tanks), then PUMP. PHE: a valve per line, no pump. */
export function outputsOf(d: Draft): { port: string; name: string }[] {
  const valves =
    d.phe || hasValves(d.n)
      ? Array.from({ length: d.n }, (_, i) => ({ port: `V${i + 1}`, name: `${nameOf(d, i)} valve` }))
      : [];
  return d.phe ? valves : [...valves, { port: 'PUMP', name: 'Pump' }];
}

/** Sensors to check on step 4, with what the controller reports. */
export function sensorChecksOf(
  d: Draft,
  detected: { tanks: boolean[]; main: boolean } | null,
): { port: string; name: string; state: 'ok' | 'bad' | 'wait' }[] {
  const st = (v: boolean | undefined) => (detected ? (v ? 'ok' : 'bad') : 'wait') as 'ok' | 'bad' | 'wait';
  return Array.from({ length: d.n }, (_, i) => ({
    port: `T${i + 1}`,
    name: nameOf(d, i),
    state: st(detected?.tanks[i]),
  })).concat(d.mainOn ? [{ port: 'MAIN', name: 'Main tank', state: st(detected?.main) }] : []);
}
