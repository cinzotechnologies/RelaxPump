import { useState } from 'react';

import { Fade } from '@/components/FadeUp';
import { Press } from '@/components/Press';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { backend } from '@/services';
import { AuthError } from '@/services/backend';
import { useUi } from '@/state/ui';
import { colors, s, Txt } from '@/theme';

export function PasswordSheet() {
  const open = useUi((st) => st.sheet === 'pw');
  const close = useUi((st) => st.closeSheet);
  const openSheet = useUi((st) => st.openSheet);
  const showToast = useUi((st) => st.showToast);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Clear the form each time the sheet opens (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCur('');
      setNext('');
      setErr('');
    }
  }

  const save = async () => {
    if (!cur || next.length < 6) {
      setErr('Fill both, new one at least 6 characters');
      return;
    }
    setBusy(true);
    try {
      await backend().changePassword(cur, next);
      close();
      showToast('Password updated');
    } catch (e) {
      setErr(e instanceof AuthError ? e.message : 'Could not update. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title="Change password" gap={14}>
      <TextField
        inSheet
        value={cur}
        onChangeText={setCur}
        secureTextEntry
        placeholder="Current password"
        autoComplete="current-password"
      />
      <TextField
        inSheet
        value={next}
        onChangeText={setNext}
        secureTextEntry
        placeholder="New password (6+ characters)"
        autoComplete="new-password"
      />
      {err ? (
        <Fade>
          <Txt size={12} color={colors.dangerText}>
            {err}
          </Txt>
        </Fade>
      ) : null}
      <Press
        noScale
        onPress={() => openSheet('forgot')}
        style={{ alignSelf: 'flex-start', paddingVertical: s(2) }}
      >
        <Txt size={13} color={colors.glow}>
          Forgot it? Get a new one
        </Txt>
      </Press>
      <Txt size={12} color={colors.faint}>
        {"Your family's other phones sign out. Sign in there with the new password."}
      </Txt>
      <PrimaryButton label="Save" loading={busy} onPress={save} />
    </Sheet>
  );
}
