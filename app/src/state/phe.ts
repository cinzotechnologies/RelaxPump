// The selected PHE board (docs/two-module-system.md §4.2, §5): live lines, Auto fill, valves by
// hand, reopen/close %, line names and sizes, events, usage. No pump. Like useDevice for household.
import { create } from 'zustand';

import { eventRow, eventToast } from '@/logic/events';
import { dayKey, parseTankName } from '@/logic/format';
import { parseLitres } from '@/logic/pump';
import { DEFAULT_PHE, lineName, setPheHigh, setPheLow, type PheConfig } from '@/model/phe';
import type { DeviceEvent, DeviceInfo, DeviceState, UsageDay } from '@/model/types';
import { backend } from '@/services';
import type { Unsub } from '@/services/backend';
import { notify } from '@/services/notify';

import { isOnline } from './device';
import { useUi } from './ui';

const ONLINE_TICK_MS = 5_000;

export type LineView = {
  i: number;
  name: string;
  pct: number | null;
  ok: boolean;
  valve: boolean;
  rising: boolean;
  full: boolean;
  litres: number | null;
};

type PheStore = {
  id: string | null;
  info: DeviceInfo | null;
  state: DeviceState | null;
  online: boolean;
  serverOffset: number;
  config: PheConfig;
  configLoaded: boolean;
  events: DeviceEvent[];
  usage: UsageDay[];
  seenTs: number;
  attach: (id: string | null) => void;
  markSeen: () => void;
  setAuto: (on: boolean) => void;
  /** Open/close a line's valve by hand (closes by itself at the close %). */
  toggleValve: (i: number) => void;
  setLow: (v: number) => void;
  setHigh: (v: number) => void;
  setLitres: (i: number, text: string) => void;
  setLineName: (i: number, text: string) => void;
  /** Wiring check: 1 s pulse on V1–V5. */
  testValve: (i: number) => void;
};

let unsubs: Unsub[] = [];
let onlineTimer: ReturnType<typeof setInterval> | undefined;
let patchTimer: ReturnType<typeof setTimeout> | undefined;
let pendingPatch: Record<string, string | number | null> = {};

function last7Days(): string[] {
  const d = new Date();
  return Array.from({ length: 7 }, (_, k) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6 + k)));
}

/** Live state + config → the rows the PHE screens render. */
export function lineViews(state: DeviceState | null, config: PheConfig): LineView[] {
  const names = config.lines.map((l) => l.name);
  return config.lines.map((l, i) => {
    const t = state?.tanks[i];
    const ok = !!t?.ok;
    const pct = ok && t?.pct != null ? t.pct : null;
    return {
      i,
      name: lineName(names, i),
      pct,
      ok,
      valve: !!t?.valve,
      rising: !!t?.rising,
      full: pct !== null && pct >= config.high,
      litres: l.litres ?? null,
    };
  });
}

/** Home "PHE supply" card: Water coming / Waiting for PHE water / No water now. */
export function supplyView(state: DeviceState | null, lines: LineView[]) {
  const anyOpen = lines.some((l) => l.valve);
  const flowing = state?.supply === 'flowing' || lines.some((l) => l.rising);
  if (!anyOpen) return { text: 'All valves closed', flowing: false, tone: 'idle' as const };
  if (flowing) return { text: 'Water coming', flowing: true, tone: 'ok' as const };
  if (state?.supply === 'none') return { text: 'No water now', flowing: false, tone: 'idle' as const };
  return { text: 'Waiting for PHE water', flowing: false, tone: 'idle' as const };
}

