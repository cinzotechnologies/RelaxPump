import { mockLayout } from '@/services/mockBackend';
import { averageLevel, mainView, tankViews } from '@/state/selectors';

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
      pump: true,
      auto: true,
      active: 1,
      tanks: [
        { pct: 40, valve: false, ok: true },
        { pct: null, valve: true, ok: false },
      ],
      main: { pct: 72, ok: true },
      detected: { tanks: [true, false, false, false, false], main: true },
      check: {
        run: false,
        rows: [{ i: 0, pctMin: 4.2, lpm: 42, minToFull: 24, slow: false, skipped: false }],
      },
    })!;
    expect(s.active).toBe(1);
    expect(s.tanks[1].pct).toBeNull();
    expect(s.main).toEqual({ pct: 72, ok: true });
    expect(s.detected?.tanks.slice(0, 2)).toEqual([true, false]);
    expect(s.check?.rows[0].lpm).toBe(42);
  });
  it('first firmware: failed sensors (pct 0, ok false) have no level; active from the open valve', () => {
    const s = normalizeState({
      online: true,
      pump: true,
      auto: false,
      tanks: [
        { pct: 0, valve: false, ok: false },
        { pct: 55, valve: true, ok: true },
      ],
    })!;
    expect(s.tanks.map((t) => t.pct)).toEqual([null, 55]);
    expect(s.active).toBe(1);
    expect(s.main).toBeNull();
  });
  it('one tank pumping: the only tank is active', () => {
    expect(normalizeState({ pump: true, tanks: [{ pct: 30, valve: false, ok: true }] })!.active).toBe(0);
  });
  it('reads info: maxTanks 1–5, old devices 3', () => {
    expect(normalizeInfo({ fw: '1.0.0' })).toMatchObject({ maxTanks: 3, board: null });
    expect(normalizeInfo({ maxTanks: 5, board: 'v2' })).toMatchObject({ maxTanks: 5, board: 'v2' });
    expect(normalizeInfo({ maxTanks: 8 })?.maxTanks).toBe(5);
  });
  it('reads usage', () => {
    expect(normalizeUsage('2026-11-10', { litres: 300, pumpMin: 20, perTank: [{ litres: 300 }] })).toEqual({
      date: '2026-11-10',
      litres: 300,
      pumpMin: 20,
      perTank: [{ litres: 300, pumpMin: 0 }],
    });
  });
});

describe('tank views for every mock layout', () => {
  it.each(['1', '2', '3,main', '5', '5,main'])('%s', (spec) => {
    const cfg = mockLayout(spec);
    const n = cfg.tanks.length;
    const st = normalizeState({
      online: true,
      pump: true,
      auto: true,
      active: 0,
      tanks: cfg.tanks.map((_, i) => ({ pct: 10 * (i + 1), valve: n > 1 && i === 0, ok: true })),
      main: cfg.main.enabled ? { pct: 8, ok: true } : null,
    });
    const v = tankViews(st, cfg);
    expect(v).toHaveLength(n);
    expect(v[0].active).toBe(true);
    expect(v.every((t) => t.hasValve === n > 1)).toBe(true);
    expect(averageLevel(v).count).toBe(n);
    const m = mainView(st, cfg);
    if (cfg.main.enabled) expect(m).toMatchObject({ pct: 8, minPct: 10, low: true, litres: 5000 });
    else expect(m).toBeNull();
  });
  it('averages only tanks with a level', () => {
    const cfg = mockLayout('3');
    const st = normalizeState({
      online: true,
      tanks: [
        { pct: 20, ok: true },
        { pct: null, ok: false },
        { pct: 60, ok: true },
      ],
    });
    expect(averageLevel(tankViews(st, cfg))).toEqual({ avg: 40, count: 3 });
  });
  it('one tank never shows a valve, even if a stale state says so', () => {
    const cfg = mockLayout('1');
    const st = normalizeState({ online: true, tanks: [{ pct: 50, ok: true, valve: true }] });
    expect(tankViews(st, cfg)[0]).toMatchObject({ hasValve: false, valve: false });
  });
});
