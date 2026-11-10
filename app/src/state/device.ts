import { create } from 'zustand';

import { eventRow, eventToast } from '@/logic/events';
import { dayKey, parseTankName, tankName } from '@/logic/format';
import { decideStart, decideValve, fillCommand, parseLitres, setHigh, setLow } from '@/logic/pump';
import { planPumpOn, type VoiceAction } from '@/logic/voice';
import { DEFAULT_LAYOUT, hasValves } from '@/model/layout';
import type {
  DeviceCommand,
  DeviceConfig,
  DeviceEvent,
  DeviceInfo,
  DeviceState,
  TestPort,
  UsageDay,
} from '@/model/types';
import { backend } from '@/services';
import type { Unsub } from '@/services/backend';
import { notify } from '@/services/notify';

import { useUi } from './ui';

export const OFFLINE_AFTER_MS = 30_000;
const ONLINE_TICK_MS = 5_000;

/** The controller pushes state every 3 s; no push for 30 s (server time) = offline. */
export function isOnline(state: DeviceState | null, now = Date.now()): boolean {
  return !!state?.online && now - (state.lastSeen ?? 0) < OFFLINE_AFTER_MS;
}

type Cmd = Omit<DeviceCommand, 'ts'>;

type DeviceStore = {
  id: string | null;
  info: DeviceInfo | null;
  state: DeviceState | null;
  /** Re-checked every few seconds, so a controller that loses power shows Offline. */
  online: boolean;
  /** Server clock minus phone clock (ms). */
  serverOffset: number;
  config: DeviceConfig;
  /** True once the controller's config has arrived (installer setup opens after a claim otherwise). */
  configLoaded: boolean;
  events: DeviceEvent[];
  usage: UsageDay[];
  /** Newest event the user has seen in the Notifications sheet. */
  seenTs: number;
  attach: (id: string | null) => void;
  markSeen: () => void;
  /** Home "Pump" tile and Tanks "Start/Stop filling". */
  togglePump: () => void;
  toggleValve: (i: number) => void;
  setAuto: (on: boolean) => void;
  /** Voice / shortcut command (relaxpump://do/...), no tap. */
  voice: (a: VoiceAction) => void;
  setLow: (v: number) => void;
  setHigh: (v: number) => void;
  setLitres: (i: number, text: string) => void;
  setTankName: (i: number, text: string) => void;
  runPumpCheck: () => void;
  testPort: (port: TestPort) => void;
};

let unsubs: Unsub[] = [];
let patchTimer: ReturnType<typeof setTimeout> | undefined;
let pendingPatch: Record<string, string | number | null> = {};
let onlineTimer: ReturnType<typeof setInterval> | undefined;

function last7Days(): string[] {
  const out: string[] = [];
  const d = new Date();
  // Monday-first week ending today keeps the M T W T F S S axis of the design.
  for (let i = 6; i >= 0; i--) out.push(dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i)));
  return out;
}

