import { create } from 'zustand';

import type { Profile } from '@/model/types';
import { backend } from '@/services';
import type { Unsub } from '@/services/backend';

import { resetFleet, useFleet } from './fleet';

type SessionState = {
  status: 'loading' | 'out' | 'in';
  uid: string | null;
  profile: Profile | null;
  /** Every board linked to this account (one account, many boards). Details: useFleet. */
  deviceIds: string[];
  start: () => Unsub;
};

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  uid: null,
  profile: null,
  deviceIds: [],
  start: () => {
    let unProfile: Unsub | undefined;
    let unPush: Unsub | undefined;
    const unAuth = backend().onAuth((user) => {
      unProfile?.();
      unProfile = undefined;
      unPush?.();
      unPush = undefined;
      if (!user) {
        set({ status: 'out', uid: null, profile: null, deviceIds: [] });
        resetFleet();
        return;
      }
      set({ status: 'in', uid: user.uid });
      unPush = backend().registerPush(user.uid);
      unProfile = backend().onProfile(user.uid, (profile) => {
        const ids = Object.keys(profile?.devices ?? {}).sort();
        const deviceIds = same(ids, get().deviceIds) ? get().deviceIds : ids;
        set({ profile, deviceIds });
        useFleet.getState().sync(deviceIds);
      });
    });
    return () => {
      unProfile?.();
      unPush?.();
      unAuth();
    };
  },
}));
