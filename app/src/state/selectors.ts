import { tankName } from '@/logic/format';
import { activeTank } from '@/logic/pump';
import type { DeviceConfig, DeviceState } from '@/model/types';

import { useDevice } from './device';

export { isOnline } from './device';

export type TankView = {
  i: number;
  name: string;
  /** null = no sensor (fills by timer) or no reading. */
  pct: number | null;
  hasSensor: boolean;
  hasValve: boolean;
  valve: boolean;
  ok: boolean;
  litres: number | null;
  fillMin: number;
  active: boolean;
};

/** Merge live state and config into the per-tank view the screens render (1–8 tanks). */
export function tankViews(state: DeviceState | null, config: DeviceConfig): TankView[] {
  const act = activeTank(state);
  const names = config.semi.map((c) => c.name);
  return config.semi.map((c, i) => {
    const t = state?.semi[i];
    const ok = c.sensor ? (t?.ok ?? false) : true;
    return {
      i,
      name: tankName(names, i),
      pct: c.sensor && ok && t?.pct != null ? Math.round(t.pct) : null,
      hasSensor: c.sensor,
      hasValve: c.valve,
      valve: !!t?.valve,
      ok,
      litres: c.litres ?? null,
      fillMin: c.fillMin ?? 10,
      active: i === act,
    };
  });
}

/** Average of the tanks that have a level. */
export function averageLevel(tanks: TankView[]): { avg: number; count: number } {
  const withLevel = tanks.filter((t) => t.pct !== null);
  const count = tanks.filter((t) => t.hasSensor).length;
  if (!withLevel.length) return { avg: 0, count };
  return { avg: Math.round(withLevel.reduce((a, t) => a + (t.pct ?? 0), 0) / withLevel.length), count };
}

export function useTanks(): TankView[] {
  const state = useDevice((d) => d.state);
  const config = useDevice((d) => d.config);
  return tankViews(state, config);
}
