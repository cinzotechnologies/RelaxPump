import { tankViews, averageLevel } from '@/state/selectors';

import { mockLayout } from '@/services/mockBackend';

import { normalizeInfo, normalizeState, normalizeUsage } from '../state';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/services', () => ({ backend: jest.fn() }));

describe('reading state', () => {
  it('reads v2 state', () => {
    const s = normalizeState({
      online: true,
      pump: false,
      phe: true,
      auto: true,
      src: 'phe',
      active: 1,
      semi: [{ pct: 40, valve: false, ok: true }, { pct: null, valve: true, ok: true }],
      main: { pct: 72, ok: true },
      detected: { s: [true, false], main: true },
      check: { run: false, rows: [{ i: 0, pctMin: 4.2, lpm: 42, minToFull: 24, slow: false, skipped: false }] },
    })!;
    expect(s.src).toBe('phe');
    expect(s.active).toBe(1);
    expect(s.semi[1].pct).toBeNull();
    expect(s.main).toEqual({ pct: 72, ok: true });
    expect(s.check?.rows[0].lpm).toBe(42);
  });
  it('reads v1 state (tanks only): failed sensors have no level', () => {
    const s = normalizeState({
      online: true,
      pump: true,
      auto: false,
      tanks: [{ pct: 0, valve: false, ok: false }, { pct: 55, valve: true, ok: true }],
    })!;
    expect(s.semi.map((t) => t.pct)).toEqual([null, 55]);
    expect(s.src).toBe('pump');
    expect(s.active).toBe(1);
    expect(s.main).toBeNull();
  });
  it('reads info: old devices are v1 with 3 ports', () => {
    expect(normalizeInfo({ maxTanks: 3, fw: '1.0.0' })).toMatchObject({ maxTanks: 3, ports: { phe: false, main: false } });
    expect(normalizeInfo({ board: 'v2', ports: { sensors: 8, valves: 8, phe: true, main: true } })?.maxTanks).toBe(8);
  });
  it('reads usage with PHE litres', () => {
    expect(normalizeUsage('2026-11-10', { litres: 300, pumpMin: 20, pheLitres: 120, perTank: [{ litres: 300, pheLitres: 120 }] })).toEqual({
      date: '2026-11-10',
      litres: 300,
      pumpMin: 20,
      pheLitres: 120,
      perTank: [{ litres: 300, pumpMin: 0, pheLitres: 120 }],
    });
  });
});

describe('tank views for every mock layout', () => {
  it.each(['1', '3', '5,phe', '8,phe,main', '4,phe,main,ns3'])('%s', (spec) => {
    const cfg = mockLayout(spec);
    const st = normalizeState({
      online: true,
      pump: true,
      auto: true,
      active: 0,
      semi: cfg.semi.map((t, i) => ({ pct: t.sensor ? 10 * (i + 1) : null, valve: i === 0, ok: true })),
    });
    const v = tankViews(st, cfg);
    expect(v).toHaveLength(cfg.semi.length);
    expect(v[0].active).toBe(true);
    const noSensor = v.filter((t) => !t.hasSensor);
    noSensor.forEach((t) => expect(t.pct).toBeNull());
    const { count } = averageLevel(v);
    expect(count).toBe(cfg.semi.filter((t) => t.sensor).length);
  });
  it('averages only tanks with a level', () => {
    const cfg = mockLayout('3,ns2');
    const st = normalizeState({ online: true, semi: [{ pct: 20, ok: true }, { pct: null, ok: true }, { pct: 60, ok: true }] });
    expect(averageLevel(tankViews(st, cfg))).toEqual({ avg: 40, count: 2 });
  });
});
