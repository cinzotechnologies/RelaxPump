import * as Application from 'expo-application';
import { useCallback, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { FadeUp } from '@/components/FadeUp';
import { Icon, type IconName } from '@/components/Icon';
import { Press } from '@/components/Press';
import { Screen } from '@/components/Screen';
import { initials, phoneShow } from '@/logic/format';
import { backend } from '@/services';
import { useDevice } from '@/state/device';
import { go } from '@/state/nav';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { alpha, colors, s, Txt } from '@/theme';

function Row({
  icon,
  label,
  onPress,
  danger,
  right,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
  right?: ReactNode;
}) {
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        paddingVertical: s(14),
        paddingHorizontal: s(16),
      }}
    >
      <View
        style={{
          width: s(32),
          height: s(32),
          borderRadius: s(10),
          backgroundColor: danger ? 'rgba(248,113,113,0.12)' : alpha(colors.glow, 0.1),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={16} color={danger ? colors.dangerText : colors.glow} />
      </View>
      <Txt size={14} color={danger ? colors.dangerText : colors.text} style={{ flex: 1 }}>
        {label}
      </Txt>
      {right}
      {!danger ? <Icon name="chevron" size={16} color={colors.dim} /> : null}
    </Press>
  );
}

export default function Account() {
  const insets = useSafeAreaInsets();
  const profile = useSession((st) => st.profile);
  const count = useDevice((d) => d.config.tankCount);
  const openSheet = useUi((st) => st.openSheet);
  const showToast = useUi((st) => st.showToast);
  const name = profile?.name || 'My Home';
  const back = useCallback(() => go('home'), []);
  const version = Application.nativeApplicationVersion ?? '1.0';

  return (
    <Screen
      onBack={back}
      contentStyle={{
        paddingTop: Math.max(s(52), insets.top + s(12)),
        paddingHorizontal: s(16),
        paddingBottom: Math.max(s(36), insets.bottom + s(16)),
        gap: s(18),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
        <BackButton onPress={back} />
        <Txt size={17} weight={600} accessibilityRole="header">
          Account
        </Txt>
      </View>
      <FadeUp style={{ alignItems: 'center', gap: s(6), paddingTop: s(8), paddingBottom: s(4) }}>
        <View
          style={{
            width: s(72),
            height: s(72),
            borderRadius: s(36),
            backgroundImage: 'linear-gradient(160deg, #FFFFFF, #DDF6F8)',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 0 ${s(4)}px ${alpha(colors.glow, 0.15)}`,
          }}
        >
          <Txt family="outfit" weight={600} size={24} color={colors.teal}>
            {initials(name)}
          </Txt>
        </View>
        <Txt size={18} weight={600} style={{ marginTop: s(6) }}>
          {name}
        </Txt>
        <Txt size={13} color={colors.muted}>
          {phoneShow(profile?.phone ?? '')}
        </Txt>
      </FadeUp>
      <FadeUp step={1} style={{ borderRadius: s(20), backgroundColor: colors.card, overflow: 'hidden' }}>
        <Row icon="lock" label="Change password" onPress={() => openSheet('pw')} />
        <View style={{ height: 1, marginLeft: s(60), backgroundColor: alpha(colors.glow, 0.08) }} />
        <Row
          icon="tanks"
          label="Tanks"
          onPress={() => openSheet('tanks')}
          right={
            <Txt size={13} color={colors.muted}>
              {count}
            </Txt>
          }
        />
      </FadeUp>
      <FadeUp step={2} style={{ borderRadius: s(20), backgroundColor: colors.card, overflow: 'hidden' }}>
        <Row
          icon="signOut"
          label="Sign out"
          danger
          onPress={async () => {
            await backend().signOut();
            showToast('Signed out');
          }}
        />
        <View style={{ height: 1, marginLeft: s(60), backgroundColor: alpha(colors.glow, 0.08) }} />
        <Row icon="trash" label="Delete account" danger onPress={() => openSheet('delete')} />
      </FadeUp>
      <View style={{ flex: 1 }} />
      <Txt family="outfit" weight={300} size={12} color={colors.dim} style={{ alignSelf: 'center' }}>
        {`RelaxPump ${version} · Engineered by `}
        <Txt family="outfit" weight={600} size={12} color={colors.muted}>
          CINZO
        </Txt>
      </Txt>
    </Screen>
  );
}
