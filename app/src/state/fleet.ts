// Every board on the account (docs/two-module-system.md §5: one account, many boards).
// Watches info + state of each board for the Home tabs, Account → My devices and the Software
// update card, and keeps which Household / PHE board is selected (saved on the phone).
// The selected household board is driven by useDevice, the selected PHE board by usePhe.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { cmpVersion } from '@/logic/ota';
import type { DeviceInfo, DeviceState, FirmwareStable, ModuleType } from '@/model/types';
import { backend } from '@/services';
import type { Unsub } from '@/services/backend';

import { isOnline } from './device';
import { useUi } from './ui';

const STORE_KEY = 'rp.fleet.v1';
const ONLINE_TICK_MS = 5_000;

export type FleetEntry = {
  id: string;
  info: DeviceInfo | null;
  state: DeviceState | null;
  online: boolean;
};

type Saved = { tab: ModuleType; household: string | null; phe: string | null };

type FleetStore = {
  /** Board ids on the account (users/{uid}/devices), in the order they were added. */
  ids: string[];
  devices: Record<string, FleetEntry>;
  stable: FirmwareStable | null;
  serverOffset: number;
  /** Home tab when the account has both types. */
  tab: ModuleType;
  /** Selected board of each type (the first one until the owner picks another). */
  householdId: string | null;
  pheId: string | null;
  /** True once every board's info has arrived (Home shows "Add your first device" only then). */
  loaded: boolean;
  /** Called by the session when the account's board list changes. */
  sync: (ids: string[]) => void;
  setTab: (t: ModuleType) => void;
  /**
   * My devices → tap a board, or Add device → done: it becomes the selected board of its type and
   * Home shows its tab (also when its info is still on the way).
   */
  select: (id: string) => void;
  /** Software update → Update now. False when the board would refuse it right now. */
  startUpdate: (id: string) => boolean;
  /** My devices → Remove from my account. */
  remove: (id: string) => Promise<boolean>;
};

