// Installer setup wizard (reference/design-v2/AppSetup.dc.html): a pure draft + reducer, so the
// steps and their validation are unit-tested without the screen.
import {
  DEFAULT_MAIN,
  DEFAULT_PHE,
  DEFAULT_SEMI,
  FILL_MIN_MAX,
  MAIN_MIN_PCT_MAX,
  MAIN_MIN_PCT_MIN,
  MAX_SEMI,
  effectiveMode,
  modeOptions,
  tankError,
  TANK_ERROR_TEXT,
  type LayoutConfig,
  type Mode,
  type Ports,
  type SemiConfig,
} from '@/model/layout';

export const STEP_TITLES = ['Semi tanks', 'Your tanks', 'Main tank & PHE', 'Check wiring', 'Water source'] as const;
export const SIZE_CHIPS = [500, 1000, 1500, 2000] as const;
export const FILL_STEP = 5;
export const FILL_MIN_LOW = 5;
export const MIN_PCT_STEP = 5;

export type Draft = {
  n: number;
  /** Always MAX_SEMI entries, so lowering and raising the count keeps what was typed. */
  tanks: SemiConfig[];
  mainOn: boolean;
  minPct: number;
  pheOn: boolean;
  mode: Mode;
  base: LayoutConfig;
};

export function maxTanksOf(ports: Ports): number {
  return Math.min(MAX_SEMI, Math.max(ports.sensors, ports.valves));
}

export function draftFrom(cfg: LayoutConfig, ports: Ports): Draft {
  const tanks = Array.from({ length: MAX_SEMI }, (_, i) => {
    const t = cfg.semi[i] ?? DEFAULT_SEMI;
    return { ...DEFAULT_SEMI, ...t, fillMin: t.fillMin ?? 10 };
  });
  return {
    n: Math.max(1, Math.min(maxTanksOf(ports), cfg.semi.length || 1)),
    tanks,
    mainOn: ports.main && cfg.main.enabled && cfg.main.sensor,
    minPct: cfg.main.minPct || DEFAULT_MAIN.minPct,
    pheOn: ports.phe && cfg.phe.enabled,
    mode: cfg.mode,
    base: cfg,
  };
}

export type Action =
  | { type: 'count'; n: number }
  | { type: 'tank'; i: number; patch: Partial<SemiConfig> }
  | { type: 'fillMin'; i: number; delta: number }
  | { type: 'main'; on: boolean }
  | { type: 'minPct'; delta: number }
  | { type: 'phe'; on: boolean }
  | { type: 'mode'; mode: Mode };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function reduce(d: Draft, a: Action, ports: Ports): Draft {
  switch (a.type) {
    case 'count':
      return { ...d, n: clamp(a.n, 1, maxTanksOf(ports)) };
    case 'tank': {
      const tanks = d.tanks.slice();
      tanks[a.i] = { ...tanks[a.i], ...a.patch };
      if (a.i >= ports.sensors) tanks[a.i].sensor = false;
      if (a.i >= ports.valves) tanks[a.i].valve = false;
      return { ...d, tanks };
    }
    case 'fillMin': {
      const tanks = d.tanks.slice();
      const cur = tanks[a.i].fillMin ?? 10;
      tanks[a.i] = { ...tanks[a.i], fillMin: clamp(cur + a.delta, FILL_MIN_LOW, FILL_MIN_MAX) };
      return { ...d, tanks };
    }
    case 'main':
      return { ...d, mainOn: a.on && ports.main };
    case 'minPct':
      return { ...d, minPct: clamp(d.minPct + a.delta, MAIN_MIN_PCT_MIN, MAIN_MIN_PCT_MAX) };
    case 'phe': {
      const pheOn = a.on && ports.phe;
      return { ...d, pheOn, mode: effectiveMode(d.mode, pheOn) };
    }
    case 'mode':
      return { ...d, mode: effectiveMode(a.mode, d.pheOn) };
  }
}

/** Per visible tank: the inline error text, or ''. */
export function tankErrors(d: Draft, ports: Ports): string[] {
  return d.tanks.slice(0, d.n).map((t, i) => {
    const e = tankError(t, i, d.n, ports);
    return e ? TANK_ERROR_TEXT[e] : '';
  });
}

/** Next is disabled while the step has errors. */
export function stepBlocked(d: Draft, step: number, ports: Ports): boolean {
  if (step === 1) return tankErrors(d, ports).some(Boolean);
  return false;
}

export function draftToConfig(d: Draft): LayoutConfig {
  return {
    ...d.base,
    semi: d.tanks.slice(0, d.n).map((t) => ({
      ...t,
      fillMin: t.sensor ? null : (t.fillMin ?? 10),
    })),
    main: { ...(d.base.main ?? DEFAULT_MAIN), enabled: d.mainOn, sensor: d.mainOn, minPct: d.minPct },
    phe: { ...(d.base.phe ?? DEFAULT_PHE), enabled: d.pheOn },
    mode: effectiveMode(d.mode, d.pheOn),
  };
}

export function modesOf(d: Draft) {
  return modeOptions(d.pheOn);
}

export function summaryText(d: Draft): string {
  return `${d.n} semi ${d.n === 1 ? 'tank' : 'tanks'}${d.pheOn ? ' · PHE' : ''}${d.mainOn ? ' · main tank sensor' : ''}.`;
}

export function summaryRows(d: Draft): { k: string; v: string }[] {
  const T = d.tanks.slice(0, d.n);
  const mode = modesOf(d).find((m) => m.k === effectiveMode(d.mode, d.pheOn));
  return [
    { k: 'Semi tanks', v: String(d.n) },
    { k: 'With sensor', v: `${T.filter((t) => t.sensor).length} of ${d.n}` },
    { k: 'Main tank sensor', v: d.mainOn ? `Yes · stop below ${d.minPct}%` : 'No' },
    { k: 'PHE line', v: d.pheOn ? 'Yes' : 'No' },
    { k: 'Mode', v: mode?.label ?? 'Auto' },
  ];
}

/** Outputs to test on step 4: V<n> for tanks with a valve, PHE, PUMP. */
export function outputsOf(d: Draft): { port: string; name: string }[] {
  const names = d.tanks.map((t, i) => t.name?.trim() || `Tank ${i + 1}`);
  return d.tanks
    .slice(0, d.n)
    .flatMap((t, i) => (t.valve ? [{ port: `V${i + 1}`, name: names[i] }] : []))
    .concat(d.pheOn ? [{ port: 'PHE', name: 'PHE line' }] : [])
    .concat([{ port: 'PUMP', name: 'Pump' }]);
}

/** Sensors to check on step 4, with what the controller reports. */
export function sensorChecksOf(
  d: Draft,
  detected: { s: boolean[]; main: boolean } | null,
): { port: string; name: string; state: 'ok' | 'bad' | 'wait' }[] {
  const names = d.tanks.map((t, i) => t.name?.trim() || `Tank ${i + 1}`);
  const st = (v: boolean | undefined) => (detected ? (v ? 'ok' : 'bad') : 'wait') as 'ok' | 'bad' | 'wait';
  return d.tanks
    .slice(0, d.n)
    .flatMap((t, i) => (t.sensor ? [{ port: `S${i + 1}`, name: names[i], state: st(detected?.s[i]) }] : []))
    .concat(d.mainOn ? [{ port: 'MAIN', name: 'Main tank', state: st(detected?.main) }] : []);
}
