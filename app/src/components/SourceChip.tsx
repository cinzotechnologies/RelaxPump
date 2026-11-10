import { View } from 'react-native';

import type { Source } from '@/model/types';
import { alpha, colors, s, Txt } from '@/theme';

/** "PHE" / "PUMP" pill (design v2 `.src`): teal for PHE water, amber for the pump. */
export function SourceChip({ src, label }: { src: Source; label?: string }) {
  const phe = src === 'phe';
  return (
    <View
      style={{
        height: s(22),
        paddingHorizontal: s(9),
        borderRadius: 999,
        justifyContent: 'center',
        backgroundColor: phe ? alpha(colors.glow, 0.16) : alpha(colors.warning, 0.18),
      }}
    >
      <Txt size={10} weight={700} tracking={0.4} color={phe ? colors.glow : colors.warningLight}>
        {label ?? (phe ? 'PHE' : 'PUMP')}
      </Txt>
    </View>
  );
}

/** Horizontal level bar (main tank). Optional dashed marker at `markPct` (stop-below line). */
export function LevelBar({ pct, height = 8, markPct }: { pct: number; height?: number; markPct?: number }) {
  return (
    <View
      style={{
        height: s(height),
        borderRadius: s(Math.min(height, 12)),
        backgroundColor: alpha(colors.glow, 0.12),
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          height: '100%',
          borderRadius: s(Math.min(height, 12)),
          backgroundImage: 'linear-gradient(90deg, #037788, #7FE3EC)',
        }}
      />
      {markPct !== undefined ? (
        <View
          style={{
            position: 'absolute',
            left: `${markPct}%`,
            top: 0,
            bottom: 0,
            borderLeftWidth: 1,
            borderStyle: 'dashed',
            borderColor: alpha(colors.warning, 0.7),
          }}
        />
      ) : null}
    </View>
  );
}
