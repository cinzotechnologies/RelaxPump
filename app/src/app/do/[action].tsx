import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { parseVoicePath } from '@/logic/voice';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { useVoice } from '@/state/voice';

/**
 * relaxpump://do/<action> (Google Assistant, app shortcuts, Siri Shortcuts): queue the command
 * and go to Home (or the welcome screen when signed out). The root layout runs it.
 */
export default function DoAction() {
  const { action } = useLocalSearchParams<{ action: string }>();
  useEffect(() => {
    const a = parseVoicePath(`do/${action ?? ''}`);
    if (a) useVoice.getState().queue(a);
    const signedIn = useSession.getState().status === 'in';
    useUi.getState().setRoute(signedIn ? 'home' : 'welcome');
    router.replace(signedIn ? '/home' : '/');
  }, [action]);
  return null;
}
