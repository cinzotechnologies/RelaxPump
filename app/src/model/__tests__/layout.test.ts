import {
  DEFAULT_LAYOUT,
  DEFAULT_SEMI,
  V1_PORTS,
  V2_PORTS,
  autoTanks,
  effectiveMode,
  firstSource,
  freePorts,
  isLayoutValid,
  list,
  modeOptions,
  normalizeConfig,
  portsOf,
  serializeConfig,
  validateLayout,
  type LayoutConfig,
  type SemiConfig,
} from '../layout';

const t = (o: Partial<SemiConfig> = {}): SemiConfig => ({ ...DEFAULT_SEMI, ...o });
const cfg = (semi: SemiConfig[], o: Partial<LayoutConfig> = {}): LayoutConfig => ({ ...DEFAULT_LAYOUT, semi, ...o });
const ok = (c: LayoutConfig, p = V2_PORTS) => isLayoutValid(validateLayout(c, p));

describe('layout rules (flexible-system §2)', () => {
  it('sensor + valve is always fine, 1 to 8 tanks', () => {
    for (let n = 1; n <= 8; n++) expect(ok(cfg(Array.from({ length: n }, () => t())))).toBe(true);
  });
  it('a single tank may have only a sensor, or nothing with a fill time', () => {
    expect(ok(cfg([t({ valve: false })]))).toBe(true);
    expect(ok(cfg([t({ valve: false, sensor: false, fillMin: 10 })]))).toBe(true);
  });
  it('a tank without a sensor needs a fill time 1–120', () => {
    const e = validateLayout(cfg([t(), t({ sensor: false })]), V2_PORTS);
    expect(e.tanks).toEqual([null, 'needs-fill-time']);
    expect(ok(cfg([t(), t({ sensor: false, fillMin: 121 })]))).toBe(false);
    expect(ok(cfg([t(), t({ sensor: false, fillMin: 120 })]))).toBe(true);
  });
  it('with 2+ tanks every tank needs a valve', () => {
    const e = validateLayout(cfg([t(), t({ valve: false }), t()]), V2_PORTS);
    expect(e.tanks).toEqual([null, 'needs-valve', null]);
  });
  it('tanks are capped by the board ports', () => {
    expect(ok(cfg([t(), t(), t()]), V1_PORTS)).toBe(true);
    const e = validateLayout(cfg([t(), t(), t(), t()]), V1_PORTS);
    expect(e.count).toBe('too-many');
    expect(e.tanks[3]).toBe('no-port');
  });
  it('main / PHE need their ports; mode phe needs PHE', () => {
    const c = cfg([t()], { main: { ...DEFAULT_LAYOUT.main, enabled: true }, phe: { ...DEFAULT_LAYOUT.phe, enabled: true } });
    expect(ok(c)).toBe(true);
    expect(validateLayout(c, V1_PORTS)).toMatchObject({ main: 'no-port', phe: 'no-port' });
    expect(validateLayout(cfg([t()], { mode: 'phe' }), V2_PORTS).mode).toBe('phe-missing');
  });
});

describe('mode and source helpers', () => {
  it('offers PHE only when installed', () => {
    expect(modeOptions(true).map((m) => m.label)).toEqual(['Auto', 'PHE only', 'Pump only']);
    expect(modeOptions(false).map((m) => m.label)).toEqual(['Auto', 'Pump only']);
  });
  it('falls back from phe to auto when PHE is gone', () => {
    expect(effectiveMode('phe', false)).toBe('auto');
    expect(effectiveMode('pump', false)).toBe('pump');
  });
  it('tries PHE first in auto when installed', () => {
    expect(firstSource('auto', true)).toBe('phe');
    expect(firstSource('auto', false)).toBe('pump');
    expect(firstSource('pump', true)).toBe('pump');
    expect(firstSource('phe', true)).toBe('phe');
  });
  it('auto only uses tanks with sensor and valve', () => {
    expect(autoTanks(cfg([t(), t({ sensor: false, fillMin: 10 }), t()]))).toEqual([0, 2]);
    expect(autoTanks(cfg([t({ valve: false })]))).toEqual([0]);
  });
  it('counts free ports', () => {
    expect(freePorts(cfg([t(), t(), t()]), V2_PORTS)).toBe(5);
    expect(freePorts(cfg([t(), t(), t()]), V1_PORTS)).toBe(0);
  });
});

describe('reading the database', () => {
  it('migrates a v1 config (tankCount + tanks)', () => {
    const c = normalizeConfig({
      tankCount: 2,
      low: 30,
      high: 90,
      maxRunMin: 20,
      tanks: [{ emptyCm: 110, fullCm: 25, litres: 1000, name: 'Roof' }, { emptyCm: 120, fullCm: 30, litres: 0 }, {}],
    });
    expect(c.semi).toHaveLength(2);
    expect(c.semi[0]).toMatchObject({ name: 'Roof', litres: 1000, emptyCm: 110, sensor: true, valve: true });
    expect(c.semi[1].litres).toBeNull();
    expect(c).toMatchObject({ low: 30, high: 90, maxRunMin: 20, mode: 'pump' });
    expect(c.phe.enabled).toBe(false);
  });
  it('reads a v2 config with gaps as objects', () => {
    const c = normalizeConfig({
      low: 20,
      high: 95,
      maxRunMin: 30,
      mode: 'auto',
      semi: { 0: { sensor: true, valve: true, emptyCm: 1, fullCm: 30 }, 1: { sensor: false, valve: true, fillMin: 10, emptyCm: 1, fullCm: 30 } },
      phe: { enabled: true, probeMin: 4, retryMin: 30 },
    });
    expect(c.semi.map((s) => s.sensor)).toEqual([true, false]);
    expect(c.semi[1].fillMin).toBe(10);
    expect(c.mode).toBe('auto');
  });
  it('round-trips through serializeConfig', () => {
    const c = cfg([t({ name: 'Roof', litres: 1000 }), t({ sensor: false, fillMin: 15 })], { mode: 'auto' });
    expect(normalizeConfig(serializeConfig(c))).toEqual(normalizeConfig(JSON.parse(JSON.stringify(serializeConfig(c)))));
    const s = serializeConfig(c) as { semi: Record<string, unknown>[] };
    expect(s.semi[0]).not.toHaveProperty('fillMin');
    expect(s.semi[1]).toMatchObject({ fillMin: 15, sensor: false });
    expect(JSON.stringify(s)).not.toContain('null');
  });
  it('reads ports from info, old devices default to v1', () => {
    expect(portsOf({ maxTanks: 3 })).toEqual(V1_PORTS);
    expect(portsOf({ board: 'v2' })).toEqual(V2_PORTS);
    expect(portsOf({ ports: { sensors: 8, valves: 8, phe: true, main: false } })).toMatchObject({ main: false });
    expect(portsOf(null)).toEqual(V1_PORTS);
  });
  it('list() handles arrays, objects and junk', () => {
    expect(list([1, 2])).toEqual([1, 2]);
    expect(list({ 1: 'b', 0: 'a', x: 'no' })).toEqual(['a', 'b']);
    expect(list(null)).toEqual([]);
  });
});
