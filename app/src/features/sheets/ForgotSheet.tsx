import Constants from 'expo-constants';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { Fade } from '@/components/FadeUp';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { TextField, type TextFieldRef } from '@/components/TextField';
import { mockMode } from '@/services';
import { sendResetRequest } from '@/services/resetRequest';
import { useUi } from '@/state/ui';
import { alpha, colors, s, Txt } from '@/theme';

const extra = (Constants.expoConfig?.extra ?? {}) as { ENABLE_PHONE_OTP?: boolean };

/**
 * Password reset. SMS codes need Firebase Phone Auth (Blaze plan), behind ENABLE_PHONE_OTP.
 * While it is off: send name + phone to the website; an admin sends a new password on WhatsApp.
 */
export function ForgotSheet() {
  const open = useUi((st) => st.sheet === 'forgot');
  const close = useUi((st) => st.closeSheet);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const phoneRef = useRef<TextFieldRef>(null);

  // Fresh state each time the sheet opens (adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setErr('');
      setSent(false);
    }
  }

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    const r = await sendResetRequest(name, phone, { mock: mockMode });
    setBusy(false);
    if (r.ok) setSent(true);
    else setErr(r.error);
  };

  if (extra.ENABLE_PHONE_OTP) {
    return (
      <Sheet open={open} onClose={close} title="Forgot password?" gap={14}>
        <Txt size={14} color={colors.muted}>
          We send a code to your phone by SMS.
        </Txt>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={close} title="Forgot password?" gap={14}>
      {sent ? (
        <Fade>
          <View style={{ gap: s(14) }}>
            <Txt size={14} color={colors.muted}>
              We will send your new password on WhatsApp.
            </Txt>
            <PrimaryButton label="Done" onPress={close} />
          </View>
        </Fade>
      ) : (
        <>
          <Txt size={14} color={colors.muted}>
            Send us your name and number. We will send you a new password on WhatsApp.
          </Txt>
          <TextField
            inSheet
            value={name}
            onChangeText={(t) => setName(t.slice(0, 60))}
            placeholder="Your name"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
          />
          <View style={{ flexDirection: 'row', gap: s(8) }}>
            <View
              style={{
                height: s(46),
                paddingHorizontal: s(12),
                borderRadius: s(14),
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: alpha(colors.glow, 0.14),
                justifyContent: 'center',
              }}
            >
              <Txt size={15}>+91</Txt>
            </View>
            <TextField
              inSheet
              ref={phoneRef}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
              keyboardType="number-pad"
              placeholder="10-digit number"
              autoComplete="tel"
              textContentType="telephoneNumber"
              tracking={0.5}
              style={{ flex: 1, minWidth: 0 }}
              returnKeyType="send"
              onSubmitEditing={send}
            />
          </View>
          {err ? (
            <Fade>
              <Txt size={12} color={colors.dangerText}>
                {err}
              </Txt>
            </Fade>
          ) : null}
          <PrimaryButton label="Send request" loading={busy} onPress={send} />
        </>
      )}
    </Sheet>
  );
}
