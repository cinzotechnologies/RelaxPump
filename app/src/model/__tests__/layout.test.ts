import {
  clampCount,
  DEFAULT_LAYOUT,
  DEFAULT_TANK,
  freePorts,
  hasValves,
  list,
  normalizeConfig,
  portLabel,
  relaysUsed,
  serializeConfig,
  valveCount,
  type LayoutConfig,
} from '../layout';

const cfg = (n: number, o: Partial<LayoutConfig> = {}): LayoutConfig => ({
  ...DEFAULT_LAYOUT,
  tanks: Array.from({ length: n }, () => ({ ...DEFAULT_TANK })),
  ...o,
});

describe('layout rules (flexible-system §1)', () => {
  it('one tank = sensor only, 2–5 tanks = sensor + valve each', () => {
    expect(hasValves(1)).toBe(false);
    expect([2, 3, 4, 5].every(hasValves)).toBe(true);
    expect(valveCount(1)).toBe(0);
    expect(valveCount(4)).toBe(4);
  });
  it('relays used out of 6: one per valve + the pump', () => {
    expect(relaysUsed(1)).toBe(1);
    expect(relaysUsed(3)).toBe(4);
    expect(relaysUsed(5)).toBe(6);
  });
  it('counts 1–5, capped by the firmware', () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(8)).toBe(5);
    expect(clampCount(5, 3)).toBe(3);
  });
  it('free tank ports out of 5', () => {
    expect(freePorts(3)).toBe(2);
    expect(freePorts(5)).toBe(0);
    expect(freePorts(3, 3)).toBe(0);
  });
  it('port labels for the setup', () => {
    expect(portLabel(0, 1)).toBe('T1 · sensor only');
    expect(portLabel(1, 3)).toBe('T2 · sensor + valve');
  });
});

describe('reading the database', () => {
  it('reads tankCount + tanks; no main = no main tank sensor', () => {
    const c = normalizeConfig({
      tankCount: 2,
      low: 30,
      high: 90,
      maxRunMin: 20,
      tanks: [
        { emptyCm: 110, fullCm: 25, litres: 1000, name: 'Roof', heightFt: 30 },
        { emptyCm: 120, fullCm: 30, litres: 0 },
        {},
      ],
    });
    expect(c.tanks).toHaveLength(2);
    expect(c.tanks[0]).toMatchObject({ name: 'Roof', litres: 1000, emptyCm: 110, heightFt: 30 });
    expect(c.tanks[1].litres).toBeNull();
    expect(c).toMatchObject({ low: 30, high: 90, maxRunMin: 20 });
    expect(c.main.enabled).toBe(false);
  });
  it('reads the main tank and tanks with gaps as objects', () => {
    const c = normalizeConfig({
      tankCount: 3,
      low: 20,
      high: 95,
      maxRunMin: 30,
      tanks: { 0: { emptyCm: 100, fullCm: 30 }, 2: { emptyCm: 90, fullCm: 30 } },
      main: { enabled: true, minPct: 15, litres: 5000 },
    });
    expect(c.tanks).toHaveLength(3);
    expect(c.tanks[2].emptyCm).toBe(90);
    expect(c.tanks[1]).toMatchObject(DEFAULT_TANK);
    expect(c.main).toMatchObject({ enabled: true, minPct: 15, litres: 5000 });
  });
  it('caps more than 5 tanks', () => {
    expect(normalizeConfig({ tankCount: 8, tanks: [] }).tanks).toHaveLength(5);
  });
  it('round-trips through serializeConfig with tankCount = tanks.length', () => {
    const c = cfg(2, { main: { ...DEFAULT_LAYOUT.main, enabled: true, minPct: 20 } });
    c.tanks[0] = { ...c.tanks[0], name: 'Roof', litres: 1000, heightFt: 30 };
    const s = serializeConfig(c) as { tankCount: number; tanks: unknown[] };
    expect(s.tankCount).toBe(2);
    expect(s.tanks).toHaveLength(2);
    expect(JSON.stringify(s)).not.toContain('null');
    expect(JSON.stringify(s)).not.toMatch(/semi|phe|mode|sensor|valve/);
    expect(normalizeConfig(JSON.parse(JSON.stringify(s)))).toEqual(normalizeConfig(s));
    expect(normalizeConfig(s).tanks[0]).toMatchObject({ name: 'Roof', litres: 1000, heightFt: 30 });
  });
  it('list() handles arrays, objects and junk', () => {
    expect(list([1, 2])).toEqual([1, 2]);
    expect(list({ 1: 'b', 0: 'a', x: 'no' })).toEqual(['a', 'b']);
    expect(list({ 0: 'a', 2: 'c' })).toEqual(['a', undefined, 'c']);
    expect(list(null)).toEqual([]);
  });
});
