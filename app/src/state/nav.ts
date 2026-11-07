import { router } from 'expo-router';
import { useCallback } from 'react';

import { useUi, type Route } from './ui';

const PATH: Record<Route, '/' | '/auth' | '/home' | '/tanks' | '/usage' | '/account'> = {
  welcome: '/',
  auth: '/auth',
  home: '/home',
  tanks: '/tanks',
  usage: '/usage',
  account: '/account',
};

/** Navigate like the design: one screen at a time, slide direction from screen rank. */
export function go(r: Route) {
  if (useUi.getState().route === r) return;
  useUi.getState().setRoute(r);
  router.replace(PATH[r]);
}

export function useNav() {
  return useCallback((r: Route) => go(r), []);
}
