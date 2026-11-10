import {
  activeTank,
  decideStart,
  decideValve,
  fillCommand,
  parseLitres,
  pickLowest,
  setHigh,
  setLow,
} from '../pump';

const live = (o: { pump?: boolean; active?: number | null; valves?: boolean[] } = {}) => ({
  pump: !!o.pump,
  active: o.active ?? null,
  tanks: (o.valves ?? [false, false, false]).map((valve) => ({ valve })),
});

describe('start / stop filling', () => {
  it('needs an open valve with 2+ tanks', () => {
    expect(decideStart(live(), 3)).toEqual({ ok: false, msg: 'Open a valve first' });
    expect(decideStart(live({ valves: [false, true, false] }), 3)).toMatchObject({
      ok: true,
      cmd: { pump: true },
    });
  });
  it('one tank: no valve, the pump fills it directly', () => {
    expect(decideStart(live({ valves: [false] }), 1)).toMatchObject({ ok: true, cmd: { pump: true } });
  });
  it('ignores a valve outside the layout', () => {
    expect(decideStart(live({ valves: [false, false, true] }), 2)).toMatchObject({ ok: false });
  });
  it('always allows stop', () => {
    expect(decideStart(live({ pump: true, active: 0 }), 3)).toMatchObject({ ok: true, cmd: { pump: false } });
  });
  it('fill command: valve + pump, or just the pump for one tank', () => {
    expect(fillCommand(2, 5)).toEqual({ valve: { i: 2, open: true }, pump: true });
    expect(fillCommand(0, 1)).toEqual({ pump: true });
  });
});

describe('valves', () => {
  it('stops the pump first when the filling tank valve is closed', () => {
    expect(decideValve(1, live({ pump: true, active: 1, valves: [false, true, false] })).kind).toBe(
      'stopPumpFirst',
    );
  });
  it('toggles otherwise', () => {
    expect(decideValve(0, live({ pump: true, active: 1, valves: [true, true] }))).toEqual({
      kind: 'toggle',
      open: false,
    });
    expect(decideValve(2, live())).toEqual({ kind: 'toggle', open: true });
  });
  it('knows the filling tank', () => {
    expect(activeTank(live({ pump: true, valves: [false, true] }))).toBe(1);
    expect(activeTank(live({ pump: true, active: 2 }))).toBe(2);
    expect(activeTank(live({ pump: true, valves: [false] }))).toBe(0); // one tank, no valve
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
