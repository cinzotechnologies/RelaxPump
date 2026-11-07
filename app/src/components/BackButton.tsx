import { alpha, colors, s } from '@/theme';

import { Icon } from './Icon';
import { Press } from './Press';

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityLabel="Back"
      hitSlop={6}
      style={{
        width: s(40),
        height: s(40),
        borderRadius: s(20),
        borderWidth: 1,
        borderColor: alpha(colors.glow, 0.16),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="back" color={colors.text} />
    </Press>
  );
}
