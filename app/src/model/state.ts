// Reading `state`, `info` and `usage` from the database.
import { list, MAX_TANKS } from './layout';
import type {
  CheckRow,
  DeviceInfo,
  DeviceState,
  FirmwareStable,
  OtaPhase,
  OtaState,
  Supply,
  TankState,
  UsageDay,
  UsageTank,
} from './types';

type Raw = Record<string, unknown> | null | undefined;
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function tankOf(t: Raw): TankState {
  const ok = !!t?.ok;
  // The first firmware wrote pct 0 for a failed sensor; treat any reading without ok as unknown.
  const pct = ok ? numOrNull(t?.pct) : null;
  return { pct: pct === null ? null : Math.round(pct), valve: !!t?.valve, ok, rising: ok && !!t?.valve && !!t?.rising };
}

const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const PHASES: OtaPhase[] = ['download', 'verify', 'install', 'restart', 'done', 'failed'];
const SUPPLY: Supply[] = ['flowing', 'none', 'unknown'];

function otaOf(o: Raw): OtaState | null {
  if (!o || !PHASES.includes(o.phase as OtaPhase)) return null;
  return {
    phase: o.phase as OtaPhase,
    pct: Math.max(0, Math.min(100, Math.round(num(o.pct)))),
    to: typeof o.to === 'string' ? o.to : '',
    err: typeof o.err === 'string' ? o.err : '',
  };
}

export function normalizeState(v: Raw): DeviceState | null {
  if (!v) return null;
  const tanks = list<Raw>(v.tanks).map(tankOf);
  const pump = !!v.pump;
  let active = numOrNull(v.active);
  if (active === null && pump) {
    const i = tanks.findIndex((t) => t.valve);
    active = i >= 0 ? i : tanks.length === 1 ? 0 : null;
  }
  const m = v.main as Raw;
  const det = v.detected as Raw;
  const chk = v.check as Raw;
  return {
    online: !!v.online,
    lastSeen: num(v.lastSeen),
    rssi: num(v.rssi, -100),
    ssid: String(v.ssid ?? ''),
    pump,
    auto: !!v.auto,
    msg: String(v.msg ?? ''),
    active,
    tanks,
    main: m ? { pct: m.ok && numOrNull(m.pct) !== null ? Math.round(num(m.pct)) : null, ok: !!m.ok } : null,
    detected: det ? { tanks: list<unknown>(det.tanks).map(Boolean), main: !!det.main } : null,
    cm: Array.from({ length: MAX_TANKS + 1 }, (_, i) => numOrNull(list<unknown>(v.cm)[i])),
    check: chk
      ? {
          run: !!chk.run,
          rows: list<Raw>(chk.rows)
            .filter((r) => !!r)
            .map((r): CheckRow => ({
              i: num(r?.i),
              skipped: !!r?.skipped,
              pctMin: numOrNull(r?.pctMin),
              lpm: numOrNull(r?.lpm),
              minToFull: numOrNull(r?.minToFull),
              slow: !!r?.slow,
            })),
        }
      : null,
    supply: SUPPLY.includes(v.supply as Supply) ? (v.supply as Supply) : null,
    fwAvailable: typeof v.fwAvailable === 'string' && VERSION.test(v.fwAvailable) ? v.fwAvailable : null,
    ota: otaOf(v.ota as Raw),
  };
}

export function normalizeInfo(v: Raw): DeviceInfo | null {
  if (!v) return null;
  return {
    name: String(v.name ?? 'RelaxPump Controller'),
    fw: String(v.fw ?? ''),
    board: v.board === 'v1' || v.board === 'v2' || v.board === 'v3' ? v.board : null,
    maxTanks: Math.max(1, Math.min(MAX_TANKS, num(v.maxTanks, 3))),
    ownerUid: typeof v.ownerUid === 'string' ? v.ownerUid : null,
    type: v.type === 'phe' ? 'phe' : 'household',
    flash: typeof v.flash === 'number' ? v.flash : null,
  };
}

/** firmware/stable → what the Software update card shows; null when nothing is published. */
export function normalizeStable(v: Raw): FirmwareStable | null {
  if (!v || typeof v.version !== 'string' || !VERSION.test(v.version)) return null;
  return {
    version: v.version,
    notes: list<unknown>(v.notes).filter((n): n is string => typeof n === 'string'),
    size: num(v.size),
    date: typeof v.date === 'string' ? v.date : '',
    minFw: typeof v.minFw === 'string' ? v.minFw : '0.0.0',
    rollout: num(v.rollout),
  };
}

const tankUse = (t: Raw): UsageTank => ({ litres: num(t?.litres), pumpMin: num(t?.pumpMin) });

export function normalizeUsage(date: string, v: Raw): UsageDay {
  return {
    date,
    litres: num(v?.litres),
    pumpMin: num(v?.pumpMin),
    perTank: list<Raw>(v?.perTank).map(tankUse),
  };
}
