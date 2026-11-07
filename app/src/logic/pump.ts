// Client-side checks that mirror the controller's safety rules (the device enforces them too).
import type { DeviceConfig, TankConfig, TankState } from '@/model/types';

import { DEFAULT_TANK } from '@/model/types';

export const LOW_MIN = 5;
export const LOW_MAX = 80;
export const HIGH_MIN = 20;
export const HIGH_MAX = 100;
export const MIN_GAP = 10;
export const STEP = 5;

/** Index of the tank being filled, or -1. Only one valve is open while the pump runs. */
export function activeTank(pump: boolean, tanks: Pick<TankState, 'valve'>[]): number {
  return pump ? tanks.findIndex((t) => t.valve) : -1;
}

export type PumpDecision = { ok: true; on: boolean } | { ok: false; msg: string };

/** Start needs at least one open valve. Stopping is always allowed. */
export function decidePump(pump: boolean, tanks: Pick<TankState, 'valve'>[]): PumpDecision {
  if (pump) return { ok: true, on: false };
  if (!tanks.some((t) => t.valve)) return { ok: false, msg: 'Open a valve first' };
  return { ok: true, on: true };
}

export type ValveDecision =
  | { kind: 'toggle'; open: boolean }
  /** Closing the last open valve while the pump runs: stop the pump first. */
  | { kind: 'stopPumpFirst'; msg: string };

export function decideValve(i: number, pump: boolean, tanks: Pick<TankState, 'valve'>[]): ValveDecision {
  const open = tanks.filter((t) => t.valve).length;
  if (tanks[i]?.valve && pump && open === 1) return { kind: 'stopPumpFirst', msg: 'Pump stopped first' };
  return { kind: 'toggle', open: !tanks[i]?.valve };
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

/** Change the tank count (1…maxTanks), keeping existing per-tank settings. */
export function resizeConfig(cfg: DeviceConfig, n: number, maxTanks: number): DeviceConfig {
  const count = Math.max(1, Math.min(maxTanks, Math.round(n)));
  const tanks: TankConfig[] = cfg.tanks.slice(0, count);
  while (tanks.length < count) tanks.push({ ...DEFAULT_TANK });
  return { ...cfg, tankCount: count, tanks };
}

/** Litres field: digits only, max 6, empty → null. */
export function parseLitres(text: string): number | null {
  const digits = text.replace(/\D/g, '').slice(0, 6);
  const n = digits ? parseInt(digits, 10) : 0;
  return n > 0 ? n : null;
}

/** Lowest tank below `low` (auto mode pick), or -1. Skips tanks with sensor errors. */
export function pickLowest(tanks: TankState[], low: number, except = -1): number {
  let best = -1;
  tanks.forEach((t, i) => {
    if (i === except || !t.ok || t.pct >= low) return;
    if (best < 0 || t.pct < tanks[best].pct) best = i;
  });
  return best;
}
