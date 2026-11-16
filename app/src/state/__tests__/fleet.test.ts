// Fleet + PHE stores against the simulator (mock backend): many boards on one account, Home tabs,
// selection, OTA from the Software update card, PHE auto fill, adding and removing boards.
import type { Backend } from '@/services/backend';
import { createMockBackend, MOCK_DEVICE_ID, MOCK_PHE_ID } from '@/services/mockBackend';

import { idsOfType, pick, resetFleet, useFleet } from '../fleet';
import { usePhe } from '../phe';
import { useUi } from '../ui';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/services/notify', () => ({ notify: jest.fn() }));
let mockMb: Backend;
jest.mock('@/services', () => ({ backend: () => mockMb }));

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  resetFleet();
  usePhe.getState().attach(null);
  useFleet.setState({ tab: 'household' });
});
afterEach(() => {
  resetFleet();
  usePhe.getState().attach(null);
  jest.clearAllTimers();
  jest.useRealTimers();
});

async function signedIn(fleet: 'both' | 'household' | 'phe' | 'none') {
  mockMb = createMockBackend('3,main', fleet);
  await mockMb.signIn('9876543210', 'relax123');
  const ids = await new Promise<string[]>((res) => mockMb.onProfile('demo', (p) => res(Object.keys(p?.devices ?? {}).sort())));
  useFleet.getState().sync(ids);
  await flush();
  return ids;
}

describe('fleet', () => {
  it('helpers: boards of a type, saved selection or the first', () => {
    const devices = {
      a: { id: 'a', info: { type: 'phe' }, state: null, online: false },
      b: { id: 'b', info: { type: 'household' }, state: null, online: false },
      c: { id: 'c', info: null, state: null, online: false },
    } as never;
    expect(idsOfType(devices, ['a', 'b', 'c'], 'phe')).toEqual(['a']);
    expect(pick(['x', 'y'], 'y')).toBe('y');
    expect(pick(['x', 'y'], 'gone')).toBe('x');
    expect(pick([], 'x')).toBeNull();
  });

  it.each([
    ['both', MOCK_DEVICE_ID, MOCK_PHE_ID, 'household'],
    ['household', MOCK_DEVICE_ID, null, 'household'],
    ['phe', null, MOCK_PHE_ID, 'phe'],
    ['none', null, null, 'household'],
  ] as const)('fleet %s → household %s, PHE %s, tab %s', async (fleet, hh, phe, tab) => {
    const promise = signedIn(fleet);
    jest.advanceTimersByTime(1000);
    await promise;
    const f = useFleet.getState();
    expect([f.householdId, f.pheId, f.tab, f.loaded]).toEqual([hh, phe, tab, true]);
  });

  it('tab and selection follow the owner', async () => {
    const p = signedIn('both');
    jest.advanceTimersByTime(1000);
    await p;
    useFleet.getState().setTab('phe');
    expect(useFleet.getState().tab).toBe('phe');
    useFleet.getState().select(MOCK_DEVICE_ID);
    expect(useFleet.getState().tab).toBe('household');
  });

  it('Software update: available → download → … → done, new firmware reported', async () => {
    const p = signedIn('household');
    jest.advanceTimersByTime(1000);
    await p;
    // Auto would start the pump on a low tank; turn Auto off and wait for the pump to stop.
    await mockMb.sendCommand(MOCK_DEVICE_ID, { auto: false });
    await mockMb.sendCommand(MOCK_DEVICE_ID, { pump: false });
    jest.advanceTimersByTime(6000);
    const e = () => useFleet.getState().devices[MOCK_DEVICE_ID];
    expect(e().state?.fwAvailable).toBe('3.1.0');
    expect(useFleet.getState().stable?.version).toBe('3.1.0');
    expect(useFleet.getState().startUpdate(MOCK_DEVICE_ID)).toBe(true);
    await flush();
    jest.advanceTimersByTime(500);
    expect(e().state?.ota?.phase).toBe('download');
    jest.advanceTimersByTime(15_000);
    expect(e().state?.ota?.phase).toBe('done');
    expect(e().info?.fw).toBe('3.1.0');
    expect(e().state?.fwAvailable).toBeNull();
  });

  it('Software update is refused while the pump runs', async () => {
    const p = signedIn('household');
    jest.advanceTimersByTime(1000);
    await p;
    await mockMb.sendCommand(MOCK_DEVICE_ID, { valve: { i: 2, open: true } });
    jest.advanceTimersByTime(800);
    expect(useFleet.getState().devices[MOCK_DEVICE_ID].state?.pump).toBe(true);
    expect(useFleet.getState().startUpdate(MOCK_DEVICE_ID)).toBe(false);
    expect(useUi.getState().toast?.text).toBe('Stop the pump first');
  });

  it('adding a board over Bluetooth and removing it again', async () => {
    const p = signedIn('household');
    jest.advanceTimersByTime(1000);
    await p;
    const claim = mockMb.claimDevice('RP-A19C4E', 'MOCKCODE9C4E');
    jest.advanceTimersByTime(1000);
    await claim;
    const ids = await new Promise<string[]>((res) => mockMb.onProfile('demo', (pr) => res(Object.keys(pr!.devices).sort())));
    expect(ids).toEqual([MOCK_DEVICE_ID, 'RP-A19C4E']);
    useFleet.getState().sync(ids);
    await flush();
    expect(useFleet.getState().pheId).toBe('RP-A19C4E');
    const rm = useFleet.getState().remove('RP-A19C4E');
    jest.advanceTimersByTime(1000);
    expect(await rm).toBe(true);
    const after = await new Promise<string[]>((res) => mockMb.onProfile('demo', (pr) => res(Object.keys(pr!.devices))));
    expect(after).toEqual([MOCK_DEVICE_ID]);
  });
});

