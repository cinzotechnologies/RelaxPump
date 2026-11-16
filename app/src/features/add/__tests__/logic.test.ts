import { DEFAULT_LAYOUT } from '@/model/layout';
import { DEFAULT_PHE } from '@/model/phe';
import { mockLayout } from '@/services/mockBackend';
import {
  draftFromPhe,
  draftToPhe,
  outputsOf,
  reduce,
  summaryRows,
  summaryText,
  tankPorts,
} from '@/state/setup';

import { countHelpOf, householdConfig, outputsFor, pheConfig, portsOf, stepTitle } from '../logic';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/services', () => ({ backend: jest.fn() }));

describe('Add device', () => {
  it('step titles follow the module', () => {
    expect(stepTitle(3, 'household')).toBe('Semi tanks');
    expect(stepTitle(3, 'phe')).toBe('PHE lines');
    expect(stepTitle(5, 'phe')).toBe('Done');
  });
  it('ports: one household tank is sensor only; PHE always sensor + valve', () => {
    expect(portsOf('household', 1, 0)).toBe('T1 · sensor only');
    expect(portsOf('household', 3, 2)).toBe('T3 + V3');
    expect(portsOf('phe', 1, 0)).toBe('T1 + V1');
    expect(countHelpOf('phe', 1)).toMatch(/No pump/);
    expect(countHelpOf('household', 1)).toMatch(/pump fills it directly/);
  });
  it('wiring check outputs', () => {
    expect(outputsFor('household', 1, ['Roof']).map((o) => o.port)).toEqual(['PUMP']);
    expect(outputsFor('household', 2, ['Roof', 'Kitchen']).map((o) => o.port)).toEqual(['V1', 'V2', 'PUMP']);
    expect(outputsFor('phe', 2, ['Main', 'Shop'])).toEqual([
      { port: 'V1', name: 'Main valve' },
      { port: 'V2', name: 'Shop valve' },
    ]);
  });
  it('household layout keeps the board settings, takes count, names and main sensor', () => {
    const base = { ...mockLayout('5,main'), low: 25 };
    const c = householdConfig(base, 2, ['Roof ', 'Kitchen'], false);
    expect(c.tanks.map((t) => t.name)).toEqual(['Roof', 'Kitchen']);
    expect(c.main.enabled).toBe(false);
    expect(c.low).toBe(25);
    expect(householdConfig(DEFAULT_LAYOUT, 1, ['Roof'], true).main.enabled).toBe(true);
  });
  it('PHE config from count + names (blank name = default "Line N")', () => {
    const c = pheConfig(DEFAULT_PHE, 3, ['Main tank', '', 'Shop']);
    expect(c.lines.map((l) => l.name)).toEqual(['Main tank', null, 'Shop']);
    expect([c.low, c.high]).toEqual([85, 95]);
  });
});

describe('PHE Installer setup draft', () => {
  const cfg = { lines: [{ name: 'Main tank', litres: 1000, emptyCm: 140, fullCm: 30 }], low: 80, high: 95 };
  it('round-trips the PHE config; lines have no heights', () => {
    const d = draftFromPhe(cfg);
    expect(d.phe).toBe(true);
    expect(draftToPhe(d)).toEqual(cfg);
    const d2 = reduce(reduce(d, { type: 'count', n: 2 }), { type: 'tank', i: 1, patch: { name: 'Shop' } });
    expect(draftToPhe(d2).lines.map((l) => l.name)).toEqual(['Main tank', 'Shop']);
    expect(Object.keys(draftToPhe(d2).lines[1])).not.toContain('heightFt');
  });
  it('reopen / close keep 5 apart; main tank stays off', () => {
    let d = draftFromPhe(cfg);
    d = reduce(d, { type: 'pheLow', delta: 20 });
    expect([d.low, d.high]).toEqual([90, 95]);
    d = reduce(d, { type: 'pheHigh', delta: -20 });
    expect(d.high).toBe(95);
    d = reduce(d, { type: 'main', on: true });
    expect(d.mainOn).toBe(false);
  });
  it('texts and outputs: valves only, no pump, no relay count', () => {
    const d = reduce(draftFromPhe(cfg), { type: 'count', n: 2 });
    expect(outputsOf(d).map((o) => o.port)).toEqual(['V1', 'V2']);
    expect(outputsOf(d)[1].name).toBe('Line 2 valve');
    expect(tankPorts(d, 0)).toBe('T1 · sensor + valve');
    expect(summaryText(d)).toBe('2 PHE lines · reopen below 80% · close at 95%.');
    expect(summaryRows(d).map((r) => r.k)).toEqual([
      'PHE lines',
      'Sensors',
      'Valves',
      'Reopen below',
      'Close at',
    ]);
  });
});
