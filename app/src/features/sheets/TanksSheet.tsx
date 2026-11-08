import { View } from 'react-native';

import { Fade } from '@/components/FadeUp';
import { Press } from '@/components/Press';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { TANK_NAME_MAX } from '@/logic/format';
import { useDevice } from '@/state/device';
import { useUi } from '@/state/ui';
import { alpha, colors, s, Txt } from '@/theme';

function Stepper({ label, glyph, onPress }: { label: string; glyph: string; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        width: s(32),
        height: s(32),
        borderRadius: s(16),
        borderWidth: 1,
        borderColor: alpha(colors.glow, 0.22),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt size={16}>{glyph}</Txt>
    </Press>
  );
}

export function TanksSheet() {
  const open = useUi((st) => st.sheet === 'tanks');
  const close = useUi((st) => st.closeSheet);
  const config = useDevice((d) => d.config);
  const setCount = useDevice((d) => d.setCount);
  const setLitres = useDevice((d) => d.setLitres);
  const setTankName = useDevice((d) => d.setTankName);
  const n = config.tankCount;

  return (
    <Sheet open={open} onClose={close} title="Your tanks">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: s(12),
          paddingHorizontal: s(14),
          borderRadius: s(16),
          backgroundColor: colors.card,
        }}
      >
        <Txt size={14}>Number of tanks</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
          <Stepper label="Remove a tank" glyph="−" onPress={() => setCount(n - 1)} />
          <Txt size={16} weight={600} tabular style={{ width: s(14), textAlign: 'center' }}>
            {n}
          </Txt>
          <Stepper label="Add a tank" glyph="+" onPress={() => setCount(n + 1)} />
        </View>
      </View>
      <View style={{ gap: s(6), maxHeight: s(300) }}>
        {config.tanks.map((t, i) => (
          <Fade
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(10),
              paddingVertical: s(6),
              paddingHorizontal: s(6),
              borderRadius: s(14),
              backgroundColor: colors.card,
            }}
          >
            <TextField
              inSheet
              defaultValue={t.name ?? ''}
              onChangeText={(text) => setTankName(i, text)}
              maxLength={TANK_NAME_MAX}
              autoCapitalize="words"
              placeholder={`Tank ${i + 1}`}
              accessibilityLabel={`Name for tank ${i + 1}`}
              style={{
                flex: 1,
                height: s(38),
                borderRadius: s(11),
                backgroundColor: 'transparent',
                paddingHorizontal: s(8),
                fontSize: s(14),
              }}
            />
            <View style={{ justifyContent: 'center' }}>
              <TextField
                inSheet
                defaultValue={t.litres ? String(t.litres) : ''}
                onChangeText={(text) => setLitres(i, text)}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="Optional"
                accessibilityLabel="Tank size in litres"
                style={{
                  width: s(104),
                  height: s(38),
                  borderRadius: s(11),
                  backgroundColor: colors.deepCard,
                  paddingLeft: s(12),
                  paddingRight: s(28),
                  fontSize: s(14),
                  textAlign: 'right',
                }}
              />
              <Txt
                size={13}
                color={colors.faint}
                style={{ position: 'absolute', right: s(10) }}
                pointerEvents="none"
              >
                L
              </Txt>
            </View>
          </Fade>
        ))}
      </View>
      <Txt size={12} color={colors.faint}>
        Tap a name to change it. Tank size in litres is optional. One sensor and one valve per tank.
      </Txt>
      <PrimaryButton label="Done" onPress={close} />
    </Sheet>
  );
}
