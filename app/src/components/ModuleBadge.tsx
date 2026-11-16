// v3 module marks (reference/design-v3): HOUSEHOLD / PHE badge, the module icon in its tinted
// square, small status badges (OPEN / CLOSED / UPDATE) and the online dot.
import { View } from 'react-native';

import type { ModuleType } from '@/model/types';
import { alpha, colors, s, Txt } from '@/theme';

import { Icon } from './Icon';

export const MODULE_LABEL: Record<ModuleType, string> = { household: 'Household', phe: 'PHE' };

/** Badge colours: household amber, PHE glow, open green, shut grey. */
const TONES = {
  household: { bg: alpha(colors.warning, 0.18), fg: colors.warningLight },
  phe: { bg: alpha(colors.glow, 0.16), fg: colors.glow },
  open: { bg: alpha(colors.ok, 0.16), fg: colors.okText },
  shut: { bg: alpha(colors.muted, 0.14), fg: colors.muted },
} as const;
export type BadgeTone = keyof typeof TONES;

export function Badge({ label, tone, height = 22 }: { label: string; tone: BadgeTone; height?: number }) {
  const t = TONES[tone];
  return (
    <View
      style={{
        height: s(height),
        paddingHorizontal: s(height > 22 ? 12 : 9),
        borderRadius: 999,
        backgroundColor: t.bg,
        justifyContent: 'center',
      }}
    >
      <Txt size={10} weight={700} tracking={0.5} color={t.fg} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

export function ModuleBadge({ type }: { type: ModuleType }) {
  return <Badge label={MODULE_LABEL[type].toUpperCase()} tone={type} />;
}

export function ModuleIcon({ type, size = 42 }: { type: ModuleType; size?: number }) {
  const phe = type === 'phe';
  return (
    <View
      style={{
        width: s(size),
        height: s(size),
        borderRadius: s(size / 3),
        backgroundColor: phe ? alpha(colors.glow, 0.14) : alpha(colors.warning, 0.16),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={phe ? 'pipe' : 'house'} size={22} color={phe ? colors.glow : colors.warningLight} />
    </View>
  );
}

export function OnlineDot({ online }: { online: boolean }) {
  return (
    <View
      style={{
        width: s(7),
        height: s(7),
        borderRadius: s(3.5),
        backgroundColor: online ? colors.ok : colors.dim,
        boxShadow: online ? `0 0 ${s(8)}px ${colors.ok}` : undefined,
      }}
    />
  );
}
