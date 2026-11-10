import { DEFAULT_LAYOUT } from '@/model/layout';
import { mockLayout } from '@/services/mockBackend';

import {
  countHelp,
  draftFrom,
  draftToConfig,
  outputsOf,
  reduce,
  sensorChecksOf,
  summaryRows,
  summaryText,
  tankPorts,
  type Action,
  type Draft,
} from '../setup';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

const run = (d: Draft, ...as: Action[]) => as.reduce((x, a) => reduce(x, a), d);
const fresh = () => draftFrom(DEFAULT_LAYOUT);

describe('installer setup draft', () => {
  it('counts 1…5 (1…3 on the first firmware)', () => {
    expect(run(fresh(), { type: 'count', n: 12 }).n).toBe(5);
    expect(run(fresh(), { type: 'count', n: 0 }).n).toBe(1);
    expect(reduce(draftFrom(DEFAULT_LAYOUT, 3), { type: 'count', n: 5 }).n).toBe(3);
  });
  it('keeps what was typed when the count goes down and up', () => {
    const d = run(
      fresh(),
      { type: 'count', n: 4 },
      { type: 'tank', i: 3, patch: { name: 'Garden' } },
      { type: 'count', n: 2 },
      { type: 'count', n: 4 },
    );
    expect(d.tanks[3].name).toBe('Garden');
  });
  it('one tank = sensor only; 2+ = sensor + valve per port', () => {
    const one = run(fresh(), { type: 'count', n: 1 });
    expect(tankPorts(one, 0)).toBe('T1 · sensor only');
    expect(countHelp(one)).toMatch(/only a sensor/);
    const three = run(fresh(), { type: 'count', n: 3 });
    expect(tankPorts(three, 2)).toBe('T3 · sensor + valve');
    expect(countHelp(three)).toMatch(/tank 1 uses T1/);
  });
  it('going from 1 to 2 tanks says tank 1 needs a valve too', () => {
    const d = run(draftFrom(mockLayout('1')), { type: 'count', n: 2 });
    expect(countHelp(d)).toMatch(/fit a valve on tank 1 too/);
  });
  it('height 5–100 ft in steps of 5, default 20', () => {
    let d = fresh();
    expect(d.tanks[0].heightFt).toBe(20);
    d = run(d, ...Array.from({ length: 30 }, () => ({ type: 'height', i: 0, delta: 5 }) as Action));
    expect(d.tanks[0].heightFt).toBe(100);
    d = run(d, ...Array.from({ length: 30 }, () => ({ type: 'height', i: 0, delta: -5 }) as Action));
    expect(d.tanks[0].heightFt).toBe(5);
  });
  it('main tank stop level 5–40', () => {
    let d = run(fresh(), { type: 'main', on: true }, { type: 'minPct', delta: 50 });
    expect(d.minPct).toBe(40);
    d = run(d, { type: 'minPct', delta: -100 });
    expect(d.minPct).toBe(5);
  });
  it('builds the saved config and the summary', () => {
    const d = run(
      fresh(),
      { type: 'count', n: 2 },
      { type: 'tank', i: 1, patch: { litres: 500, name: 'Kitchen' } },
      { type: 'main', on: true },
    );
    const c = draftToConfig(d);
    expect(c.tanks).toHaveLength(2);
    expect(c.tanks[1]).toMatchObject({ litres: 500, name: 'Kitchen', heightFt: 20 });
    expect(c.main).toMatchObject({ enabled: true, minPct: 10 });
    expect(c).not.toHaveProperty('phe');
    expect(summaryText(d)).toBe('2 semi tanks · main tank sensor.');
    expect(summaryRows(d)).toEqual([
      { k: 'Semi tanks', v: '2' },
      { k: 'Sensors', v: '2' },
      { k: 'Valves', v: '2' },
      { k: 'Main tank sensor', v: 'Yes · stop below 10%' },
      { k: 'Relays used', v: '3 of 6' },
    ]);
    const one = run(fresh(), { type: 'count', n: 1 });
    expect(summaryRows(one)[2]).toEqual({ k: 'Valves', v: 'None (one tank)' });
    expect(summaryRows(one)[4]).toEqual({ k: 'Relays used', v: '1 of 6' });
    expect(summaryText(one)).toBe('1 semi tank.');
  });
  it('lists the wiring checks', () => {
    const d = run(fresh(), { type: 'count', n: 3 }, { type: 'main', on: true });
    expect(outputsOf(d).map((o) => o.port)).toEqual(['V1', 'V2', 'V3', 'PUMP']);
    expect(outputsOf(run(d, { type: 'count', n: 1 })).map((o) => o.port)).toEqual(['PUMP']);
    const checks = sensorChecksOf(d, { tanks: [true, false, true, false, false], main: false });
    expect(checks.map((c) => `${c.port}:${c.state}`)).toEqual(['T1:ok', 'T2:bad', 'T3:ok', 'MAIN:bad']);
    expect(sensorChecksOf(d, null)[0].state).toBe('wait');
  });
  it('starts from the mock layouts', () => {
    for (const spec of ['1', '2', '3,main', '5', '5,main']) {
      const cfg = mockLayout(spec);
      const d = draftFrom(cfg);
      expect(d.n).toBe(cfg.tanks.length);
      expect(d.mainOn).toBe(cfg.main.enabled);
      expect(draftToConfig(d).tanks).toHaveLength(cfg.tanks.length);
    }
  });
});
