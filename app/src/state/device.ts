import { create } from 'zustand';

import { eventToast } from '@/logic/events';
import { dayKey } from '@/logic/format';
import { decidePump, decideValve, parseLitres, resizeConfig, setHigh, setLow } from '@/logic/pump';
import {
  DEFAULT_CONFIG,
  type DeviceConfig,
  type DeviceEvent,
  type DeviceInfo,
  type DeviceState,
  type UsageDay,
} from '@/model/types';
import { backend } from '@/services';
import type { Unsub } from '@/services/backend';

import { useUi } from './ui';

export const OFFLINE_AFTER_MS = 30_000;

type DeviceStore = {
  id: string | null;
  info: DeviceInfo | null;
  state: DeviceState | null;
  config: DeviceConfig;
  events: DeviceEvent[];
  usage: UsageDay[];
  /** Newest event the user has seen in the Notifications sheet. */
  seenTs: number;
  attach: (id: string | null) => void;
  markSeen: () => void;
  togglePump: () => void;
  toggleValve: (i: number) => void;
  setAuto: (on: boolean) => void;
  setLow: (v: number) => void;
  setHigh: (v: number) => void;
  setCount: (n: number) => void;
  setLitres: (i: number, text: string) => void;
};

let unsubs: Unsub[] = [];
let configTimer: ReturnType<typeof setTimeout> | undefined;

function last7Days(): string[] {
  const out: string[] = [];
  const d = new Date();
  // Monday-first week ending today keeps the M T W T F S S axis of the design.
  for (let i = 6; i >= 0; i--) out.push(dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i)));
  return out;
}

export const useDevice = create<DeviceStore>((set, get) => {
  const send = (cmd: Parameters<ReturnType<typeof backend>['sendCommand']>[1]) => {
    const id = get().id;
    if (id)
      backend()
        .sendCommand(id, cmd)
        .catch(() => useUi.getState().showToast('Could not reach the controller'));
  };
  /** Local optimistic patch; the device's next state push overwrites it. */
  const patch = (p: Partial<DeviceState>) => {
    const s = get().state;
    if (s) set({ state: { ...s, ...p } });
  };
  const writeConfig = (cfg: DeviceConfig, delay = 400) => {
    set({ config: cfg });
    clearTimeout(configTimer);
    configTimer = setTimeout(() => {
      configTimer = undefined;
      const id = get().id;
      if (id)
        backend()
          .setConfig(id, cfg)
          .catch(() => useUi.getState().showToast('Could not save'));
    }, delay);
  };

  return {
    id: null,
    info: null,
    state: null,
    config: DEFAULT_CONFIG,
    events: [],
    usage: [],
    seenTs: 0,
    attach: (id) => {
      if (id === get().id) return;
      unsubs.forEach((u) => u());
      unsubs = [];
      set({ id, info: null, state: null, config: DEFAULT_CONFIG, events: [], usage: [] });
      if (!id) return;
      const b = backend();
      const since = Date.now();
      unsubs.push(
        b.onInfo(id, (info) => set({ info })),
        b.onState(id, (state) => set({ state })),
        b.onConfig(id, (config) => {
          // Don't clobber a pending local edit (slider drag) with an older snapshot.
          if (config && !configTimer) set({ config });
        }),
        b.onEvents(id, 30, (events) => {
          const prevTop = get().events[0]?.ts ?? since;
          set({ events });
          const fresh = events.filter((e) => e.ts > prevTop && e.ts > since);
          const text = fresh[0] && eventToast(fresh[0]);
          if (text) useUi.getState().showToast(text);
        }),
        b.onUsage(id, last7Days(), (usage) => set({ usage })),
      );
    },
    markSeen: () => set({ seenTs: get().events[0]?.ts ?? Date.now() }),
    togglePump: () => {
      const s = get().state;
      if (!s) return;
      const d = decidePump(s.pump, s.tanks);
      const ui = useUi.getState();
      if (!d.ok) {
        ui.setMsg(d.msg);
        return;
      }
      ui.setMsg('');
      patch({ pump: d.on, auto: false });
      ui.showToast(d.on ? 'Pump on' : 'Pump off');
      send({ pump: d.on });
    },
    toggleValve: (i) => {
      const s = get().state;
      if (!s) return;
      const d = decideValve(i, s.pump, s.tanks);
      const ui = useUi.getState();
      if (d.kind === 'stopPumpFirst') {
        ui.setMsg(d.msg);
        patch({ pump: false, auto: false });
        send({ pump: false });
        return;
      }
      ui.setMsg('');
      patch({ auto: false, tanks: s.tanks.map((t, j) => (j === i ? { ...t, valve: d.open } : t)) });
      send({ valve: { i, open: d.open } });
    },
    setAuto: (on) => {
      useUi.getState().setMsg('');
      patch({ auto: on });
      useUi.getState().showToast(on ? 'Auto on' : 'Auto off');
      send({ auto: on });
    },
    setLow: (v) => {
      const c = get().config;
      const low = setLow(v, c.high);
      if (low !== c.low) writeConfig({ ...c, low });
    },
    setHigh: (v) => {
      const c = get().config;
      const high = setHigh(v, c.low);
      if (high !== c.high) writeConfig({ ...c, high });
    },
    setCount: (n) => {
      const c = get().config;
      const max = get().info?.maxTanks ?? 3;
      const next = resizeConfig(c, n, max);
      if (next.tankCount !== c.tankCount) writeConfig(next, 0);
    },
    setLitres: (i, text) => {
      const c = get().config;
      const tanks = c.tanks.map((t, j) => (j === i ? { ...t, litres: parseLitres(text) } : t));
      writeConfig({ ...c, tanks }, 800);
    },
  };
});
