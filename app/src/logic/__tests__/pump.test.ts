import { DEFAULT_CONFIG } from '@/model/types';

import {
  activeTank,
  decidePump,
  decideValve,
  parseLitres,
  pickLowest,
  resizeConfig,
  setHigh,
  setLow,
} from '../pump';

const v = (...open: boolean[]) => open.map((valve) => ({ valve }));

describe('pump safety', () => {
  it('will not start the pump with every valve closed', () => {
    expect(decidePump(false, v(false, false, false))).toEqual({ ok: false, msg: 'Open a valve first' });
  });
  it('starts with a valve open and always allows stop', () => {
    expect(decidePump(false, v(false, true))).toEqual({ ok: true, on: true });
    expect(decidePump(true, v(false, false))).toEqual({ ok: true, on: false });
  });
  it('stops the pump first when the last open valve is closed', () => {
    expect(decideValve(1, true, v(false, true, false)).kind).toBe('stopPumpFirst');
  });
  it('toggles a valve otherwise', () => {
    expect(decideValve(0, true, v(true, true))).toEqual({ kind: 'toggle', open: false });
    expect(decideValve(2, false, v(false, false, false))).toEqual({ kind: 'toggle', open: true });
  });
  it('finds the tank being filled only while the pump runs', () => {
    expect(activeTank(true, v(false, true))).toBe(1);
    expect(activeTank(false, v(false, true))).toBe(-1);
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
});

describe('tank config', () => {
  it('clamps the tank count to 1…maxTanks and keeps settings', () => {
    const c = { ...DEFAULT_CONFIG, tanks: [{ emptyCm: 100, fullCm: 30, litres: 500 }], tankCount: 1 };
    expect(resizeConfig(c, 0, 3).tankCount).toBe(1);
    const grown = resizeConfig(c, 5, 3);
    expect(grown.tankCount).toBe(3);
    expect(grown.tanks).toHaveLength(3);
    expect(grown.tanks[0].litres).toBe(500);
  });
  it('parses optional litres', () => {
    expect(parseLitres('1,000')).toBe(1000);
    expect(parseLitres('')).toBeNull();
    expect(parseLitres('0')).toBeNull();
    expect(parseLitres('12345678')).toBe(123456);
  });
});

describe('auto pick', () => {
  const t = (pct: number, ok = true) => ({ pct, ok, valve: false });
  it('picks the lowest tank below Start', () => {
    expect(pickLowest([t(50), t(10), t(15)], 20)).toBe(1);
  });
  it('skips sensor errors, the excluded tank, and tanks above Start', () => {
    expect(pickLowest([t(5, false), t(30), t(12)], 20)).toBe(2);
    expect(pickLowest([t(10), t(12)], 20, 0)).toBe(1);
    expect(pickLowest([t(50), t(60)], 20)).toBe(-1);
  });
});
