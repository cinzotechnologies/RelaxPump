import Constants from 'expo-constants';
import { Linking } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { useUi } from '@/state/ui';
import { colors, Txt } from '@/theme';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  ENABLE_PHONE_OTP?: boolean;
  SUPPORT_WHATSAPP?: string;
};

/**
 * Password reset. SMS codes need Firebase Phone Auth (Blaze plan), behind ENABLE_PHONE_OTP.
 * While it is off, users contact support, who reset the password with the admin script.
 */
export function ForgotSheet() {
  const open = useUi((st) => st.sheet === 'forgot');
  const close = useUi((st) => st.closeSheet);
  return (
    <Sheet open={open} onClose={close} title="Forgot password?" gap={14}>
      <Txt size={14} color={colors.muted}>
        {extra.ENABLE_PHONE_OTP
          ? 'We send a code to your phone by SMS.'
          : 'Contact support and we will reset it for you.'}
      </Txt>
      <PrimaryButton
        label="Contact support"
        onPress={() => {
          if (extra.SUPPORT_WHATSAPP) Linking.openURL(extra.SUPPORT_WHATSAPP).catch(() => {});
          close();
        }}
      />
    </Sheet>
  );
}
