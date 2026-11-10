import { DEFAULT_LAYOUT, DEFAULT_SEMI, type LayoutConfig } from '@/model/layout';

import { activeTank, decideStart, decideValve, parseLitres, pickLowest, setHigh, setLow } from '../pump';

const live = (o: { pump?: boolean; phe?: boolean; active?: number | null; valves?: boolean[] } = {}) => ({
  pump: !!o.pump,
  phe: !!o.phe,
  active: o.active ?? null,
  semi: (o.valves ?? [false, false, false]).map((valve) => ({ valve })),
});
const cfg = (n: number, o: Partial<LayoutConfig> = {}): LayoutConfig => ({
  ...DEFAULT_LAYOUT,
  semi: Array.from({ length: n }, () => ({ ...DEFAULT_SEMI })),
  ...o,
});
const phe = { ...DEFAULT_LAYOUT.phe, enabled: true };

describe('start / stop filling', () => {
  it('needs an open valve with 2+ tanks', () => {
    expect(decideStart(live(), cfg(3))).toEqual({ ok: false, msg: 'Open a valve first' });
  });
  it('uses the pump in Pump only, PHE first in Auto with a PHE line', () => {
    expect(decideStart(live({ valves: [false, true, false] }), cfg(3, { mode: 'pump' }))).toMatchObject({
      ok: true,
      cmd: { pump: true },
    });
    expect(decideStart(live({ valves: [true, false, false] }), cfg(3, { mode: 'auto', phe }))).toMatchObject({
      ok: true,
      cmd: { phe: true },
    });
  });
  it('fills the only tank directly', () => {
    expect(decideStart(live({ valves: [false] }), cfg(1))).toMatchObject({ ok: true, cmd: { fill: { i: 0, src: 'pump' } } });
  });
  it('always allows stop', () => {
    expect(decideStart(live({ phe: true, active: 0 }), cfg(3))).toMatchObject({ ok: true, cmd: { pump: false } });
  });
});

describe('valves', () => {
  it('stops the source first when the filling tank valve is closed', () => {
    expect(decideValve(1, live({ pump: true, active: 1, valves: [false, true, false] })).kind).toBe('stopPumpFirst');
  });
  it('toggles otherwise', () => {
    expect(decideValve(0, live({ pump: true, active: 1, valves: [true, true] }))).toEqual({ kind: 'toggle', open: false });
    expect(decideValve(2, live())).toEqual({ kind: 'toggle', open: true });
  });
  it('knows the filling tank', () => {
    expect(activeTank(live({ pump: true, valves: [false, true] }))).toBe(1);
    expect(activeTank(live({ phe: true, active: 2 }))).toBe(2);
    expect(activeTank(live({ valves: [false, true] }))).toBe(-1);
  });
});

describe('thresholds', () => {
  it('keeps Start 5–80 and ≥10 below Stop', () => {
    expect(setLow(0, 95)).toBe(5);
    expect(setLow(90, 100)).toBe(80);
    expect(setLow(60, 65)).toBe(55);
    expect(setLow(22, 95)).toBe(20);
  });
  it('keeps Stop 20–100 and ≥10 above Start', () => {
    expect(setHigh(10, 5)).toBe(20);
    expect(setHigh(110, 20)).toBe(100);
    expect(setHigh(30, 40)).toBe(50);
  });
  it('parses optional litres', () => {
    expect(parseLitres('1,000')).toBe(1000);
    expect(parseLitres('')).toBeNull();
    expect(parseLitres('0')).toBeNull();
    expect(parseLitres('12345678')).toBe(123456);
  });
});

describe('auto pick', () => {
  const t = (pct: number | null, ok = true) => ({ pct, ok });
  it('picks the lowest tank below Start', () => {
    expect(pickLowest([t(50), t(10), t(15)], 20)).toBe(1);
  });
  it('skips sensor errors, tanks without a level, the excluded tank, and full ones', () => {
    expect(pickLowest([t(5, false), t(null), t(12)], 20)).toBe(2);
    expect(pickLowest([t(10), t(12)], 20, 0)).toBe(1);
    expect(pickLowest([t(50), t(60)], 20)).toBe(-1);
  });
});
