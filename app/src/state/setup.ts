// Installer setup wizard (reference/design-v2/AppSetup.dc.html): a pure draft + reducer, so the
// steps and their validation are unit-tested without the screen.
//   PIN → 1 Semi tanks (1–5) → 2 Your tanks (name, size, height) → 3 Main tank → 4 Check wiring
//   → 5 Save (summary) → Saved
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

export const STEP_TITLES = ['Semi tanks', 'Your tanks', 'Main tank', 'Check wiring', 'Save'] as const;
export const SIZE_CHIPS = [500, 1000, 1500, 2000] as const;
export const HEIGHT_STEP = 5;
export const HEIGHT_MIN = 5;
export const HEIGHT_MAX = 100;
export const HEIGHT_DEFAULT = 20;
export const MIN_PCT_STEP = 5;

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
  };
}

export type Action =
  | { type: 'count'; n: number }
  | { type: 'tank'; i: number; patch: Partial<TankConfig> }
  | { type: 'height'; i: number; delta: number }
  | { type: 'main'; on: boolean }
  | { type: 'minPct'; delta: number };

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
    case 'main':
      return { ...d, mainOn: a.on };
    case 'minPct':
      return { ...d, minPct: clamp(d.minPct + a.delta, MAIN_MIN_PCT_MIN, MAIN_MIN_PCT_MAX) };
  }
}

/** Help under the big count (step 1). */
export function countHelp(d: Draft): string {
  if (d.n === 1) return 'One tank needs only a sensor — the pump fills it directly, no valve.';
  if (d.wasN === 1)
    return 'With 2 or more tanks every tank needs a valve — fit a valve on tank 1 too, then wire each tank to its port.';
  return 'Each tank has a sensor and a valve: tank 1 uses T1, tank 2 uses T2, and so on.';
}

export function tankPorts(d: Draft, i: number): string {
  return portLabel(i, d.n);
}

export function draftToConfig(d: Draft): LayoutConfig {
  return {
    ...d.base,
    tanks: d.tanks.slice(0, d.n).map((t) => ({ ...t })),
    main: { ...(d.base.main ?? DEFAULT_MAIN), enabled: d.mainOn, minPct: d.minPct },
  };
}

export function summaryText(d: Draft): string {
  return `${d.n} semi ${d.n === 1 ? 'tank' : 'tanks'}${d.mainOn ? ' · main tank sensor' : ''}.`;
}

export function summaryRows(d: Draft): { k: string; v: string }[] {
  return [
    { k: 'Semi tanks', v: String(d.n) },
    { k: 'Sensors', v: String(d.n) },
    { k: 'Valves', v: hasValves(d.n) ? String(d.n) : 'None (one tank)' },
    { k: 'Main tank sensor', v: d.mainOn ? `Yes · stop below ${d.minPct}%` : 'No' },
    { k: 'Relays used', v: `${relaysUsed(d.n)} of ${RELAYS}` },
  ];
}

const nameOf = (d: Draft, i: number) => d.tanks[i]?.name?.trim() || `Tank ${i + 1}`;

/** Outputs to test on step 4: V<n> per tank (2+ tanks), then PUMP. */
export function outputsOf(d: Draft): { port: string; name: string }[] {
  const valves = hasValves(d.n)
    ? Array.from({ length: d.n }, (_, i) => ({ port: `V${i + 1}`, name: `${nameOf(d, i)} valve` }))
    : [];
  return [...valves, { port: 'PUMP', name: 'Pump' }];
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
