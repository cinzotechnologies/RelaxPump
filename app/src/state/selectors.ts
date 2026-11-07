import { activeTank } from '@/logic/pump';
import type { DeviceConfig, DeviceState } from '@/model/types';

import { OFFLINE_AFTER_MS, useDevice } from './device';

export type TankView = {
  i: number;
  name: string;
  pct: number;
  valve: boolean;
  ok: boolean;
  litres: number | null;
  active: boolean;
};

/** Merge live state and config into the per-tank view the screens render. */
export function tankViews(state: DeviceState | null, config: DeviceConfig): TankView[] {
  const n = config.tankCount;
  const act = state ? activeTank(state.pump, state.tanks) : -1;
  return Array.from({ length: n }, (_, i) => {
    const t = state?.tanks[i];
    return {
      i,
      name: `Tank ${i + 1}`,
      pct: Math.round(t?.pct ?? 0),
      valve: !!t?.valve,
      ok: t?.ok ?? false,
      litres: config.tanks[i]?.litres ?? null,
      active: i === act,
    };
  });
}

export function isOnline(state: DeviceState | null, now = Date.now()): boolean {
  return !!state?.online && now - (state.lastSeen ?? 0) < OFFLINE_AFTER_MS;
}

export function useTanks(): TankView[] {
  const state = useDevice((d) => d.state);
  const config = useDevice((d) => d.config);
  return tankViews(state, config);
}
