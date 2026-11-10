// Mirrors the Realtime Database data model (docs/data-model.md, docs/flexible-system.md §3).
import type { Board, LayoutConfig } from './layout';

export type { Board, LayoutConfig, MainConfig, TankConfig } from './layout';
export { DEFAULT_LAYOUT as DEFAULT_CONFIG } from './layout';

/** The layout config (`config` node). */
export type DeviceConfig = LayoutConfig;

/** One semi tank as the controller reports it. pct is null when the sensor gives no reading. */
export type TankState = { pct: number | null; valve: boolean; ok: boolean };

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
  auto: boolean;
  msg: string;
  /** Tank being filled. */
  active: number | null;
  tanks: TankState[];
  main: { pct: number | null; ok: boolean } | null;
  /** Which sensor ports answer (installer setup "Check wiring"): T1–T5, MAIN. */
  detected: { tanks: boolean[]; main: boolean } | null;
  check: PumpCheck | null;
};

export type DeviceInfo = {
  name: string;
  fw: string;
  board: Board | null;
  /** 5 with v2 firmware, 3 with the first firmware. */
  maxTanks: number;
  ownerUid: string | null;
};

export type TestPort = `V${1 | 2 | 3 | 4 | 5}` | 'PUMP';

/** App → device. The device applies it and deletes `cmd`. */
export type DeviceCommand = {
  pump?: boolean;
  auto?: boolean;
  valve?: { i: number; open: boolean };
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
  | 'main_low'
  | 'board_error'
  | 'check_done';
export type DeviceEvent = {
  id: string;
  type: EventType;
  /** Tank index, or -1 for main tank / board events. */
  tank: number;
  ts: number;
  min?: number;
  auto?: boolean;
};

export type UsageTank = { litres: number; pumpMin: number };
export type UsageDay = {
  date: string; // yyyy-mm-dd
  litres: number;
  pumpMin: number;
  perTank: UsageTank[];
};

export type Profile = { name: string; phone: string; devices: Record<string, true>; createdAt: number };

export type SessionUser = { uid: string };
