import type { DeviceEvent } from '@/model/types';

import { ago, tankName } from './format';

export type NotifRow = { id: string; title: string; sub: string; tone: 'ok' | 'warn' | 'pump' };

/**
 * Turn a device event into a Notifications sheet row. `low` is the current Start threshold,
 * `names` the user's tank names (missing → "Tank N").
 */
export function eventRow(
  e: DeviceEvent,
  low: number,
  now = Date.now(),
  names: readonly (string | null | undefined)[] = [],
): NotifRow {
  const when = ago(e.ts, now);
  const tank = tankName(names, e.tank);
  switch (e.type) {
    case 'full':
      return { id: e.id, title: `${tank} is full`, sub: `Pump stopped · ${when}`, tone: 'ok' };
    case 'low':
      return { id: e.id, title: `${tank} is low`, sub: `Below ${low}% · ${when}`, tone: 'warn' };
    case 'pump_on':
      return {
        id: e.id,
        title: `Filling ${tank}`,
        sub: `${e.auto ? 'Auto' : 'Manual'} · ${when}`,
        tone: 'pump',
      };
    case 'pump_off':
      return {
        id: e.id,
        title: e.min ? `Pump ran ${Math.round(e.min)} min` : 'Pump stopped',
        sub: `${e.auto ? 'Auto' : 'Manual'} · ${when}`,
        tone: 'pump',
      };
    case 'dry_run':
      return {
        id: e.id,
        title: 'Pump stopped',
        sub: `${tank} not rising. Check the sump · ${when}`,
        tone: 'warn',
      };
    case 'timeout':
      return { id: e.id, title: 'Pump stopped', sub: `Ran too long · ${when}`, tone: 'warn' };
    case 'sensor':
      return { id: e.id, title: `${tank} sensor error`, sub: `Pump stopped · ${when}`, tone: 'warn' };
  }
}

/** Short toast text for a fresh event, or null if it does not need one. */
export function eventToast(
  e: DeviceEvent,
  names: readonly (string | null | undefined)[] = [],
): string | null {
  switch (e.type) {
    case 'full':
      return `${tankName(names, e.tank)} full`;
    case 'pump_on':
      return `Filling ${tankName(names, e.tank)}`;
    case 'dry_run':
    case 'timeout':
    case 'sensor':
      return 'Pump stopped';
    default:
      return null;
  }
}
