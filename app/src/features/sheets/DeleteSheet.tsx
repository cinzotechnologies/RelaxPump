import { useState } from 'react';

import { Fade } from '@/components/FadeUp';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { backend } from '@/services';
import { AuthError } from '@/services/backend';
import { useUi } from '@/state/ui';
import { colors, Txt } from '@/theme';

/** Delete account (required by Google Play and the App Store for apps with sign-up). */
export function DeleteSheet() {
  const open = useUi((st) => st.sheet === 'delete');
  const close = useUi((st) => st.closeSheet);
  const showToast = useUi((st) => st.showToast);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPw('');
      setErr('');
    }
  }

  const remove = async () => {
    if (!pw) {
      setErr('Enter your password');
      return;
    }
    setBusy(true);
    try {
      await backend().deleteAccount(pw);
      close();
      showToast('Account deleted');
    } catch (e) {
      setErr(e instanceof AuthError ? e.message : 'Could not delete. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title="Delete account" gap={14}>
      <Txt size={13} color={colors.muted}>
        This removes your account and data, and signs out every phone in your family that uses it. Your
        controller is released so it can be set up again. This cannot be undone.
      </Txt>
      <TextField
        inSheet
        value={pw}
        onChangeText={setPw}
        secureTextEntry
        placeholder="Password"
        autoComplete="current-password"
      />
      {err ? (
        <Fade>
          <Txt size={12} color={colors.dangerText}>
            {err}
          </Txt>
        </Fade>
      ) : null}
      <PrimaryButton
        label="Delete my account"
        loading={busy}
        onPress={remove}
        style={{ backgroundColor: colors.dangerText }}
      />
    </Sheet>
  );
}
