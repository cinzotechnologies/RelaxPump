import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, FadeInLeft, FadeInRight, FadeInUp, FadeIn } from 'react-native-reanimated';

import { motion, s } from '@/theme';

const ease = Easing.bezier(...motion.ease);

/** `.st .dN` — staggered fade-up on entry. `step` 0..5 = .d1–.d5 (50 ms each). */
export function FadeUp({
  step = 0,
  style,
  children,
}: {
  step?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    <Animated.View
      style={style}
      entering={FadeInUp.duration(motion.fadeUpMs)
        .delay(step * motion.staggerMs)
        .easing(ease)
        .withInitialValues({ opacity: 0, transform: [{ translateY: s(12) }] })}
    >
      {children}
    </Animated.View>
  );
}

/** `.fade` — 300 ms opacity. */
export function Fade({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return (
    <Animated.View style={style} entering={FadeIn.duration(300)}>
      {children}
    </Animated.View>
  );
}

/** `.scrF` / `.scrB` — screen enters 28 px from the right (forward) or left (back), 420 ms. */
export function screenEntering(dir: 'f' | 'b') {
  const base = dir === 'f' ? FadeInRight : FadeInLeft;
  return base
    .duration(motion.screenMs)
    .easing(ease)
    .withInitialValues({ opacity: 0, transform: [{ translateX: dir === 'f' ? s(28) : -s(28) }] });
}
