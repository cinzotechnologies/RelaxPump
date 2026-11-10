// Client-side checks that mirror the controller's safety rules (the device enforces them too).
import { firstSource, type LayoutConfig } from '@/model/layout';
import type { DeviceCommand, SemiState } from '@/model/types';

export const LOW_MIN = 5;
export const LOW_MAX = 80;
export const HIGH_MIN = 20;
export const HIGH_MAX = 100;
export const MIN_GAP = 10;
export const STEP = 5;

type Live = { pump: boolean; phe: boolean; active: number | null; semi: Pick<SemiState, 'valve'>[] };

/** Index of the tank being filled, or -1. */
export function activeTank(s: Live | null): number {
  if (!s || !(s.pump || s.phe)) return -1;
  if (s.active !== null && s.active >= 0) return s.active;
  const i = s.semi.findIndex((t) => t.valve);
  return i >= 0 ? i : s.semi.length === 1 ? 0 : -1;
}

export type StartDecision =
  | { ok: true; cmd: Omit<DeviceCommand, 'ts'>; label: string }
  | { ok: false; msg: string };

/**
 * "Start filling" / "Stop filling". Stop is always allowed. Start uses the open valve (or the only
 * tank) and the source from the mode: PHE first in Auto when the line is installed.
 */
export function decideStart(s: Live, cfg: Pick<LayoutConfig, 'semi' | 'mode' | 'phe'>): StartDecision {
  if (s.pump || s.phe) return { ok: true, cmd: { pump: false }, label: 'Stopped' };
  const src = firstSource(cfg.mode, cfg.phe.enabled);
  if (cfg.semi.length === 1) return { ok: true, cmd: { fill: { i: 0, src } }, label: 'Filling' };
  const open = s.semi.findIndex((t, i) => t.valve && cfg.semi[i]?.valve);
  if (open < 0) return { ok: false, msg: 'Open a valve first' };
  return { ok: true, cmd: src === 'phe' ? { phe: true } : { pump: true }, label: src === 'phe' ? 'PHE on' : 'Pump on' };
}

export type ValveDecision =
  | { kind: 'toggle'; open: boolean }
  /** Closing the valve of the tank being filled: stop the source first. */
  | { kind: 'stopPumpFirst'; msg: string };

export function decideValve(i: number, s: Live): ValveDecision {
  if (s.semi[i]?.valve && activeTank(s) === i) return { kind: 'stopPumpFirst', msg: 'Pump stopped first' };
  return { kind: 'toggle', open: !s.semi[i]?.valve };
}

const snap = (v: number) => Math.round(v / STEP) * STEP;

/** Start below 5–80 %, kept ≥ 10 below Stop. */
export function setLow(v: number, high: number): number {
  return Math.min(Math.max(LOW_MIN, Math.min(LOW_MAX, snap(v))), high - MIN_GAP);
}

/** Stop at 20–100 %, kept ≥ 10 above Start. */
export function setHigh(v: number, low: number): number {
  return Math.max(Math.max(HIGH_MIN, Math.min(HIGH_MAX, snap(v))), low + MIN_GAP);
}

/** Litres field: digits only, max 6, empty → null. */
export function parseLitres(text: string): number | null {
  const digits = text.replace(/\D/g, '').slice(0, 6);
  const n = digits ? parseInt(digits, 10) : 0;
  return n > 0 ? n : null;
}

/** Lowest tank below `low` (Auto's pick), or -1. Skips tanks without a level or with errors. */
export function pickLowest(tanks: Pick<SemiState, 'pct' | 'ok'>[], low: number, except = -1): number {
  let best = -1;
  tanks.forEach((t, i) => {
    if (i === except || !t.ok || t.pct === null || t.pct >= low) return;
    if (best < 0 || t.pct < (tanks[best].pct ?? 0)) best = i;
  });
  return best;
}
