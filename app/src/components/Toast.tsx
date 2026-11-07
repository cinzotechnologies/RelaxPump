import Animated, { Easing, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { useUi } from '@/state/ui';
import { alpha, colors, motion, s, Txt } from '@/theme';

/** Top pill toast (`.toast`), 2.2 s. */
export function Toast() {
  const toast = useUi((st) => st.toast);
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: Math.max(s(50), insets.top + s(6)),
        alignItems: 'center',
      }}
    >
      <Animated.View
        key={toast.id}
        accessibilityLiveRegion="polite"
        entering={FadeInDown.duration(350)
          .easing(Easing.bezier(...motion.ease))
          .withInitialValues({ opacity: 0, transform: [{ translateY: -s(10) }] })}
        exiting={FadeOut.duration(200)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: s(8),
          backgroundColor: alpha(colors.card, 0.96),
          borderWidth: 1,
          borderColor: alpha(colors.glow, 0.3),
          paddingVertical: s(8),
          paddingHorizontal: s(14),
          borderRadius: 999,
          boxShadow: `0 ${s(10)}px ${s(28)}px ${alpha(colors.black, 0.45)}`,
        }}
      >
        <View
          style={{
            width: s(6),
            height: s(6),
            borderRadius: s(3),
            backgroundColor: colors.glow,
            boxShadow: `0 0 ${s(6)}px ${colors.glow}`,
          }}
        />
        <Txt size={13}>{toast.text}</Txt>
      </Animated.View>
    </View>
  );
}
