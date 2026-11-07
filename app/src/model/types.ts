// Mirrors the Realtime Database data model (docs/data-model.md, CLAUDE.md §4).

export type TankState = { pct: number; valve: boolean; ok: boolean };

export type DeviceState = {
  online: boolean;
  lastSeen: number;
  rssi: number;
  ssid: string;
  pump: boolean;
  auto: boolean;
  msg: string;
  tanks: TankState[];
};

export type TankConfig = { emptyCm: number; fullCm: number; litres: number | null };

export type DeviceConfig = {
  tankCount: number;
  low: number;
  high: number;
  maxRunMin: number;
  tanks: TankConfig[];
};

export type DeviceInfo = { name: string; fw: string; maxTanks: number; ownerUid: string | null };

/** App → device. The device applies it and deletes `cmd`. */
export type DeviceCommand = {
  pump?: boolean;
  valve?: { i: number; open: boolean };
  auto?: boolean;
  ts: number;
};

export type EventType = 'full' | 'low' | 'pump_on' | 'pump_off' | 'dry_run' | 'timeout' | 'sensor';
export type DeviceEvent = {
  id: string;
  type: EventType;
  tank: number;
  ts: number;
  min?: number;
  auto?: boolean;
};

export type UsageDay = {
  date: string; // yyyy-mm-dd
  litres: number;
  pumpMin: number;
  perTank: { litres: number; pumpMin: number }[];
};

export type Profile = { name: string; phone: string; devices: Record<string, true>; createdAt: number };

export type SessionUser = { uid: string };

export const DEFAULT_TANK: TankConfig = { emptyCm: 120, fullCm: 30, litres: null };

export const DEFAULT_CONFIG: DeviceConfig = {
  tankCount: 3,
  low: 20,
  high: 95,
  maxRunMin: 30,
  tanks: [DEFAULT_TANK, DEFAULT_TANK, DEFAULT_TANK],
};
