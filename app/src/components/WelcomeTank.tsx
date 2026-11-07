import { useEffect } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);
const ALine = Animated.createAnimatedComponent(Line);

/** Wave path from the design, shifted horizontally by `o` (svg units). */
function waveD(y: number, amp: number, o: number) {
  'worklet';
  let d = `M${-40 + o} ${y} Q${-10 + o} ${y - amp} ${20 + o} ${y}`;
  for (let x = 80; x <= 380; x += 60) d += ` T${x + o} ${y}`;
  return `${d} V270 H${-40 + o} Z`;
}

function useLoop(duration: number, easing = Easing.linear, delay = 0) {
  const reduce = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing }), -1, false));
    return () => cancelAnimation(v);
  }, [duration, easing, delay, reduce, v]);
  return v;
}

function Bubble({ cx, cy, r, delay }: { cx: number; cy: number; r: number; delay: number }) {
  const t = useLoop(2600, Easing.in(Easing.ease), delay);
  const props = useAnimatedProps(() => ({
    cy: cy - 60 * t.value,
    opacity: interpolate(t.value, [0, 0.2, 1], [0, 1, 0]),
  }));
  return <ACircle cx={cx} r={r} fill="#FFFFFF" fillOpacity={0.6} animatedProps={props} />;
}

function Wave({
  t,
  y,
  amp,
  from,
  to,
  fill,
  fillOpacity,
}: {
  t: SharedValue<number>;
  y: number;
  amp: number;
  from: number;
  to: number;
  fill: string;
  fillOpacity?: number;
}) {
  const props = useAnimatedProps(() => ({ d: waveD(y, amp, from + (to - from) * t.value) }));
  return <APath animatedProps={props} fill={fill} fillOpacity={fillOpacity} />;
}

/** The floating tank on the Welcome screen (220 px, viewBox "10 0 300 300"). */
export function WelcomeTank({ size }: { size: number }) {
  const reduce = useReducedMotion();
  const wv = useLoop(3200);
  const wv2 = useLoop(5000);
  const stream = useLoop(500);
  const float = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    const half = { duration: 2000, easing: Easing.inOut(Easing.ease) };
    float.value = withRepeat(withSequence(withTiming(-5, half), withTiming(0, half)), -1, false);
    return () => cancelAnimation(float);
  }, [reduce, float]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));
  const streamProps = useAnimatedProps(() => ({ strokeDashoffset: -36 * stream.value }));

  return (
    <Animated.View
      style={[{ width: size, height: size }, floatStyle]}
      accessibilityLabel="Water tank filling"
      accessibilityRole="image"
    >
      <Svg width={size} height={size} viewBox="10 0 300 300">
        <Defs>
          <ClipPath id="tankClip">
            <Rect x="90" y="64" width="140" height="196" rx="26" />
          </ClipPath>
          <LinearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#8CEBF2" />
            <Stop offset="1" stopColor="#03606E" />
          </LinearGradient>
          <LinearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#000000" stopOpacity={0.45} />
            <Stop offset="0.28" stopColor="#FFFFFF" stopOpacity={0.16} />
            <Stop offset="0.36" stopColor="#FFFFFF" stopOpacity={0.04} />
            <Stop offset="0.8" stopColor="#000000" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.5} />
          </LinearGradient>
          <LinearGradient id="lid" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#0B3B44" />
            <Stop offset="0.4" stopColor="#2A7883" />
            <Stop offset="1" stopColor="#062A31" />
          </LinearGradient>
          <LinearGradient id="pipe" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#3C8D98" />
            <Stop offset="1" stopColor="#0B3B44" />
          </LinearGradient>
          <RadialGradient id="floor" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#7FE3EC" stopOpacity={0.4} />
            <Stop offset="1" stopColor="#7FE3EC" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="160" cy="276" rx="120" ry="16" fill="url(#floor)" />
        <Path
          d="M300 30 H246 a14 14 0 0 0 -14 14 V56"
          fill="none"
          stroke="url(#pipe)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <Rect
          x="268"
          y="21"
          width="14"
          height="18"
          rx="3"
          fill="#0E4650"
          stroke="#7FE3EC"
          strokeOpacity={0.4}
        />
        <ALine
          x1="232"
          y1="64"
          x2="232"
          y2="158"
          stroke="#8CEBF2"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="10 8"
          opacity={0.85}
          clipPath="url(#tankClip)"
          animatedProps={streamProps}
        />
        <Rect x="90" y="64" width="140" height="196" rx="26" fill="#06303A" fillOpacity={0.55} />
        <G clipPath="url(#tankClip)">
          <Wave t={wv2} y={156} amp={8} from={-120} to={0} fill="#7FE3EC" fillOpacity={0.35} />
          <Wave t={wv} y={160} amp={9} from={0} to={-120} fill="url(#water)" />
          <Bubble cx={132} cy={240} r={3} delay={0} />
          <Bubble cx={176} cy={246} r={2.2} delay={900} />
          <Bubble cx={152} cy={242} r={1.8} delay={1700} />
          <Path
            d="M90 102 Q160 112 230 102 M90 142 Q160 152 230 142 M90 182 Q160 192 230 182 M90 222 Q160 232 230 222"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity={0.14}
            strokeWidth="2"
          />
          <Rect x="90" y="64" width="140" height="196" fill="url(#shade)" />
        </G>
        <Rect
          x="90"
          y="64"
          width="140"
          height="196"
          rx="26"
          fill="none"
          stroke="#7FE3EC"
          strokeOpacity={0.45}
          strokeWidth="1.5"
        />
        <Ellipse cx="160" cy="66" rx="70" ry="13" fill="url(#lid)" stroke="#7FE3EC" strokeOpacity={0.35} />
        <Ellipse cx="160" cy="58" rx="22" ry="6" fill="#2A7883" stroke="#7FE3EC" strokeOpacity={0.4} />
        <Rect x="138" y="52" width="44" height="8" fill="#1A5862" />
        <Ellipse cx="160" cy="52" rx="22" ry="6" fill="#3C8D98" />
      </Svg>
    </Animated.View>
  );
}