export const usePhe = create<PheStore>((set, get) => {
  const recheck = () => {
    const online = isOnline(get().state, Date.now() + get().serverOffset);
    if (online !== get().online) set({ online });
  };
  const reachable = () => {
    if (get().online) return true;
    useUi.getState().showToast('Controller is offline');
    return false;
  };
  const send = (cmd: Parameters<ReturnType<typeof backend>['sendCommand']>[1]) => {
    const id = get().id;
    if (id)
      backend()
        .sendCommand(id, cmd)
        .catch(() => useUi.getState().showToast('Could not reach the controller'));
  };
  /** Full line names ("Line 2" when unnamed) for toasts and notifications. */
  const names = () => {
    const raw = get().config.lines.map((l) => l.name);
    return raw.map((_, i) => lineName(raw, i));
  };
  const writePatch = (cfg: PheConfig, p: Record<string, string | number | null>, delay = 400) => {
    set({ config: cfg });
    pendingPatch = { ...pendingPatch, ...p };
    clearTimeout(patchTimer);
    patchTimer = setTimeout(() => {
      patchTimer = undefined;
      const id = get().id;
      const body = pendingPatch;
      pendingPatch = {};
      if (id)
        backend()
          .patchConfig(id, body)
          .catch(() => useUi.getState().showToast('Could not save'));
    }, delay);
  };

  return {
    id: null,
    info: null,
    state: null,
    online: false,
    serverOffset: 0,
    config: DEFAULT_PHE,
    configLoaded: false,
    events: [],
    usage: [],
    seenTs: 0,

    attach: (id) => {
      if (id === get().id) return;
      unsubs.forEach((u) => u());
      unsubs = [];
      clearInterval(onlineTimer);
      onlineTimer = undefined;
      set({ id, info: null, state: null, online: false, config: DEFAULT_PHE, configLoaded: false, events: [], usage: [] });
      if (!id) return;
      const b = backend();
      const since = Date.now();
      onlineTimer = setInterval(recheck, ONLINE_TICK_MS);
      unsubs.push(
        b.onServerOffset((serverOffset) => {
          set({ serverOffset });
          recheck();
        }),
        b.onInfo(id, (info) => set({ info })),
        b.onState(id, (state) => {
          set({ state });
          recheck();
        }),
        b.onPheConfig(id, (config) => {
          if (config && !patchTimer) set({ config, configLoaded: true });
          else if (!config) set({ configLoaded: true });
        }),
        b.onEvents(id, 30, (events) => {
          const prevTop = get().events[0]?.ts ?? since;
          set({ events });
          const e = events.find((x) => x.ts > prevTop && x.ts > since);
          if (!e) return;
          const text = eventToast(e, names());
          if (text) useUi.getState().showToast(text);
          // flow_stop is quiet (it happens every day); everything else the board did by itself.
          if (b.kind !== 'mock' && e.type !== 'flow_stop') {
            const row = eventRow(e, get().config.low, Date.now(), names(), true);
            void notify(row.title, row.sub);
          }
        }),
        b.onUsage(id, last7Days(), (usage) => set({ usage })),
      );
    },

    markSeen: () => set({ seenTs: get().events[0]?.ts ?? Date.now() }),

    setAuto: (on) => {
      if (!reachable()) return;
      const s = get().state;
      if (s) set({ state: { ...s, auto: on } });
      useUi.getState().showToast(on ? 'Auto fill on' : 'Auto fill off');
      send({ auto: on });
    },

    toggleValve: (i) => {
      const s = get().state;
      if (!s || !reachable()) return;
      const t = s.tanks[i];
      const open = !t?.valve;
      const c = get().config;
      if (open && t?.ok && t.pct !== null && t.pct >= c.high) {
        useUi.getState().showToast(`${lineName(names(), i)} is full`);
        return;
      }
      if (open && t && !t.ok) {
        useUi.getState().showToast('Sensor not answering. The valve stays closed.');
        return;
      }
      set({ state: { ...s, tanks: s.tanks.map((x, j) => (j === i ? { ...x, valve: open } : x)) } });
      send({ valve: { i, open } });
    },

    setLow: (v) => {
      const c = get().config;
      const low = setPheLow(v, c.high);
      if (low !== c.low) writePatch({ ...c, low }, { low });
    },
    setHigh: (v) => {
      const c = get().config;
      const high = setPheHigh(v, c.low);
      if (high !== c.high) writePatch({ ...c, high }, { high });
    },
    setLitres: (i, text) => {
      const c = get().config;
      const litres = parseLitres(text);
      const lines = c.lines.map((l, j) => (j === i ? { ...l, litres } : l));
      writePatch({ ...c, lines }, { [`tanks/${i}/litres`]: litres }, 800);
    },
    setLineName: (i, text) => {
      const c = get().config;
      const name = parseTankName(text);
      const lines = c.lines.map((l, j) => (j === i ? { ...l, name } : l));
      writePatch({ ...c, lines }, { [`tanks/${i}/name`]: name }, 800);
    },
    testValve: (i) => {
      if (!reachable()) return;
      send({ test: { port: `V${(i + 1) as 1 | 2 | 3 | 4 | 5}`, ms: 1000 } });
    },
  };
});
