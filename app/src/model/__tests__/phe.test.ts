import { lineViews, supplyView } from '@/state/phe';

import {
  DEFAULT_PHE,
  lineName,
  normalizePheConfig,
  resizeLines,
  serializePheConfig,
  setPheHigh,
  setPheLow,
} from '../phe';
import { normalizeInfo, normalizeStable, normalizeState } from '../state';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/services', () => ({ backend: jest.fn() }));
jest.mock('@/services/notify', () => ({ notify: jest.fn() }));

describe('PHE config', () => {
  it('reads 1, 2 and 5 lines with their names and sizes', () => {
    for (const n of [1, 2, 5]) {
      const c = normalizePheConfig({
        tankCount: n,
        tanks: Array.from({ length: n }, (_, i) => ({ name: `L${i}`, litres: 500, emptyCm: 110, fullCm: 25 })),
        low: 80,
        high: 96,
      });
      expect(c.lines).toHaveLength(n);
      expect(c.lines[n - 1]).toEqual({ name: `L${n - 1}`, litres: 500, emptyCm: 110, fullCm: 25 });
      expect([c.low, c.high]).toEqual([80, 96]);
    }
  });
  it('defaults: 1 line, reopen 85 %, close 95 %', () => {
    expect(normalizePheConfig(null)).toEqual(DEFAULT_PHE);
    expect(normalizePheConfig({ tankCount: 2 })).toMatchObject({ low: 85, high: 95 });
    expect(normalizePheConfig({ tankCount: 2 }).lines).toHaveLength(2);
  });
  it('keeps reopen 50–95 and at least 5 below close', () => {
    expect(normalizePheConfig({ tankCount: 1, low: 99, high: 90 })).toMatchObject({ low: 85, high: 90 });
    expect(setPheLow(30, 95)).toBe(50);
    expect(setPheLow(93, 95)).toBe(90);
    expect(setPheHigh(55, 50)).toBe(60);
    expect(setPheHigh(70, 80)).toBe(85);
    expect(setPheHigh(120, 85)).toBe(100);
  });
  it('writes only the PHE shape (no main, maxRunMin or heightFt)', () => {
    const out = serializePheConfig({
      lines: [
        { name: ' Roof ', litres: 1000, emptyCm: 120, fullCm: 30 },
        { name: null, litres: null, emptyCm: 100, fullCm: 25 },
      ],
      low: 85,
      high: 95,
    });
    expect(out).toEqual({
      tankCount: 2,
      tanks: [
        { name: 'Roof', litres: 1000, emptyCm: 120, fullCm: 30 },
        { emptyCm: 100, fullCm: 25 },
      ],
      low: 85,
      high: 95,
    });
  });
  it('resizes keeping the lines that stay', () => {
    const c = resizeLines({ ...DEFAULT_PHE, lines: [{ name: 'A', litres: 1, emptyCm: 90, fullCm: 30 }] }, 3);
    expect(c.lines.map((l) => l.name ?? null)).toEqual(['A', undefined, undefined].map((x) => x ?? null));
    expect(resizeLines(c, 9).lines).toHaveLength(5);
    expect(resizeLines(c, 0).lines).toHaveLength(1);
    expect(lineName([null, 'Shop'], 0)).toBe('Line 1');
    expect(lineName([null, 'Shop'], 1)).toBe('Shop');
  });
});

describe('PHE state', () => {
  const state = normalizeState({
    online: true,
    auto: true,
    supply: 'flowing',
    tanks: [
      { pct: 64, valve: true, ok: true, rising: true },
      { pct: 97, valve: false, ok: true, rising: true },
      { pct: null, valve: false, ok: false },
    ],
  })!;
  it('reads supply, rising only on open lines, no pump', () => {
    expect(state.supply).toBe('flowing');
    expect(state.tanks.map((t) => t.rising)).toEqual([true, false, false]);
    expect(state.pump).toBe(false);
  });
  it('builds the line rows and the supply card', () => {
    const cfg = normalizePheConfig({ tankCount: 3, tanks: [{ name: 'Main tank' }, {}, {}], low: 85, high: 95 });
    const rows = lineViews(state, cfg);
    expect(rows.map((r) => [r.name, r.pct, r.valve, r.full])).toEqual([
      ['Main tank', 64, true, false],
      ['Line 2', 97, false, true],
      ['Line 3', null, false, false],
    ]);
    expect(supplyView(state, rows)).toMatchObject({ text: 'Water coming', flowing: true });
    const dry = { ...state, supply: 'none' as const, tanks: state.tanks.map((t) => ({ ...t, rising: false })) };
    expect(supplyView(dry, lineViews(dry, cfg)).text).toBe('No water now');
    const waiting = { ...dry, supply: 'unknown' as const };
    expect(supplyView(waiting, lineViews(waiting, cfg)).text).toBe('Waiting for PHE water');
    const closed = { ...state, tanks: state.tanks.map((t) => ({ ...t, valve: false })) };
    expect(supplyView(closed, lineViews(closed, cfg)).text).toBe('All valves closed');
  });
});

describe('info, OTA state and firmware/stable', () => {
  it('reads type (missing = household), board v3 and flash', () => {
    expect(normalizeInfo({ fw: '2.3.0' })).toMatchObject({ type: 'household', flash: null });
    expect(normalizeInfo({ type: 'phe', board: 'v3', flash: 8 })).toMatchObject({ type: 'phe', board: 'v3', flash: 8 });
  });
  it('reads fwAvailable and ota; ignores junk', () => {
    const s = normalizeState({
      fwAvailable: '3.1.0',
      ota: { phase: 'download', pct: 42.4, to: '3.1.0' },
    })!;
    expect(s.fwAvailable).toBe('3.1.0');
    expect(s.ota).toEqual({ phase: 'download', pct: 42, to: '3.1.0', err: '' });
    const bad = normalizeState({ fwAvailable: 'latest', ota: { phase: 'explode' } })!;
    expect(bad.fwAvailable).toBeNull();
    expect(bad.ota).toBeNull();
    expect(bad.supply).toBeNull();
  });
  it('reads firmware/stable', () => {
    expect(normalizeStable(null)).toBeNull();
    expect(normalizeStable({ version: 'x' })).toBeNull();
    expect(
      normalizeStable({ version: '3.1.0', notes: ['a', 'b'], size: 10, date: '2026-11-20', minFw: '2.0.0', rollout: 10 }),
    ).toEqual({ version: '3.1.0', notes: ['a', 'b'], size: 10, date: '2026-11-20', minFw: '2.0.0', rollout: 10 });
  });
});
