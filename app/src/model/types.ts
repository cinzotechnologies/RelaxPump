// Mirrors the Realtime Database data model (docs/data-model.md, docs/flexible-system.md §5).
import type { Board, LayoutConfig, Ports, Source } from './layout';

export type { Board, LayoutConfig, Mode, Ports, SemiConfig, Source } from './layout';
export { DEFAULT_LAYOUT as DEFAULT_CONFIG } from './layout';

/** The layout config (`config` node). */
export type DeviceConfig = LayoutConfig;

/** One semi tank as the controller reports it. pct is null without a sensor (or when it fails). */
export type SemiState = { pct: number | null; valve: boolean; ok: boolean };
/** Kept for helpers that only need levels and valves. */
export type TankState = SemiState;

export type CheckRow = {
  i: number;
  skipped: boolean;
  pctMin: number | null;
  lpm: number | null;
  minToFull: number | null;
  slow: boolean;
};
export type PumpCheck = { run: boolean; rows: CheckRow[] };

export type DeviceState = {
  online: boolean;
  lastSeen: number;
  rssi: number;
  ssid: string;
  pump: boolean;
  phe: boolean;
  auto: boolean;
  msg: string;
  src: Source | null;
  active: number | null;
  semi: SemiState[];
  main: { pct: number | null; ok: boolean } | null;
  /** Which sensor ports answer (installer setup "Check wiring"). */
  detected: { s: boolean[]; main: boolean } | null;
  check: PumpCheck | null;
};

export type DeviceInfo = {
  name: string;
  fw: string;
  board: Board | null;
  maxTanks: number;
  ports: Ports;
  ownerUid: string | null;
};

export type TestPort = `V${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}` | 'PHE' | 'PUMP';

/** App → device. The device applies it and deletes `cmd`. */
export type DeviceCommand = {
  pump?: boolean;
  phe?: boolean;
  auto?: boolean;
  valve?: { i: number; open: boolean };
  fill?: { i: number; src: Source };
  test?: { port: TestPort; ms: number };
  pumpCheck?: boolean;
  ts: number;
};

export type EventType =
  | 'full'
  | 'low'
  | 'pump_on'
  | 'pump_off'
  | 'dry_run'
  | 'timeout'
  | 'sensor'
  | 'phe_on'
  | 'phe_off'
  | 'phe_none'
  | 'main_low'
  | 'board_error'
  | 'check_done';
export type DeviceEvent = {
  id: string;
  type: EventType;
  /** Semi tank index, or -1 for main tank / board events. */
  tank: number;
  ts: number;
  min?: number;
  auto?: boolean;
};

export type UsageTank = { litres: number; pumpMin: number; pheLitres: number };
export type UsageDay = {
  date: string; // yyyy-mm-dd
  litres: number;
  pumpMin: number;
  pheLitres: number;
  perTank: UsageTank[];
};

export type Profile = { name: string; phone: string; devices: Record<string, true>; createdAt: number };

export type SessionUser = { uid: string };
