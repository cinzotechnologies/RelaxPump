// Voice / shortcut commands (Google Assistant, Android app shortcuts, Siri Shortcuts): the app is
// opened with relaxpump://do/<action> and runs it without a tap.
import type { TankState } from '@/model/types';

import { pickLowest } from './pump';

export type VoiceAction = 'pump-on' | 'pump-off' | 'auto-on' | 'auto-off';

const ACTIONS: VoiceAction[] = ['pump-on', 'pump-off', 'auto-on', 'auto-off'];

/** "relaxpump://do/pump-on", "/do/pump-on", "do/pump-on?x" → "pump-on"; anything else → null. */
export function parseVoicePath(path: string): VoiceAction | null {
  const m = path.match(/(?:^|\/)do\/([a-z-]+)\/?(?:[?#].*)?$/);
  const a = m?.[1] as VoiceAction | undefined;
  return a && ACTIONS.includes(a) ? a : null;
}

export type PumpOnPlan =
  { kind: 'already' } | { kind: 'pump' } | { kind: 'fill'; tank: number } | { kind: 'full' };

/**
 * "Pump on" by voice: use the open valve, else fill the emptiest tank (the controller opens its
 * valve first; one tank: the pump fills it directly).
 */
export function planPumpOn(filling: boolean, tanks: TankState[]): PumpOnPlan {
  if (filling) return { kind: 'already' };
  if (tanks.some((t) => t.valve)) return { kind: 'pump' };
  const i = pickLowest(tanks, 95);
  return i < 0 ? { kind: 'full' } : { kind: 'fill', tank: i };
}