describe('PHE board (simulator)', () => {
  it('auto opens lines below reopen, fills while PHE water flows, closes at close %', async () => {
    const p = signedIn('phe');
    jest.advanceTimersByTime(1000);
    await p;
    usePhe.getState().attach(MOCK_PHE_ID);
    jest.advanceTimersByTime(1000);
    const s = () => usePhe.getState().state!;
    // Line 1 at 64 % (below 85) is open, line 2 at 97 % is closed.
    expect(s().tanks.map((t) => t.valve)).toEqual([true, false]);
    expect(s().pump).toBe(false);
    jest.advanceTimersByTime(5000);
    expect(s().supply).toBe('flowing');
    expect(s().tanks[0].rising).toBe(true);
    // ~0.9 % per 0.7 s tick: 64 → 95 in ~25 s
    jest.advanceTimersByTime(30_000);
    expect(s().tanks[0].valve).toBe(false);
    expect(usePhe.getState().events.some((e) => e.type === 'phe_full' && e.tank === 0)).toBe(true);
  });

  it('valve by hand: refused on a full line, Auto fill switch', async () => {
    const p = signedIn('phe');
    jest.advanceTimersByTime(1000);
    await p;
    usePhe.getState().attach(MOCK_PHE_ID);
    jest.advanceTimersByTime(1000);
    usePhe.getState().toggleValve(1); // 97 % ≥ close 95 %
    expect(useUi.getState().toast?.text).toBe('Kitchen line is full');
    usePhe.getState().setAuto(false);
    await flush();
    jest.advanceTimersByTime(800);
    expect(usePhe.getState().state!.tanks.every((t) => !t.valve)).toBe(true);
    usePhe.getState().toggleValve(0);
    await flush();
    jest.advanceTimersByTime(800);
    expect(usePhe.getState().state!.tanks[0].valve).toBe(true);
  });

  it('reopen / close sliders keep 5 apart and save', async () => {
    const p = signedIn('phe');
    jest.advanceTimersByTime(1000);
    await p;
    usePhe.getState().attach(MOCK_PHE_ID);
    usePhe.getState().setLow(94);
    expect(usePhe.getState().config.low).toBe(90);
    usePhe.getState().setLineName(0, '  Roof   tank ');
    jest.advanceTimersByTime(1000);
    await flush();
    const cfg = await new Promise((res) => mockMb.onPheConfig(MOCK_PHE_ID, res));
    expect(cfg).toMatchObject({ low: 90, lines: [{ name: 'Roof tank' }, expect.anything()] });
  });
});
