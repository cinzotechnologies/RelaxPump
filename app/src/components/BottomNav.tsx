import { View } from 'react-native';
import Animated, { Easing, FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNav } from '@/state/nav';
import { useUi, type Route } from '@/state/ui';
import { alpha, colors, motion, s, Txt } from '@/theme';

import { Glow } from './Glow';
import { Icon, type IconName } from './Icon';
import { Press } from './Press';

const layout = LinearTransition.duration(350).easing(Easing.bezier(...motion.ease));

function NavItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const color = active ? colors.base : colors.footer;
  return (
    <Animated.View layout={layout}>
      <Press
        onPress={onPress}
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        style={{
          height: s(44),
          borderRadius: s(22),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: s(6),
          paddingHorizontal: active ? s(12) : s(10),
          backgroundColor: active ? colors.glow : 'transparent',
        }}
      >
        <Icon name={icon} size={19} color={color} />
        {active && label !== 'Manage tanks' ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <Txt size={13} weight={600} color={color}>
              {label}
            </Txt>
          </Animated.View>
        ) : null}
      </Press>
    </Animated.View>
  );
}

/** Floating 5-item nav: Home, Tanks, raised centre Bluetooth button, Usage, + (tanks sheet). */
export function BottomNav() {
  const route = useUi((st) => st.route);
  const sheet = useUi((st) => st.sheet);
  const openSheet = useUi((st) => st.openSheet);
  const go = useNav();
  const insets = useSafeAreaInsets();
  const bleOpen = sheet === 'ble';
  const is = (r: Route) => route === r;

  return (
    <View
      style={{
        position: 'absolute',
        left: s(20),
        right: s(20),
        bottom: Math.max(s(22), insets.bottom + s(10)),
        height: s(58),
        borderRadius: s(29),
        backgroundColor: alpha(colors.deepCard, 0.94),
        borderWidth: 1,
        borderColor: alpha(colors.glow, 0.45),
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: s(7),
        boxShadow: `0 ${s(14)}px ${s(34)}px ${alpha(colors.black, 0.5)}, 0 0 ${s(18)}px ${alpha(colors.glow, 0.12)}`,
      }}
    >
      <View
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-evenly',
        }}
      >
        <NavItem icon="home" label="Home" active={is('home')} onPress={() => go('home')} />
        <NavItem icon="tanks" label="Tanks" active={is('tanks')} onPress={() => go('tanks')} />
      </View>

      <Press
        onPress={() => openSheet('ble')}
        accessibilityLabel="Bluetooth setup"
        style={{
          width: s(58),
          height: s(58),
          marginTop: -s(30),
          borderRadius: s(29),
          borderWidth: s(4),
          borderColor: colors.base,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bleOpen ? colors.glow : colors.card,
          backgroundImage: bleOpen
            ? 'radial-gradient(120% 120% at 30% 20%, #B5F4F8 0%, #7FE3EC 35%, #1FA9B9 100%)'
            : undefined,
          boxShadow: bleOpen
            ? `0 0 0 1px ${alpha(colors.glow, 0.5)}, 0 ${s(8)}px ${s(24)}px ${alpha(colors.glow, 0.4)}`
            : `0 0 0 1px ${alpha(colors.glow, 0.45)}, 0 ${s(8)}px ${s(20)}px ${alpha(colors.black, 0.4)}`,
        }}
      >
        {bleOpen ? (
          <Glow
            style={{
              position: 'absolute',
              top: -s(13),
              left: -s(13),
              right: -s(13),
              bottom: -s(13),
              borderRadius: s(50),
              borderWidth: 1.5,
              borderColor: alpha(colors.glow, 0.45),
            }}
          />
        ) : null}
        <Icon name="bluetooth" size={24} strokeWidth={2.2} color={bleOpen ? colors.base : colors.text} />
      </Press>

      <View
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-evenly',
        }}
      >
        <NavItem icon="stats" label="Usage" active={is('usage')} onPress={() => go('usage')} />
        <NavItem icon="plus" label="Manage tanks" active={false} onPress={() => openSheet('tanks')} />
      </View>
    </View>
  );
}
