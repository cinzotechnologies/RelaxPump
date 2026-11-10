// Client-side checks that mirror the controller's safety rules (the device enforces them too).
import { hasValves } from '@/model/layout';
import type { DeviceCommand, TankState } from '@/model/types';

export const LOW_MIN = 5;
export const LOW_MAX = 80;
export const HIGH_MIN = 20;
export const HIGH_MAX = 100;
export const MIN_GAP = 10;
export const STEP = 5;

type Live = { pump: boolean; active: number | null; tanks: Pick<TankState, 'valve'>[] };

/** Index of the tank being filled, or -1. */
export function activeTank(s: Live | null): number {
  if (!s || !s.pump) return -1;
  if (s.active !== null && s.active >= 0) return s.active;
  const i = s.tanks.findIndex((t) => t.valve);
  return i >= 0 ? i : s.tanks.length === 1 ? 0 : -1;
}

export type StartDecision =
  { ok: true; cmd: Omit<DeviceCommand, 'ts'>; label: string } | { ok: false; msg: string };

/**
 * "Start filling" / "Stop filling". Stop is always allowed. Start needs an open valve, except with
 * one tank (no valve: the pump fills it directly).
 */
export function decideStart(s: Live, tankCount: number): StartDecision {
  if (s.pump) return { ok: true, cmd: { pump: false }, label: 'Stopped' };
  if (!hasValves(tankCount)) return { ok: true, cmd: { pump: true }, label: 'Pump on' };
  const open = s.tanks.findIndex((t, i) => t.valve && i < tankCount);
  if (open < 0) return { ok: false, msg: 'Open a valve first' };
  return { ok: true, cmd: { pump: true }, label: 'Pump on' };
}

/** Fill one tank now: open its valve (2+ tanks) and start the pump in one command. */
export function fillCommand(i: number, tankCount: number): Omit<DeviceCommand, 'ts'> {
  return hasValves(tankCount) ? { valve: { i, open: true }, pump: true } : { pump: true };
}

export type ValveDecision =
  | { kind: 'toggle'; open: boolean }
  /** Closing the valve of the tank being filled: stop the pump first. */
  | { kind: 'stopPumpFirst'; msg: string };

export function decideValve(i: number, s: Live): ValveDecision {
  if (s.tanks[i]?.valve && activeTank(s) === i) return { kind: 'stopPumpFirst', msg: 'Pump stopped first' };
  return { kind: 'toggle', open: !s.tanks[i]?.valve };
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
export function pickLowest(tanks: Pick<TankState, 'pct' | 'ok'>[], low: number, except = -1): number {
  let best = -1;
  tanks.forEach((t, i) => {
    if (i === except || !t.ok || t.pct === null || t.pct >= low) return;
    if (best < 0 || t.pct < (tanks[best].pct ?? 0)) best = i;
  });
  return best;
}
