import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { motion } from '@/theme';

const ease = Easing.bezier(...motion.ease);
const WAVE_A = 'M0 22 Q50 4 100 22 T200 22 T300 22 T400 22 T500 22 T600 22 T700 22 T800 22 V40 H0 Z';
const WAVE_B = 'M0 22 Q50 6 100 22 T200 22 T300 22 T400 22 T500 22 T600 22 T700 22 T800 22 V40 H0 Z';

type Strip = { height: number; top: number; color: string; opacity?: number; shape?: 'a' | 'b' };

/** One wave strip, 200 % wide, sliding by half its width forever (`.wvA` 6 s, `.wvB` 3.6 s reverse). */
function WaveStrip({
  width,
  strip,
  duration,
  reverse,
}: {
  width: number;
  strip: Strip;
  duration: number;
  reverse?: boolean;
}) {
  const reduce = useReducedMotion();
  const x = useSharedValue(reverse ? -width : 0);
  useEffect(() => {
    if (!width || reduce) return;
    x.value = reverse ? -width : 0;
    x.value = withRepeat(withTiming(reverse ? 0 : -width, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(x);
  }, [width, duration, reverse, reduce, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (!width) return null;
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: 0, top: strip.top, width: width * 2, height: strip.height },
        style,
      ]}
    >
      <Svg width={width * 2} height={strip.height} viewBox="0 0 800 40" preserveAspectRatio="none">
        <Path d={strip.shape === 'b' ? WAVE_B : WAVE_A} fill={strip.color} opacity={strip.opacity ?? 1} />
      </Svg>
    </Animated.View>
  );
}

/**
 * The animated water block used on the Home level card and the Tanks gauges:
 * absolute, bottom-anchored, height = pct %, with two wave layers on top (`.fill` transition .8 s).
 */
export function WaveFill({
  pct,
  back,
  front,
  style,
}: {
  pct: number;
  back: Strip;
  front: Strip;
  style?: StyleProp<ViewStyle>;
}) {
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  const height = useSharedValue(0);
  useEffect(() => {
    if (h)
      height.value = withTiming((Math.max(0, Math.min(100, pct)) / 100) * h, { duration: 800, easing: ease });
  }, [pct, h, height]);
  const anim = useAnimatedStyle(() => ({ height: height.value }));
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      onLayout={(e) => {
        setW(e.nativeEvent.layout.width);
        setH(e.nativeEvent.layout.height);
      }}
    >
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0 }, style, anim]}>
        <WaveStrip width={w} strip={back} duration={6000} />
        <WaveStrip width={w} strip={front} duration={3600} reverse />
      </Animated.View>
    </View>
  );
}
