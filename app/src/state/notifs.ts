// Notifications sheet + the bell dot: events of the selected Household and PHE boards, newest
// first (docs/two-module-system.md §5.4: PHE flow_start, phe_full, overflow, sensor).
import { useShallow } from 'zustand/react/shallow';

import { eventRow, type NotifRow } from '@/logic/events';
import { lineName } from '@/model/phe';
import type { DeviceEvent, ModuleType } from '@/model/types';

import { useDevice } from './device';
import { usePhe } from './phe';

export type NotifItem = { row: NotifRow; event: DeviceEvent; module: ModuleType };

type Source = { events: DeviceEvent[]; low: number; names: (string | null | undefined)[] };

export function mergeEvents(hh: Source | null, phe: Source | null, now = Date.now(), limit = 8): NotifItem[] {
  const out: NotifItem[] = [];
  if (hh)
    for (const e of hh.events)
      out.push({ event: e, module: 'household', row: eventRow(e, hh.low, now, hh.names) });
  if (phe)
    for (const e of phe.events)
      out.push({
        event: e,
        module: 'phe',
        row: { ...eventRow(e, phe.low, now, phe.names, true), id: `phe-${e.id}` },
      });
  return out.sort((a, b) => b.event.ts - a.event.ts).slice(0, limit);
}

export function useNotifs(): NotifItem[] {
  const hh = useDevice(
    useShallow((d) => ({ id: d.id, events: d.events, low: d.config.low, tanks: d.config.tanks })),
  );
  const phe = usePhe(
    useShallow((p) => ({ id: p.id, events: p.events, low: p.config.low, lines: p.config.lines })),
  );
  const pheNames = phe.lines.map((l) => l.name);
  return mergeEvents(
    hh.id ? { events: hh.events, low: hh.low, names: hh.tanks.map((t) => t.name) } : null,
    phe.id
      ? { events: phe.events, low: phe.low, names: pheNames.map((_, i) => lineName(pheNames, i)) }
      : null,
  );
}

/** Bell dot: a newer event than the user has seen, on either board. */
export function useUnread(): boolean {
  const hh = useDevice((d) => (d.events[0]?.ts ?? 0) > d.seenTs);
  const phe = usePhe((p) => (p.events[0]?.ts ?? 0) > p.seenTs);
  return hh || phe;
}

export function markAllSeen() {
  useDevice.getState().markSeen();
  usePhe.getState().markSeen();
}
