// Small building blocks shared by Installer setup, Add device and My devices
// (reference/design-v2/AppSetup.dc.html, reference/design-v3/*): card, label, port tag, row,
// ghost button, − value + stepper, gradient call-to-action.
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { alpha, colors, s, Txt } from '@/theme';

export function Card({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return (
    <View style={{ padding: s(14), gap: s(gap), borderRadius: s(20), backgroundColor: colors.card }}>
      {children}
    </View>
  );
}

export function Label({ children }: { children: string }) {
  return (
    <Txt size={11} weight={600} tracking={1.5} color={colors.glow}>
      {children.toUpperCase()}
    </Txt>
  );
}

export function PortTag({ children }: { children: string }) {
  return (
    <View
      style={{
        height: s(22),
        paddingHorizontal: s(8),
        borderRadius: s(6),
        backgroundColor: colors.deepCard,
        justifyContent: 'center',
      }}
    >
      <Txt size={11} weight={700} color={colors.glow} style={{ fontFamily: 'monospace' }}>
        {children}
      </Txt>
    </View>
  );
}

export function Row({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s(10) }}>
      {typeof left === 'string' ? <Txt size={14}>{left}</Txt> : left}
      {right}
    </View>
  );
}

export function Ghost({
  label,
  onPress,
  height = 40,
  danger,
  disabled,
  grow,
}: {
  label: string;
  onPress: () => void;
  height?: number;
  danger?: boolean;
  disabled?: boolean;
  /** Fill the row (full-width buttons such as "+ Add device"). */
  grow?: boolean;
}) {
  const color = danger ? colors.dangerText : colors.glow;
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityState={disabled ? { disabled: true } : undefined}
      style={{
        height: s(height),
        paddingHorizontal: s(height > 40 ? 22 : 12),
        borderRadius: 999,
        borderWidth: 1,
        borderColor: alpha(color, danger ? 0.45 : 0.4),
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: grow ? 'stretch' : undefined,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Txt size={13} weight={600} color={color}>
        {label}
      </Txt>
    </Press>
  );
}

export function Mini({
  value,
  onDec,
  onInc,
  labels,
}: {
  value: string;
  onDec: () => void;
  onInc: () => void;
  labels: [string, string];
}) {
  const btn = (glyph: string, label: string, onPress: () => void) => (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        width: s(34),
        height: s(34),
        borderRadius: s(17),
        borderWidth: 1,
        borderColor: alpha(colors.glow, 0.4),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt size={18} weight={600} color={colors.glow}>
        {glyph}
      </Txt>
    </Press>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
      {btn('−', labels[0], onDec)}
      <Txt size={14} weight={700} tabular>
        {value}
      </Txt>
      {btn('+', labels[1], onInc)}
    </View>
  );
}

export function Cta({
  label,
  onPress,
  disabled,
  arrow,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  arrow?: boolean;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{
        flex: 1,
        height: s(52),
        borderRadius: 999,
        flexDirection: 'row',
        gap: s(8),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: 'linear-gradient(90deg, #A8F3F8, #7FE3EC, #2FB6C6)',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Txt size={15} weight={600} color={colors.base}>
        {label}
      </Txt>
      {arrow ? <Icon name="arrowRight" size={18} strokeWidth={2.2} color={colors.base} /> : null}
    </Press>
  );
}
