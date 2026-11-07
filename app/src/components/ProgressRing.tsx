import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { alpha, colors, s } from '@/theme';

/**
 * Home tank-row ring: `conic-gradient(color p%, rgba(127,227,236,.12) 0)` on a 36 px circle with a
 * 28 px card-coloured hole and a 6 px dot (glows while that tank is filling).
 */
export function ProgressRing({ pct, low, active }: { pct: number; low: boolean; active: boolean }) {
  const size = s(36);
  const sw = s(4);
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={alpha(colors.glow, 0.12)}
          strokeWidth={sw}
          fill="none"
        />
        {p > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={low ? colors.warning : colors.glow}
            strokeWidth={sw}
            fill="none"
            strokeDasharray={`${(c * p) / 100} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <View
        style={{
          width: s(6),
          height: s(6),
          borderRadius: s(3),
          backgroundColor: active ? colors.glow : 'transparent',
          boxShadow: active ? `0 0 ${s(6)}px ${colors.glow}` : undefined,
        }}
      />
    </View>
  );
}
