import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, motion, s, Txt } from '@/theme';

import { Press } from './Press';

const ease = Easing.bezier(...motion.ease);

/** Segmented control (2 or 3 options) with a sliding glow indicator (`.seg` .35 s). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  height = 40,
  style,
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.key === value));
  const count = Math.max(1, options.length);
  const x = useSharedValue(0);
  const half = (w - s(6)) / count;
  useEffect(() => {
    x.value = withTiming(idx * half, { duration: 350, easing: ease });
  }, [idx, half, x]);
  const ind = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const h = s(height);
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        { flexDirection: 'row', height: h, padding: s(3), borderRadius: h / 2, backgroundColor: colors.card },
        style,
      ]}
    >
      {w > 0 && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: s(3),
              bottom: s(3),
              left: s(3),
              width: half,
              borderRadius: (h - s(6)) / 2,
              backgroundColor: colors.glow,
            },
            ind,
          ]}
        />
      )}
      {options.map((o, i) => (
        <Press
          key={o.key}
          noScale
          accessibilityRole="tab"
          accessibilityState={{ selected: i === idx }}
          onPress={() => onChange(o.key)}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <Txt size={13} weight={600} color={i === idx ? colors.base : colors.muted}>
            {o.label}
          </Txt>
        </Press>
      ))}
    </View>
  );
}