let subs = new Map<string, Unsub[]>();
let common: Unsub[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
let saved: Saved | null = null;
let tabRestored = false;
/** select() before the board's info arrived (just added): applied when it does. */
let pendingSelect: string | null = null;
const savedReady = AsyncStorage.getItem(STORE_KEY)
  .then((raw) => {
    saved = raw ? (JSON.parse(raw) as Saved) : null;
  })
  .catch(() => {});

/** Boards of one type, in account order (boards whose info has not arrived are left out). */
export function idsOfType(devices: Record<string, FleetEntry>, ids: string[], type: ModuleType): string[] {
  return ids.filter((id) => devices[id]?.info?.type === type);
}

/** Selected id of a type: the saved one if it is still on the account, else the first. */
export function pick(list: string[], want: string | null | undefined): string | null {
  return want && list.includes(want) ? want : (list[0] ?? null);
}

export const useFleet = create<FleetStore>((set, get) => {
  const persist = () => {
    const { tab, householdId, pheId } = get();
    saved = { tab, household: householdId, phe: pheId };
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(saved)).catch(() => {});
  };
  /** Re-derive the selection and tab after any info change. */
  const recompute = () => {
    if (pendingSelect && get().devices[pendingSelect]?.info) {
      const id = pendingSelect;
      pendingSelect = null;
      get().select(id);
    }
    const { devices, ids, householdId, pheId, tab } = get();
    const hh = idsOfType(devices, ids, 'household');
    const phe = idsOfType(devices, ids, 'phe');
    const nextHh = pick(hh, householdId ?? saved?.household);
    const nextPhe = pick(phe, pheId ?? saved?.phe);
    // Stay on the chosen tab while that type exists, else show the type the account has.
    const nextTab: ModuleType = (tab === 'phe' ? nextPhe : !nextHh && nextPhe) ? 'phe' : 'household';
    const loaded = ids.every((id) => devices[id]?.info);
    if (nextHh !== householdId || nextPhe !== pheId || nextTab !== tab || loaded !== get().loaded)
      set({ householdId: nextHh, pheId: nextPhe, tab: nextTab, loaded });
  };
  const patchEntry = (id: string, p: Partial<FleetEntry>) => {
    const cur = get().devices[id];
    if (!cur) return;
    const next = { ...cur, ...p };
    next.online = isOnline(next.state, Date.now() + get().serverOffset);
    set({ devices: { ...get().devices, [id]: next } });
  };
  const recheck = () => {
    const now = Date.now() + get().serverOffset;
    let changed = false;
    const devices = { ...get().devices };
    for (const [id, e] of Object.entries(devices)) {
      const online = isOnline(e.state, now);
      if (online !== e.online) {
        devices[id] = { ...e, online };
        changed = true;
      }
    }
    if (changed) set({ devices });
  };

  return {
    ids: [],
    devices: {},
    stable: null,
    serverOffset: 0,
    tab: 'household',
    householdId: null,
    pheId: null,
    loaded: false,

    sync: (ids) => {
      const b = backend();
      // Common watches start with the first board and stop when the account has none.
      if (ids.length && !common.length) {
        common = [
          b.onStable((stable) => set({ stable })),
          b.onServerOffset((serverOffset) => set({ serverOffset })),
        ];
        timer = setInterval(recheck, ONLINE_TICK_MS);
      } else if (!ids.length && common.length) {
        common.forEach((u) => u());
        common = [];
        clearInterval(timer);
        timer = undefined;
      }
      const devices = { ...get().devices };
      for (const [id, us] of subs)
        if (!ids.includes(id)) {
          us.forEach((u) => u());
          subs.delete(id);
          delete devices[id];
        }
      const fresh = ids.filter((id) => !subs.has(id));
      for (const id of fresh) devices[id] = { id, info: null, state: null, online: false };
      set({ ids, devices, loaded: ids.every((id) => devices[id]?.info) });
      for (const id of fresh)
        subs.set(id, [
          b.onInfo(id, (info) => {
            patchEntry(id, { info });
            recompute();
          }),
          b.onState(id, (state) => patchEntry(id, { state })),
        ]);
      void savedReady.then(() => {
        if (saved && !tabRestored) {
          tabRestored = true;
          set({ tab: saved.tab });
        }
        recompute();
      });
      recompute();
    },

    setTab: (t) => {
      if (t === get().tab) return;
      set({ tab: t });
      persist();
    },

    select: (id) => {
      const type = get().devices[id]?.info?.type;
      if (!type) {
        pendingSelect = id;
        return;
      }
      set(type === 'phe' ? { pheId: id, tab: 'phe' } : { householdId: id, tab: 'household' });
      persist();
    },

    startUpdate: (id) => {
      const e = get().devices[id];
      const ui = useUi.getState();
      const v = e?.state?.fwAvailable;
      if (!e || !v || !e.info || cmpVersion(v, e.info.fw) <= 0) return false;
      if (!e.online) {
        ui.showToast('Controller is offline');
        return false;
      }
      if (e.state?.pump) {
        ui.showToast('Stop the pump first');
        return false;
      }
      // Show "Downloading" at once; the board's next state push takes over.
      patchEntry(id, { state: { ...e.state!, ota: { phase: 'download', pct: 0, to: v, err: '' } } });
      backend()
        .sendCommand(id, { ota: { version: v } })
        .catch(() => {
          patchEntry(id, { state: { ...e.state!, ota: null } });
          ui.showToast('Could not reach the controller');
        });
      return true;
    },

    remove: async (id) => {
      try {
        await backend().releaseDevice(id);
        return true;
      } catch {
        useUi.getState().showToast('Could not remove. Check the internet.');
        return false;
      }
    },
  };
});

/** Stop every watch (sign out). */
export function resetFleet() {
  pendingSelect = null;
  for (const us of subs.values()) us.forEach((u) => u());
  subs = new Map();
  common.forEach((u) => u());
  common = [];
  clearInterval(timer);
  timer = undefined;
  useFleet.setState({ ids: [], devices: {}, stable: null, householdId: null, pheId: null, loaded: false });
}
