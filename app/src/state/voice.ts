import { create } from 'zustand';

import type { VoiceAction } from '@/logic/voice';

/** A voice / shortcut command waits here until the user is signed in and the controller is online. */
type VoiceState = {
  pending: VoiceAction | null;
  at: number;
  queue: (a: VoiceAction) => void;
  clear: () => void;
};

/** Older commands are dropped, so signing in later never starts the pump by surprise. */
export const VOICE_MAX_AGE_MS = 2 * 60_000;

export const useVoice = create<VoiceState>((set) => ({
  pending: null,
  at: 0,
  queue: (a) => set({ pending: a, at: Date.now() }),
  clear: () => set({ pending: null, at: 0 }),
}));
