import { create } from 'zustand';

import type { Profile } from '@/model/types';
import { backend } from '@/services';
import type { Unsub } from '@/services/backend';

type SessionState = {
  status: 'loading' | 'out' | 'in';
  uid: string | null;
  profile: Profile | null;
  /** First controller linked to this account (one per home). */
  deviceId: string | null;
  start: () => Unsub;
};

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  uid: null,
  profile: null,
  deviceId: null,
  start: () => {
    let unProfile: Unsub | undefined;
    let unPush: Unsub | undefined;
    const unAuth = backend().onAuth((user) => {
      unProfile?.();
      unProfile = undefined;
      unPush?.();
      unPush = undefined;
      if (!user) {
        set({ status: 'out', uid: null, profile: null, deviceId: null });
        return;
      }
      set({ status: 'in', uid: user.uid });
      unPush = backend().registerPush(user.uid);
      unProfile = backend().onProfile(user.uid, (profile) => {
        const ids = Object.keys(profile?.devices ?? {});
        set({ profile, deviceId: ids[0] ?? null });
      });
    });
    return () => {
      unProfile?.();
      unPush?.();
      unAuth();
    };
  },
}));
