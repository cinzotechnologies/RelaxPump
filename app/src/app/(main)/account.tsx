import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useCallback, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { FadeUp } from '@/components/FadeUp';
import { Icon, type IconName } from '@/components/Icon';
import { Press } from '@/components/Press';
import { Screen } from '@/components/Screen';
import { initials, phoneShow } from '@/logic/format';
import { freePorts, portsOf } from '@/model/layout';
import { backend } from '@/services';
import { useDevice } from '@/state/device';
import { go } from '@/state/nav';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { alpha, colors, s, Txt } from '@/theme';

const extra = (Constants.expoConfig?.extra ?? {}) as { SUPPORT_WHATSAPP?: string; WEB_API?: string };

function Pill({ children }: { children: string }) {
  return (
    <View
      style={{
        height: s(24),
        paddingHorizontal: s(9),
        borderRadius: 999,
        backgroundColor: colors.deepCard,
        justifyContent: 'center',
      }}
    >
      <Txt size={11} weight={700} color={colors.glow}>
        {children}
      </Txt>
    </View>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: s(4) }}>
      <Txt family="outfit" size={24} weight={500} color={accent ? colors.glow : colors.text}>
        {value}
      </Txt>
      <Txt size={11} color={colors.muted}>
        {label}
      </Txt>
    </View>
  );
}

const Divider = () => <View style={{ height: 1, marginLeft: s(60), backgroundColor: alpha(colors.glow, 0.08) }} />;

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
  const config = useDevice((d) => d.config);
  const info = useDevice((d) => d.info);
  const deviceId = useSession((st) => st.deviceId);
  const ports = portsOf(info);
  const n = config.semi.length;
  const sensors = config.semi.filter((t) => t.sensor).length;
  const free = freePorts(config, ports);
  const maxPorts = Math.max(ports.sensors, ports.valves);
  const openSheet = useUi((st) => st.openSheet);
  const showToast = useUi((st) => st.showToast);
  const name = profile?.name || 'My Home';
  const back = useCallback(() => go('home'), []);
  const version = Application.nativeApplicationVersion ?? '1.0';

  return (
    <Screen
      scroll
      onBack={back}
      contentStyle={{
        paddingTop: Math.max(s(52), insets.top + s(12)),
        paddingHorizontal: s(16),
        paddingBottom: s(110) + insets.bottom,
        gap: s(14),
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
      {deviceId ? (
        <FadeUp step={1} style={{ padding: s(16), gap: s(12), borderRadius: s(22), backgroundColor: colors.card }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt size={11} weight={600} tracking={1.5} color={colors.glow}>
              MY SETUP
            </Txt>
            <Pill>{`${deviceId}${info?.board ? ` · ${info.board}` : ''}`}</Pill>
          </View>
          <View style={{ flexDirection: 'row', gap: s(8) }}>
            <Stat value={String(n)} label={n === 1 ? 'tank' : 'tanks'} />
            <Stat value={String(sensors)} label={sensors === 1 ? 'sensor' : 'sensors'} />
            <Stat value="PHE" label={config.phe.enabled ? 'on' : 'off'} accent={config.phe.enabled} />
            <Stat
              value="Main"
              label={config.main.enabled && config.main.sensor ? 'sensor' : 'none'}
              accent={config.main.enabled && config.main.sensor}
            />
          </View>
          <Txt size={12} color={colors.muted} style={{ lineHeight: s(18) }}>
            {free > 0
              ? `${free} of ${maxPorts} tank ports free. Add a tank any time.`
              : `All ${maxPorts} tank ports are in use.`}
          </Txt>
        </FadeUp>
      ) : null}
      <FadeUp step={1} style={{ borderRadius: s(20), backgroundColor: colors.card, overflow: 'hidden' }}>
        <Row icon="lock" label="Installer setup" onPress={() => go('setup')} right={<Pill>PIN</Pill>} />
        <Divider />
        <Row icon="power" label="Pump check" onPress={() => go('check')} />
        <Divider />
        <Row
          icon="plus"
          label="Add a tank"
          onPress={() => {
            if (extra.WEB_API) Linking.openURL(`${extra.WEB_API}/shop`).catch(() => {});
          }}
          right={<Pill>Buy a kit</Pill>}
        />
        <Divider />
        <Row icon="tanks" label="Tank names and sizes" onPress={() => openSheet('tanks')} />
      </FadeUp>
      <FadeUp step={2} style={{ borderRadius: s(20), backgroundColor: colors.card, overflow: 'hidden' }}>
        <Row icon="lock" label="Change password" onPress={() => openSheet('pw')} />
        <Divider />
        <Row icon="bell" label="Notifications" onPress={() => openSheet('notif')} />
        <Divider />
        <Row
          icon="help"
          label="Help & support"
          onPress={() => {
            if (extra.SUPPORT_WHATSAPP) Linking.openURL(extra.SUPPORT_WHATSAPP).catch(() => {});
          }}
        />
        <Divider />
        <Row
          icon="shield"
          label="Privacy policy"
          onPress={() => {
            if (extra.WEB_API) Linking.openURL(`${extra.WEB_API}/privacy`).catch(() => {});
          }}
        />
      </FadeUp>
      <FadeUp step={3} style={{ borderRadius: s(20), backgroundColor: colors.card, overflow: 'hidden' }}>
        <Row
          icon="signOut"
          label="Sign out"
          danger
          onPress={async () => {
            await backend().signOut();
            showToast('Signed out');
          }}
        />
        <Divider />
        <Row icon="trash" label="Delete account" danger onPress={() => openSheet('delete')} />
      </FadeUp>
      <Txt family="outfit" weight={300} size={12} color={colors.dim} style={{ alignSelf: 'center' }}>
        {`RelaxPump ${version} · Engineered by `}
        <Txt family="outfit" weight={600} size={12} color={colors.muted}>
          CINZO
        </Txt>
      </Txt>
    </Screen>
  );
}
