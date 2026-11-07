import { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { alpha, colors, motion, s } from '@/theme';

import { Press } from './Press';

const spring = Easing.bezier(...motion.spring);

/** Auto toggle: 46×28 track, 22 px knob, springy `.knob` (cubic-bezier(.34,1.56,.64,1) .3 s). */
export function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const x = useSharedValue(value ? s(21) : s(3));
  useEffect(() => {
    x.value = withTiming(value ? s(21) : s(3), { duration: 300, easing: spring });
  }, [value, x]);
  const knob = useAnimatedStyle(() => ({ left: x.value }));
  return (
    <Press
      haptic
      noScale
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      style={{
        width: s(46),
        height: s(28),
        borderRadius: s(14),
        backgroundColor: value ? colors.glow : alpha(colors.white, 0.14),
        boxShadow: value ? `0 0 ${s(14)}px ${alpha(colors.glow, 0.4)}` : undefined,
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: s(3),
            width: s(22),
            height: s(22),
            borderRadius: s(11),
            backgroundColor: value ? colors.base : colors.white,
          },
          knob,
        ]}
      />
    </Press>
  );
}
