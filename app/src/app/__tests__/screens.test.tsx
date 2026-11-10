// Home and Tanks render every layout from the config (no screen may assume 3 tanks): 1 and 5 tanks,
// with and without the main tank sensor.
import 'react-native-gesture-handler/jestSetup';
import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { normalizeState } from '@/model/state';
import { mockLayout } from '@/services/mockBackend';
import { useDevice } from '@/state/device';
import { useSession } from '@/state/session';

import Home from '../(main)/home';
import Tanks from '../(main)/tanks';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/services', () => ({ backend: jest.fn(), mockMode: true, inExpoGo: false }));
jest.mock('@/services/notify', () => ({ notify: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: {} }));

const show = (el: ReactElement) =>
  render(<GestureHandlerRootView style={{ flex: 1 }}>{el}</GestureHandlerRootView>);

function load(spec: string) {
  const config = mockLayout(spec);
  const n = config.tanks.length;
  const state = normalizeState({
    online: true,
    lastSeen: Date.now(),
    pump: true,
    active: 0,
    auto: true,
    tanks: config.tanks.map((_, i) => ({ pct: 20 + i * 5, valve: n > 1 && i === 0, ok: true })),
    main: config.main.enabled ? { pct: 72, ok: true } : null,
  });
  useSession.setState({
    deviceId: 'RP-3F2A9C',
    profile: { name: 'Rina', phone: '9876543210', devices: {}, createdAt: 0 },
  });
  useDevice.setState({
    config,
    state,
    online: true,
    configLoaded: true,
    info: { name: 'RelaxPump Controller', fw: '2.1.0', board: 'v1', maxTanks: 5, ownerUid: 'u' },
  });
  return config;
}

describe.each([
  ['1', 1],
  ['1,main', 1],
  ['5', 5],
  ['5,main', 5],
])('layout %s', (spec, n) => {
  it('Home lists every tank, and the main tank card when enabled', async () => {
    const cfg = load(spec);
    await show(<Home />);
    expect(screen.getByText(`TANKS · ${n}`)).toBeTruthy();
    cfg.tanks.forEach((t) => expect(screen.getAllByText(t.name!).length).toBeGreaterThan(0));
    expect(screen.queryByText('MAIN TANK') !== null).toBe(cfg.main.enabled);
    expect(screen.queryByText('PUMP SOURCE') !== null).toBe(cfg.main.enabled);
    expect(screen.queryByText(/PHE/)).toBeNull();
  });
  it('Tanks shows a card per tank; valve buttons only with 2+ tanks', async () => {
    const cfg = load(spec);
    await show(<Tanks />);
    cfg.tanks.forEach((t) => expect(screen.getAllByText(t.name!).length).toBeGreaterThan(0));
    expect(screen.getByText(`${n} of 5 · Setup`)).toBeTruthy();
    expect(screen.queryAllByText(/^(Open|Closed)$/).length).toBe(n === 1 ? 0 : n);
    expect(screen.queryByText(/One tank: the pump fills it directly/) !== null).toBe(n === 1);
    expect(screen.queryByText('MAIN TANK') !== null).toBe(cfg.main.enabled);
    expect(screen.queryByText(/PHE|Pump only/)).toBeNull();
  });
});