export const useDevice = create<DeviceStore>((set, get) => {
  const recheck = () => {
    const online = isOnline(get().state, Date.now() + get().serverOffset);
    if (online !== get().online) set({ online });
  };
  /**
   * Remote control goes through the cloud. If the controller is offline a command would wait
   * in the database and run whenever it comes back (pump on hours later), so refuse it here.
   */
  const reachable = () => {
    if (get().online) return true;
    useUi.getState().showToast('Controller is offline');
    return false;
  };
  const send = (cmd: Cmd) => {
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
  /** Customer config edits: applied locally now, written as leaf paths (no PIN) after a pause. */
  const writePatch = (cfg: DeviceConfig, p: Record<string, string | number | null>, delay = 400) => {
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
  const names = () => get().config.tanks.map((t) => t.name);

  return {
    id: null,
    info: null,
    state: null,
    online: false,
    serverOffset: 0,
    config: DEFAULT_LAYOUT,
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
      set({
        id,
        info: null,
        state: null,
        online: false,
        config: DEFAULT_LAYOUT,
        configLoaded: false,
        events: [],
        usage: [],
      });
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
        b.onConfig(id, (config) => {
          // Don't clobber a pending local edit (slider drag) with an older snapshot.
          if (config && !patchTimer) set({ config, configLoaded: true });
          else if (!config) set({ configLoaded: true });
        }),
        b.onEvents(id, 30, (events) => {
          const prevTop = get().events[0]?.ts ?? since;
          set({ events });
          const fresh = events.filter((e) => e.ts > prevTop && e.ts > since);
          const e = fresh[0];
          const text = e && eventToast(e, names());
          if (text) useUi.getState().showToast(text);
          // Notify for everything the controller did by itself (auto start/stop, full, low, faults);
          // skip on/off the user just tapped. Real controllers only: the simulator would
          // fire one every minute.
          const manual = !!e && ['pump_on', 'pump_off'].includes(e.type) && !e.auto;
          if (e && b.kind !== 'mock' && !manual) {
            const row = eventRow(e, get().config.low, Date.now(), names());
            void notify(row.title, row.sub);
          }
        }),
        b.onUsage(id, last7Days(), (usage) => set({ usage })),
      );
    },
    markSeen: () => set({ seenTs: get().events[0]?.ts ?? Date.now() }),

    togglePump: () => {
      const s = get().state;
      if (!s || !reachable()) return;
      const d = decideStart(s, get().config.tanks.length);
      const ui = useUi.getState();
      if (!d.ok) {
        ui.setMsg(d.msg);
        return;
      }
      ui.setMsg('');
      patch({ pump: !s.pump, auto: false });
      ui.showToast(d.label);
      send(d.cmd);
    },
    toggleValve: (i) => {
      const s = get().state;
      if (!s || !hasValves(get().config.tanks.length) || !reachable()) return;
      const d = decideValve(i, s);
      const ui = useUi.getState();
      if (d.kind === 'stopPumpFirst') {
        ui.setMsg(d.msg);
        patch({ pump: false, auto: false });
        send({ valve: { i, open: false } });
        return;
      }
      ui.setMsg('');
      // Idle: one valve open at a time (the controller closes the others).
      const idle = !s.pump;
      patch({
        auto: false,
        tanks: s.tanks.map((t, j) =>
          j === i ? { ...t, valve: d.open } : idle && d.open ? { ...t, valve: false } : t,
        ),
      });
      send({ valve: { i, open: d.open } });
    },
    setAuto: (on) => {
      if (!reachable()) return;
      useUi.getState().setMsg('');
      patch({ auto: on });
      useUi.getState().showToast(on ? 'Auto on' : 'Auto off');
      send({ auto: on });
    },
    voice: (a) => {
      const s = get().state;
      const ui = useUi.getState();
      if (!s || !reachable()) return;
      if (a === 'auto-on' || a === 'auto-off') {
        get().setAuto(a === 'auto-on');
        return;
      }
      const filling = s.pump;
      if (a === 'pump-off') {
        if (!filling) {
          ui.showToast('Pump is already off');
          return;
        }
        patch({ pump: false, auto: false });
        ui.showToast('Pump off');
        send({ pump: false });
        return;
      }
      const n = get().config.tanks.length;
      const plan = planPumpOn(filling, s.tanks.slice(0, n));
      if (plan.kind === 'already') ui.showToast('Pump is already on');
      else if (plan.kind === 'full') ui.showToast('All tanks are full');
      else if (plan.kind === 'pump') get().togglePump();
      else {
        patch({ auto: false, active: plan.tank, pump: true });
        ui.showToast(`Filling ${tankName(names(), plan.tank)}`);
        send(fillCommand(plan.tank, n));
      }
    },
    setLow: (v) => {
      const c = get().config;
      const low = setLow(v, c.high);
      if (low !== c.low) writePatch({ ...c, low }, { low });
    },
    setHigh: (v) => {
      const c = get().config;
      const high = setHigh(v, c.low);
      if (high !== c.high) writePatch({ ...c, high }, { high });
    },
    setLitres: (i, text) => {
      const c = get().config;
      const litres = parseLitres(text);
      const tanks = c.tanks.map((t, j) => (j === i ? { ...t, litres } : t));
      writePatch({ ...c, tanks }, { [`tanks/${i}/litres`]: litres }, 800);
    },
    setTankName: (i, text) => {
      const c = get().config;
      const name = parseTankName(text);
      const tanks = c.tanks.map((t, j) => (j === i ? { ...t, name } : t));
      writePatch({ ...c, tanks }, { [`tanks/${i}/name`]: name }, 800);
    },
    runPumpCheck: () => {
      const s = get().state;
      if (!s || !reachable()) return;
      patch({ check: { run: true, rows: [] } });
      send({ pumpCheck: true });
    },
    testPort: (port) => {
      if (!reachable()) return;
      send({ test: { port, ms: port === 'PUMP' ? 2000 : 1000 } });
    },
  };
});
