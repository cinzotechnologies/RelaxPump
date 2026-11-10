// Home and Tanks render every layout from the config (no screen may assume 3 tanks).
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
  const state = normalizeState({
    online: true,
    lastSeen: Date.now(),
    pump: false,
    phe: true,
    src: 'phe',
    active: 0,
    auto: true,
    semi: config.semi.map((t, i) => ({ pct: t.sensor ? 20 + i * 5 : null, valve: i === 0, ok: true })),
    main: config.main.enabled ? { pct: 72, ok: true } : null,
  });
  useSession.setState({ deviceId: 'RP-3F2A9C', profile: { name: 'Rina', phone: '9876543210', devices: {}, createdAt: 0 } });
  useDevice.setState({ config, state, online: true, configLoaded: true });
  return config;
}

describe.each([
  ['1', 1],
  ['8,phe,main,ns3', 8],
])('layout %s', (spec, n) => {
  it('Home lists every tank', async () => {
    const cfg = load(spec);
    await show(<Home />);
    expect(screen.getByText(`TANKS · ${n}`)).toBeTruthy();
    cfg.semi.forEach((t) => expect(screen.getAllByText(t.name!).length).toBeGreaterThan(0));
    if (cfg.main.enabled) expect(screen.getByText('MAIN TANK')).toBeTruthy();
    if (cfg.semi.some((t) => !t.sensor)) expect(screen.getByText('Fill 10 min')).toBeTruthy();
  });
  it('Tanks shows a card per tank and the source control', async () => {
    const cfg = load(spec);
    await show(<Tanks />);
    cfg.semi.forEach((t) => expect(screen.getAllByText(t.name!).length).toBeGreaterThan(0));
    expect(screen.getByText('Pump only')).toBeTruthy();
    expect(screen.queryByText('PHE only') !== null).toBe(cfg.phe.enabled);
    // one tank: no valve button
    expect(screen.queryAllByText(/^(Open|Closed)$/).length).toBe(n === 1 ? 0 : cfg.semi.filter((t) => t.sensor).length);
    if (cfg.semi.some((t) => !t.sensor)) expect(screen.getByText(/Tanks without a sensor are not in Auto/)).toBeTruthy();
  });
});
