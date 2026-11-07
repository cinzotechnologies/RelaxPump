import { useEffect } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { s } from '@/theme';

/** `.spin` — ring with a coloured top border, 0.8 s per turn. */
export function Spinner({
  size,
  width,
  track,
  color,
}: {
  size: number;
  width: number;
  track: string;
  color: string;
}) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withRepeat(withTiming(360, { duration: 800, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(r);
  }, [r]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  const px = s(size);
  return (
    <Animated.View
      style={[
        {
          width: px,
          height: px,
          borderRadius: px / 2,
          borderWidth: s(width),
          borderColor: track,
          borderTopColor: color,
        },
        style,
      ]}
    />
  );
}
