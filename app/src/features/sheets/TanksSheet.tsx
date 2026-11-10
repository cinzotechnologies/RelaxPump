import { View } from 'react-native';

import { Fade } from '@/components/FadeUp';
import { Press } from '@/components/Press';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { TANK_NAME_MAX } from '@/logic/format';
import { useDevice } from '@/state/device';
import { go } from '@/state/nav';
import { useUi } from '@/state/ui';
import { colors, s, Txt } from '@/theme';

export function TanksSheet() {
  const open = useUi((st) => st.sheet === 'tanks');
  const close = useUi((st) => st.closeSheet);
  const config = useDevice((d) => d.config);
  const setLitres = useDevice((d) => d.setLitres);
  const setTankName = useDevice((d) => d.setTankName);

  return (
    <Sheet open={open} onClose={close} title="Tank names and sizes">
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
        Tap a name to change it. Tank size in litres is optional.
      </Txt>
      <Press
        noScale
        onPress={() => {
          close();
          go('setup');
        }}
        style={{ alignSelf: 'flex-start', paddingVertical: s(2) }}
      >
        <Txt size={13} color={colors.glow}>
          Add or remove tanks: Installer setup
        </Txt>
      </Press>
      <PrimaryButton label="Done" onPress={close} />
    </Sheet>
  );
}
