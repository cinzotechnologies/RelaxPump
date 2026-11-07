import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { alpha, colors, s, Txt } from '@/theme';

import { Press } from './Press';
import { Spinner } from './Spinner';

/** Solid glow pill: Sign in (50 px), sheet Done/Save (48 px). */
export function PrimaryButton({
  label,
  onPress,
  height = 48,
  loading,
  glow,
  style,
  icon,
}: {
  label: string;
  onPress: () => void;
  height?: number;
  loading?: boolean;
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
}) {
  return (
    <Press
      onPress={loading ? undefined : onPress}
      accessibilityLabel={label}
      accessibilityState={{ busy: !!loading }}
      style={[
        {
          height: s(height),
          borderRadius: s(height / 2),
          backgroundColor: colors.glow,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: s(8),
        },
        glow && { boxShadow: `0 0 ${s(24)}px ${alpha(colors.glow, 0.28)}` },
        style,
      ]}
    >
      {loading ? (
        <Spinner size={16} width={2} track={alpha(colors.base, 0.25)} color={colors.base} />
      ) : (
        <>
          {icon}
          <Txt size={15} weight={600} color={colors.base}>
            {label}
          </Txt>
        </>
      )}
    </Press>
  );
}
