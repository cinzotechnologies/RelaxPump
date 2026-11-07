import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FadeUp } from '@/components/FadeUp';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { Screen } from '@/components/Screen';
import { WelcomeTank } from '@/components/WelcomeTank';
import { go } from '@/state/nav';
import { useSession } from '@/state/session';
import { alpha, colors, s, Txt } from '@/theme';

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const signedIn = useSession((st) => st.status === 'in');
  return (
    <Screen
      style={{ backgroundImage: 'radial-gradient(110% 60% at 50% 36%, #044753 0%, #021A20 72%)' }}
      contentStyle={{
        alignItems: 'center',
        paddingTop: Math.max(s(64), insets.top + s(20)),
        paddingHorizontal: s(24),
        paddingBottom: Math.max(s(36), insets.bottom + s(16)),
      }}
    >
      <FadeUp step={1} style={{ marginTop: s(96) }}>
        <WelcomeTank size={s(220)} />
      </FadeUp>
      <FadeUp step={2} style={{ marginTop: s(22) }}>
        <Txt
          family="outfit"
          size={34}
          tracking={-0.8}
          style={{ textAlign: 'center', lineHeight: s(37) }}
          accessibilityRole="header"
        >
          <Txt family="outfit" weight={300} size={34} color={colors.glow}>
            Relax
          </Txt>
          <Txt family="outfit" weight={600} size={34} color={colors.white}>
            Pump
          </Txt>
        </Txt>
      </FadeUp>
      <FadeUp step={3} style={{ marginTop: s(10) }}>
        <Txt size={14} color={colors.muted} style={{ textAlign: 'center' }}>
          Tanks that fill themselves.
        </Txt>
      </FadeUp>
      <View style={{ flex: 1 }} />
      <FadeUp step={4} style={{ alignSelf: 'stretch' }}>
        <Press
          onPress={() => go(signedIn ? 'home' : 'auth')}
          accessibilityLabel="Get started"
          style={{
            height: s(56),
            borderRadius: s(28),
            borderWidth: 1,
            borderColor: alpha(colors.white, 0.35),
            backgroundImage: 'linear-gradient(135deg, #A8F3F8 0%, #7FE3EC 45%, #2FB6C6 100%)',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: s(24),
            paddingRight: s(6),
            boxShadow: `0 ${s(10)}px ${s(30)}px ${alpha(colors.glow, 0.28)}, inset 0 1px 0 ${alpha(colors.white, 0.5)}`,
          }}
        >
          <Txt family="outfit" weight={500} size={17} tracking={-0.2} color={colors.base}>
            Get started
          </Txt>
          <View
            style={{
              width: s(44),
              height: s(44),
              borderRadius: s(22),
              backgroundColor: colors.base,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="arrowRight" size={18} strokeWidth={2.2} color={colors.glow} />
          </View>
        </Press>
      </FadeUp>
      <FadeUp step={5} style={{ marginTop: s(20), flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
        <View
          style={{
            width: s(22),
            height: 1,
            backgroundImage: `linear-gradient(90deg, transparent, ${alpha(colors.glow, 0.5)})`,
          }}
        />
        <Txt family="outfit" weight={300} size={13} color={colors.footer}>
          Engineered by{' '}
          <Txt family="outfit" weight={600} size={13} tracking={1.5} color={colors.white}>
            CINZO
          </Txt>
        </Txt>
        <View
          style={{
            width: s(22),
            height: 1,
            backgroundImage: `linear-gradient(90deg, ${alpha(colors.glow, 0.5)}, transparent)`,
          }}
        />
      </FadeUp>
    </Screen>
  );
}
