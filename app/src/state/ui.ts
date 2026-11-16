import { create } from 'zustand';

import type { ModuleType } from '@/model/types';

export type SheetName = 'tanks' | 'pw' | 'notif' | 'ble' | 'forgot' | 'delete';
export type Route =
  'welcome' | 'auth' | 'home' | 'tanks' | 'usage' | 'account' | 'devices' | 'check' | 'setup' | 'add';

const RANK: Record<Route, number> = {
  welcome: 0,
  auth: 1,
  home: 2,
  tanks: 3,
  usage: 3,
  account: 3,
  devices: 4,
  check: 4,
  setup: 5,
  add: 5,
};

type UiState = {
  route: Route;
  dir: 'f' | 'b';
  sheet: SheetName | null;
  toast: { id: number; text: string } | null;
  /** Warning banner on the Tanks screen ("Open a valve first"). */
  msg: string;
  /** Which board Installer setup opens for (My devices → Installer setup). */
  setupFor: ModuleType;
  setSetupFor: (t: ModuleType) => void;
  setRoute: (r: Route) => 'f' | 'b';
  openSheet: (s: SheetName) => void;
  closeSheet: () => void;
  showToast: (text: string) => void;
  setMsg: (m: string) => void;
};

let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUi = create<UiState>((set, get) => ({
  route: 'welcome',
  dir: 'f',
  sheet: null,
  toast: null,
  msg: '',
  setupFor: 'household',
  setSetupFor: (t) => set({ setupFor: t }),
  setRoute: (r) => {
    const dir = RANK[r] >= RANK[get().route] ? 'f' : 'b';
    set({ route: r, dir, msg: '' });
    return dir;
  },
  openSheet: (s) => set({ sheet: s }),
  closeSheet: () => set({ sheet: null }),
  showToast: (text) => {
    clearTimeout(toastTimer);
    set({ toast: { id: ++toastSeq, text } });
    toastTimer = setTimeout(() => set({ toast: null }), 2200);
  },
  setMsg: (m) => set({ msg: m }),
}));
