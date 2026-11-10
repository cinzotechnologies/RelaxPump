// Reading `state`, `info` and `usage` from the database. Accepts the v1 shapes too (old firmware
// reports `tanks` only), so the app works while controllers are being updated.
import { list, portsOf, type Source } from './layout';
import type { CheckRow, DeviceInfo, DeviceState, SemiState, UsageDay, UsageTank } from './types';

type Raw = Record<string, unknown> | null | undefined;
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function semiOf(t: Raw, legacy: boolean): SemiState {
  const ok = !!t?.ok;
  // v1 firmware writes pct 0 for a failed sensor; treat that as unknown.
  const pct = legacy ? (ok ? num(t?.pct) : null) : numOrNull(t?.pct);
  return { pct: pct === null ? null : Math.round(pct), valve: !!t?.valve, ok };
}

export function normalizeState(v: Raw): DeviceState | null {
  if (!v) return null;
  const semiRaw = list<Raw>(v.semi);
  const legacy = !semiRaw.length;
  const semi = (legacy ? list<Raw>(v.tanks) : semiRaw).map((t) => semiOf(t, legacy));
  const pump = !!v.pump;
  const phe = !!v.phe;
  const srcRaw = v.src;
  const src: Source | null =
    srcRaw === 'pump' || srcRaw === 'phe' ? srcRaw : pump ? 'pump' : phe ? 'phe' : null;
  let active = numOrNull(v.active);
  if (active === null && (pump || phe)) {
    const i = semi.findIndex((t) => t.valve);
    active = i >= 0 ? i : semi.length === 1 ? 0 : null;
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
    phe,
    auto: !!v.auto,
    msg: String(v.msg ?? ''),
    src,
    active,
    semi,
    main: m ? { pct: numOrNull(m.pct) === null ? null : Math.round(num(m.pct)), ok: !!m.ok } : null,
    detected: det ? { s: list<unknown>(det.s).map(Boolean), main: !!det.main } : null,
    check: chk
      ? {
          run: !!chk.run,
          rows: list<Raw>(chk.rows).map(
            (r): CheckRow => ({
              i: num(r?.i),
              skipped: !!r?.skipped,
              pctMin: numOrNull(r?.pctMin),
              lpm: numOrNull(r?.lpm),
              minToFull: numOrNull(r?.minToFull),
              slow: !!r?.slow,
            }),
          ),
        }
      : null,
  };
}

export function normalizeInfo(v: Raw): DeviceInfo | null {
  if (!v) return null;
  const ports = portsOf(v as Parameters<typeof portsOf>[0]);
  return {
    name: String(v.name ?? 'RelaxPump Controller'),
    fw: String(v.fw ?? ''),
    board: v.board === 'v1' || v.board === 'v2' ? v.board : null,
    maxTanks: Math.max(ports.sensors, ports.valves),
    ports,
    ownerUid: typeof v.ownerUid === 'string' ? v.ownerUid : null,
  };
}

const tankUse = (t: Raw): UsageTank => ({
  litres: num(t?.litres),
  pumpMin: num(t?.pumpMin),
  pheLitres: num(t?.pheLitres),
});

export function normalizeUsage(date: string, v: Raw): UsageDay {
  return {
    date,
    litres: num(v?.litres),
    pumpMin: num(v?.pumpMin),
    pheLitres: num(v?.pheLitres),
    perTank: list<Raw>(v?.perTank).map(tankUse),
  };
}
