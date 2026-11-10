import { tankName } from '@/logic/format';
import { activeTank } from '@/logic/pump';
import { hasValves } from '@/model/layout';
import type { DeviceConfig, DeviceState } from '@/model/types';

import { useDevice } from './device';

export { isOnline } from './device';

export type TankView = {
  i: number;
  name: string;
  /** null = no reading (sensor error, or no state yet). */
  pct: number | null;
  /** 2+ tanks: every tank has a valve. One tank: none. */
  hasValve: boolean;
  valve: boolean;
  ok: boolean;
  litres: number | null;
  active: boolean;
};

/** Merge live state and config into the per-tank view the screens render (1–5 tanks). */
export function tankViews(state: DeviceState | null, config: DeviceConfig): TankView[] {
  const act = activeTank(state);
  const names = config.tanks.map((c) => c.name);
  const valves = hasValves(config.tanks.length);
  return config.tanks.map((c, i) => {
    const t = state?.tanks[i];
    const ok = t?.ok ?? false;
    return {
      i,
      name: tankName(names, i),
      pct: ok && t?.pct != null ? Math.round(t.pct) : null,
      hasValve: valves,
      valve: valves && !!t?.valve,
      ok,
      litres: c.litres ?? null,
      active: i === act,
    };
  });
}

/** Average of the tanks that have a level; `count` = tanks shown ("Average level · 3 tanks"). */
export function averageLevel(tanks: TankView[]): { avg: number; count: number } {
  const withLevel = tanks.filter((t) => t.pct !== null);
  const count = tanks.length;
  if (!withLevel.length) return { avg: 0, count };
  return { avg: Math.round(withLevel.reduce((a, t) => a + (t.pct ?? 0), 0) / withLevel.length), count };
}

export type MainView = {
  pct: number | null;
  ok: boolean;
  litres: number | null;
  minPct: number;
  low: boolean;
};

/** Main tank card (only when the main tank sensor is set up). */
export function mainView(state: DeviceState | null, config: DeviceConfig): MainView | null {
  if (!config.main.enabled) return null;
  const pct = state?.main?.ok ? (state.main.pct ?? null) : null;
  return {
    pct,
    ok: !!state?.main?.ok,
    litres: config.main.litres,
    minPct: config.main.minPct,
    low: pct !== null && pct < config.main.minPct,
  };
}

export function useTanks(): TankView[] {
  const state = useDevice((d) => d.state);
  const config = useDevice((d) => d.config);
  return tankViews(state, config);
}
