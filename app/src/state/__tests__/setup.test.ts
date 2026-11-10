import { DEFAULT_LAYOUT, V1_PORTS, V2_PORTS } from '@/model/layout';
import { mockLayout } from '@/services/mockBackend';

import {
  draftFrom,
  draftToConfig,
  modesOf,
  outputsOf,
  reduce,
  sensorChecksOf,
  stepBlocked,
  summaryRows,
  summaryText,
  tankErrors,
  type Action,
  type Draft,
} from '../setup';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

const run = (d: Draft, ...as: Action[]) => as.reduce((x, a) => reduce(x, a, V2_PORTS), d);
const fresh = () => draftFrom(DEFAULT_LAYOUT, V2_PORTS);

describe('installer setup draft', () => {
  it('counts 1…8 on v2 and 1…3 on v1', () => {
    expect(run(fresh(), { type: 'count', n: 12 }).n).toBe(8);
    expect(run(fresh(), { type: 'count', n: 0 }).n).toBe(1);
    expect(reduce(draftFrom(DEFAULT_LAYOUT, V1_PORTS), { type: 'count', n: 5 }, V1_PORTS).n).toBe(3);
  });
  it('keeps what was typed when the count goes down and up', () => {
    const d = run(fresh(), { type: 'count', n: 4 }, { type: 'tank', i: 3, patch: { name: 'Garden' } }, { type: 'count', n: 2 }, { type: 'count', n: 4 });
    expect(d.tanks[3].name).toBe('Garden');
  });
  it('blocks Next on step 2 while a tank needs a valve (design inline error)', () => {
    const d = run(fresh(), { type: 'count', n: 3 }, { type: 'tank', i: 1, patch: { valve: false } });
    expect(tankErrors(d, V2_PORTS)[1]).toBe('Needs a valve — you have more than one tank.');
    expect(stepBlocked(d, 1, V2_PORTS)).toBe(true);
    expect(stepBlocked(d, 0, V2_PORTS)).toBe(false);
    expect(stepBlocked(run(d, { type: 'count', n: 1 }), 1, V2_PORTS)).toBe(false);
  });
  it('fill time 5–120 in steps of 5 for a tank without a sensor', () => {
    let d = run(fresh(), { type: 'tank', i: 0, patch: { sensor: false } });
    d = run(d, ...Array.from({ length: 30 }, () => ({ type: 'fillMin', i: 0, delta: 5 }) as Action));
    expect(d.tanks[0].fillMin).toBe(120);
    d = run(d, ...Array.from({ length: 30 }, () => ({ type: 'fillMin', i: 0, delta: -5 }) as Action));
    expect(d.tanks[0].fillMin).toBe(5);
  });
  it('main tank stop level 5–40, PHE off drops the PHE only mode', () => {
    let d = run(fresh(), { type: 'main', on: true }, { type: 'minPct', delta: 50 });
    expect(d.minPct).toBe(40);
    d = run(d, { type: 'phe', on: true }, { type: 'mode', mode: 'phe' });
    expect(d.mode).toBe('phe');
    expect(modesOf(d).map((m) => m.label)).toEqual(['Auto', 'PHE only', 'Pump only']);
    d = run(d, { type: 'phe', on: false });
    expect(d.mode).toBe('auto');
    expect(modesOf(d).map((m) => m.label)).toEqual(['Auto', 'Pump only']);
  });
  it('no main / PHE on a v1 board', () => {
    const d = reduce(draftFrom(DEFAULT_LAYOUT, V1_PORTS), { type: 'phe', on: true }, V1_PORTS);
    expect(d.pheOn).toBe(false);
  });
  it('builds the saved config', () => {
    const d = run(
      fresh(),
      { type: 'count', n: 2 },
      { type: 'tank', i: 1, patch: { sensor: false } },
      { type: 'main', on: true },
      { type: 'phe', on: true },
      { type: 'mode', mode: 'auto' },
    );
    const c = draftToConfig(d);
    expect(c.semi).toHaveLength(2);
    expect(c.semi[0].fillMin).toBeNull();
    expect(c.semi[1]).toMatchObject({ sensor: false, fillMin: 10 });
    expect(c.main).toMatchObject({ enabled: true, sensor: true, minPct: 10 });
    expect(c.phe.enabled).toBe(true);
    expect(summaryText(d)).toBe('2 semi tanks · PHE · main tank sensor.');
    expect(summaryRows(d)[1]).toEqual({ k: 'With sensor', v: '1 of 2' });
  });
  it('lists the wiring checks', () => {
    const d = run(fresh(), { type: 'count', n: 3 }, { type: 'tank', i: 2, patch: { sensor: false } }, { type: 'phe', on: true });
    expect(outputsOf(d).map((o) => o.port)).toEqual(['V1', 'V2', 'V3', 'PHE', 'PUMP']);
    const checks = sensorChecksOf(d, { s: [true, false, true, false, false, false, false, false], main: false });
    expect(checks.map((c) => `${c.port}:${c.state}`)).toEqual(['S1:ok', 'S2:bad']);
    expect(sensorChecksOf(d, null)[0].state).toBe('wait');
  });
  it('starts from the mock layouts', () => {
    for (const spec of ['1', '3', '5,phe', '8,phe,main', '4,phe,main,ns3']) {
      const cfg = mockLayout(spec);
      const d = draftFrom(cfg, V2_PORTS);
      expect(d.n).toBe(cfg.semi.length);
      expect(stepBlocked(d, 1, V2_PORTS)).toBe(false);
    }
  });
});
