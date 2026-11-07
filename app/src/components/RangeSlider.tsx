import { useState } from 'react';
import { View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { alpha, colors, s } from '@/theme';

const THUMB = 22;

/** `input[type=range]` from the design: 6 px track filled up to the value, 22 px glowing thumb. */
export function RangeSlider({
  min,
  max,
  step,
  value,
  onChange,
  fill,
  label,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  fill: string;
  label: string;
}) {
  const [w, setW] = useState(0);
  const active = useSharedValue(1);
  const thumb = s(THUMB);
  const frac = (value - min) / (max - min);

  const pick = (x: number) => {
    if (!w) return;
    const f = Math.max(0, Math.min(1, (x - thumb / 2) / (w - thumb)));
    const v = Math.round((min + f * (max - min)) / step) * step;
    if (v !== value) onChange(Math.max(min, Math.min(max, v)));
  };

  const pan = usePanGesture({
    runOnJS: true,
    minDistance: 0,
    onBegin: (e) => {
      active.value = withTiming(1.15, { duration: 200 });
      pick(e.x);
    },
    onUpdate: (e) => pick(e.x),
    onFinalize: () => {
      active.value = withTiming(1, { duration: 200 });
    },
  });
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ scale: active.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value, text: `${value}%` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + step));
          if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - step));
        }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={{ height: thumb + s(10), justifyContent: 'center' }}
      >
        <View
          style={{
            height: s(6),
            borderRadius: s(3),
            backgroundImage: `linear-gradient(90deg, ${fill} 0%, ${fill} ${Math.round(frac * 100)}%, ${alpha(colors.glow, 0.14)} ${Math.round(frac * 100)}%)`,
          }}
        />
        {w > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: frac * (w - thumb),
                width: thumb,
                height: thumb,
                borderRadius: thumb / 2,
                backgroundColor: colors.text,
                borderWidth: s(4),
                borderColor: colors.glow,
                boxShadow: `0 0 ${s(12)}px ${alpha(colors.glow, 0.6)}`,
              },
              thumbStyle,
            ]}
          />
        )}
      </View>
    </GestureDetector>
  );
}
