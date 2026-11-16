// v3 screens (reference/design-v3): Home with no board / PHE only / both modules, Account → My
// devices with the Software update card, and the first step of Add device.
import 'react-native-gesture-handler/jestSetup';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { normalizeInfo, normalizeState } from '@/model/state';
import { mockLayout, mockPheConfig } from '@/services/mockBackend';
import { MOCK_STABLE } from '@/services/mockOta';
import { useDevice } from '@/state/device';
import { useFleet } from '@/state/fleet';
import { usePhe } from '@/state/phe';
import { useSession } from '@/state/session';

import Devices from '../(main)/devices';
import Home from '../(main)/home';
import AddDevice from '../add';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/services', () => ({ backend: jest.fn(), mockMode: true, inExpoGo: false }));
jest.mock('@/services/notify', () => ({ notify: jest.fn() }));
jest.mock('@/services/provisioning', () => ({
  BluetoothDenied: class extends Error {},
  provisioner: () => ({ search: () => new Promise(() => {}), disconnect: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: {} }));

const HH = 'RP-3F2A9C';
const PHE = 'RP-D4E5F6';
const show = (el: ReactElement) =>
  render(<GestureHandlerRootView style={{ flex: 1 }}>{el}</GestureHandlerRootView>);
const profile = { name: 'Rina', phone: '9876543210', devices: {}, createdAt: 0 };

function household(extra: Record<string, unknown> = {}) {
  const config = mockLayout('3,main');
  const state = normalizeState({
    online: true,
    lastSeen: Date.now(),
    pump: false,
    auto: true,
    tanks: config.tanks.map((_, i) => ({ pct: 40 + i * 10, valve: false, ok: true })),
    main: { pct: 72, ok: true },
    ...extra,
  })!;
  const info = normalizeInfo({ fw: '3.0.0', board: 'v1', maxTanks: 5, type: 'household' })!;
  useDevice.setState({ id: HH, config, state, info, online: true, configLoaded: true, events: [] });
  return { id: HH, info, state, online: true };
}

function phe(lines: number, extra: Record<string, unknown> = {}) {
  const config = mockPheConfig(lines);
  const state = normalizeState({
    online: true,
    lastSeen: Date.now(),
    auto: true,
    supply: 'flowing',
    tanks: config.lines.map((_, i) => ({
      pct: [64, 97, 40, 88, 22][i],
      valve: i !== 1 && i !== 3,
      ok: true,
      rising: true,
    })),
    ...extra,
  })!;
  const info = normalizeInfo({ fw: '3.0.0', board: 'v3', maxTanks: 5, type: 'phe', flash: 8 })!;
  usePhe.setState({ id: PHE, config, state, info, online: true, configLoaded: true, events: [] });
  return { id: PHE, info, state, online: true };
}

function fleet(
  entries: { id: string; info: unknown; state: unknown; online: boolean }[],
  tab: 'household' | 'phe' = 'household',
) {
  const ids = entries.map((e) => e.id);
  useSession.setState({ deviceIds: ids, profile });
  useFleet.setState({
    ids,
    devices: Object.fromEntries(entries.map((e) => [e.id, e])) as never,
    householdId: entries.find((e) => e.id === HH)?.id ?? null,
    pheId: entries.find((e) => e.id === PHE)?.id ?? null,
    tab,
    loaded: true,
    stable: MOCK_STABLE,
  });
}

afterEach(() => {
  useDevice.setState({ id: null, state: null });
  usePhe.setState({ id: null, state: null });
});

describe('Home', () => {
  it('no board: "Add your first device"', async () => {
    fleet([]);
    await show(<Home />);
    expect(screen.getByText('Add your first device')).toBeTruthy();
    expect(screen.queryByText(/TANKS ·/)).toBeNull();
    expect(screen.queryByText('Household')).toBeNull();
  });

  it.each([1, 2, 5])('PHE only with %i lines: supply card, Auto fill, a valve button per line', async (n) => {
    fleet([phe(n)]);
    await show(<Home />);
    expect(screen.getByText(`PHE LINES · ${n}`)).toBeTruthy();
    expect(screen.getByText('PHE SUPPLY')).toBeTruthy();
    expect(screen.getByText('Auto fill')).toBeTruthy();
    expect(screen.getAllByText(/^(OPEN|CLOSED)$/)).toHaveLength(n);
    mockPheConfig(n).lines.forEach((l) =>
      expect(screen.getAllByText(new RegExp(`^${l.name} · `)).length).toBe(1),
    );
    // No pump, no tabs, no household parts
    expect(screen.queryByLabelText('Pump')).toBeNull();
    expect(screen.queryByText('Household')).toBeNull();
    expect(screen.getByText(`Average level · ${n} ${n === 1 ? 'PHE line' : 'PHE lines'}`)).toBeTruthy();
    expect(screen.getByText('Reopen 85%')).toBeTruthy();
  });

  it('both modules: Household / PHE tabs, the saved tab shows', async () => {
    fleet([household(), phe(2)], 'household');
    await show(<Home />);
    expect(screen.getByText('Household')).toBeTruthy();
    expect(screen.getByText('PHE')).toBeTruthy();
    expect(screen.getByText('TANKS · 3')).toBeTruthy();
    expect(screen.queryByText('PHE SUPPLY')).toBeNull();
    await act(async () => fireEvent.press(screen.getByText('PHE')));
    expect(useFleet.getState().tab).toBe('phe');
    expect(screen.getByText('PHE SUPPLY')).toBeTruthy();
    expect(screen.queryByText('TANKS · 3')).toBeNull();
    expect(screen.getByText('+ Add device')).toBeTruthy();
  });

  it('PHE water status on the level card', async () => {
    fleet([
      phe(2, {
        supply: 'none',
        tanks: [
          { pct: 50, valve: true, ok: true },
          { pct: 97, valve: false, ok: true },
        ],
      }),
    ]);
    await show(<Home />);
    expect(screen.getByText('No water now')).toBeTruthy();
    expect(screen.getByText('Valve open · waiting for PHE water · 500 / 1,000 L')).toBeTruthy();
    expect(screen.getByText('Full · valve closed · 485 / 500 L')).toBeTruthy();
  });
});

describe('My devices', () => {
  it('lists every board with type, online, version and UPDATE', async () => {
    fleet([household({ fwAvailable: '3.1.0' }), phe(2)]);
    await show(<Devices />);
    expect(screen.getByText('My devices')).toBeTruthy();
    expect(screen.getByText(`Online · ${HH} · v3.0.0`)).toBeTruthy();
    expect(screen.getByText(`Online · ${PHE} · v3.0.0`)).toBeTruthy();
    expect(screen.getAllByText('UPDATE')).toHaveLength(1);
  });

  it('detail: Software update with notes; disabled while the pump runs', async () => {
    fleet([household({ fwAvailable: '3.1.0', pump: true, active: 0 })]);
    await show(<Devices />);
    await act(async () => fireEvent.press(screen.getByLabelText(/^Household RP-3F2A9C/)));
    expect(screen.getByText('Version 3.1.0')).toBeTruthy();
    MOCK_STABLE.notes.forEach((n) => expect(screen.getByText(n)).toBeTruthy());
    expect(screen.getByText('Wait — the pump is running')).toBeTruthy();
    expect(screen.getByText('The type is set at the factory and cannot be changed.')).toBeTruthy();
    expect(screen.getByText('3 semi tanks · main tank sensor')).toBeTruthy();
    expect(screen.getByText('Remove from my account')).toBeTruthy();
  });

  it('detail: progress while updating, then up to date', async () => {
    fleet([phe(2, { ota: { phase: 'download', pct: 40, to: '3.1.0' } })]);
    const r = await show(<Devices />);
    await act(async () => fireEvent.press(screen.getByLabelText(/^PHE RP-D4E5F6/)));
    expect(screen.getByText('Downloading 40%')).toBeTruthy();
    expect(screen.queryByText('Update now')).toBeNull();
    expect(screen.getByText('2 PHE lines')).toBeTruthy();
    await act(async () => fleet([phe(2)]));
    r.rerender(
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Devices />
      </GestureHandlerRootView>,
    );
    expect(screen.getByText('Up to date ✓')).toBeTruthy();
  });
});

describe('Add device', () => {
  it('starts with the Bluetooth scan (step 1 of 6)', async () => {
    fleet([]);
    await show(<AddDevice />);
    expect(screen.getByText('Add device')).toBeTruthy();
    expect(screen.getByText('1 / 6')).toBeTruthy();
    expect(screen.getByText('Looking for boards nearby…')).toBeTruthy();
    expect(screen.getByText(/Hold the BOOT button/)).toBeTruthy();
  });
});
