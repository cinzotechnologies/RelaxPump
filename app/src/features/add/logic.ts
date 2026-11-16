// Add device (app/add.tsx): the pure parts, unit tested.
import { resizeLines, type PheConfig } from '@/model/phe';
import type { LayoutConfig } from '@/model/layout';
import type { ModuleType, TestPort } from '@/model/types';
import { draftFrom, draftToConfig, reduce } from '@/state/setup';

export const HH_NAMES = ['Roof', 'Kitchen', 'Bathroom', 'Garden', 'Guest'];
export const PHE_NAMES = ['Main tank', 'Kitchen line', 'Garden tank', 'Shop tank', 'Back tank'];
export type Step = 0 | 1 | 2 | 3 | 4 | 5;

/** Step titles; step 4 depends on the module. */
export function stepTitle(step: Step, type: ModuleType): string {
  return [
    'Add device',
    'Wi-Fi',
    'Connecting',
    type === 'phe' ? 'PHE lines' : 'Semi tanks',
    'Check wiring',
    'Done',
  ][step];
}

/** Port tag of row i: household one tank = sensor only. */
export function portsOf(type: ModuleType, n: number, i: number): string {
  if (type === 'household' && n === 1) return 'T1 · sensor only';
  return `T${i + 1} + V${i + 1}`;
}

export function countHelpOf(type: ModuleType, n: number): string {
  if (type === 'phe')
    return 'Each PHE line has a sensor on its tank (T) and a valve on its pipe (V). No pump is needed.';
  return n === 1
    ? 'One tank needs only a sensor — the pump fills it directly.'
    : 'Each tank has a sensor (T) and a valve (V) with the same number.';
}

/** What step 5 tests: valves (household only with 2+ tanks), then the pump (household). */
export function outputsFor(type: ModuleType, n: number, names: string[]): { port: TestPort; name: string }[] {
  const valves =
    type === 'phe' || n > 1
      ? names.slice(0, n).map((nm, i) => ({ port: `V${i + 1}` as TestPort, name: `${nm} valve` }))
      : [];
  return type === 'household' ? [...valves, { port: 'PUMP', name: 'Pump' }] : valves;
}

/** Household layout from the board's current config + what Add device asked. */
export function householdConfig(
  base: LayoutConfig,
  n: number,
  names: string[],
  mainOn: boolean,
): LayoutConfig {
  let d = draftFrom(base);
  d = reduce(d, { type: 'count', n });
  for (let i = 0; i < n; i++) d = reduce(d, { type: 'tank', i, patch: { name: names[i]?.trim() || null } });
  d = reduce(d, { type: 'main', on: mainOn });
  return draftToConfig(d);
}

export function pheConfig(base: PheConfig, n: number, names: string[]): PheConfig {
  const c = resizeLines(base, n);
  return { ...c, lines: c.lines.map((l, i) => ({ ...l, name: names[i]?.trim() || null })) };
}
