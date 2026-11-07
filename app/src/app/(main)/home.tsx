import { useCallback } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FadeUp } from '@/components/FadeUp';
import { Glow } from '@/components/Glow';
import { Icon, type IconName } from '@/components/Icon';
import { LevelRingLogo } from '@/components/LevelRingLogo';
import { Press } from '@/components/Press';
import { ProgressRing } from '@/components/ProgressRing';
import { Screen } from '@/components/Screen';
import { WaveFill } from '@/components/WaveFill';
import { initials, litresOf } from '@/logic/format';
import { useDevice } from '@/state/device';
import { go } from '@/state/nav';
import { isOnline, useTanks } from '@/state/selectors';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { alpha, colors, s, Txt } from '@/theme';

function ActionTile({
  icon,
  label,
  on,
  onPress,
}: {
  icon: IconName;
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  const fg = on ? colors.base : colors.text;
  return (
    <Press
      haptic={label === 'Pump' || label === 'Auto'}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={label === 'Pump' || label === 'Auto' ? { checked: on } : undefined}
      style={{
        flex: 1,
        height: s(70),
        borderRadius: s(20),
        alignItems: 'center',
        justifyContent: 'center',
        gap: s(7),
        borderWidth: 1,
        borderColor: on ? 'transparent' : alpha(colors.glow, 0.45),
        backgroundColor: on ? colors.glow : colors.card,
        boxShadow: on ? `0 0 ${s(18)}px ${alpha(colors.glow, 0.3)}` : undefined,
      }}
    >
      <Icon name={icon} size={20} strokeWidth={1.9} color={fg} />
      <Txt size={11} weight={600} color={fg}>
        {label}
      </Txt>
    </Press>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <View
      style={{
        paddingVertical: s(3),
        paddingHorizontal: s(8),
        borderRadius: 999,
        backgroundColor: alpha(colors.base, 0.45),
      }}
    >
      <Txt size={10} weight={600} color={alpha(colors.text, 0.85)}>
        {children}
      </Txt>
    </View>
  );
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const profile = useSession((st) => st.profile);
  const deviceId = useSession((st) => st.deviceId);
  const state = useDevice((d) => d.state);
  const config = useDevice((d) => d.config);
  const events = useDevice((d) => d.events);
  const seenTs = useDevice((d) => d.seenTs);
  const togglePump = useDevice((d) => d.togglePump);
  const setAuto = useDevice((d) => d.setAuto);
  const openSheet = useUi((st) => st.openSheet);
  const tanks = useTanks();
  const name = profile?.name || 'My Home';
  const hasNotif = (events[0]?.ts ?? 0) > seenTs;

  const n = tanks.length;
  const avg = n ? Math.round(tanks.reduce((a, t) => a + t.pct, 0) / n) : 0;
  const active = tanks.find((t) => t.active);
  const online = isOnline(state);
  const status = !deviceId
    ? 'No controller'
    : !online
      ? 'Offline'
      : active
        ? `Filling ${active.name}`
        : state?.auto
          ? 'Auto'
          : 'Idle';

  const back = useCallback(() => go('welcome'), []);

  return (
    <Screen scroll onBack={back} contentStyle={{ paddingBottom: s(110) + insets.bottom }}>
      {/* Teal header */}
      <View
        style={{
          backgroundImage: 'radial-gradient(140% 100% at 15% 0%, #0A9AAE 0%, #037788 42%, #035360 100%)',
          paddingTop: Math.max(s(52), insets.top + s(12)),
          paddingHorizontal: s(20),
          paddingBottom: s(96),
          borderBottomLeftRadius: s(30),
          borderBottomRightRadius: s(30),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
          <Press
            onPress={() => go('welcome')}
            accessibilityLabel="RelaxPump home"
            style={{
              width: s(48),
              height: s(48),
              borderRadius: s(16),
              backgroundImage: 'linear-gradient(160deg, #FFFFFF 0%, #E3F7F9 100%)',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 ${s(8)}px ${s(20)}px ${alpha(colors.base, 0.35)}, inset 0 -2px 0 ${alpha(colors.teal, 0.12)}`,
            }}
          >
            <LevelRingLogo size={s(40)} />
          </Press>
          <View>
            <Txt size={11} color={alpha(colors.white, 0.75)}>
              Welcome back
            </Txt>
            <Txt size={15} weight={600} color={colors.white} numberOfLines={1}>
              {name}
            </Txt>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <Press
            onPress={() => openSheet('notif')}
            accessibilityLabel={hasNotif ? 'Notifications, unread' : 'Notifications'}
            style={{
              width: s(42),
              height: s(42),
              borderRadius: s(21),
              borderWidth: 1,
              borderColor: alpha(colors.white, 0.22),
              backgroundColor: alpha(colors.white, 0.12),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="bell" size={19} strokeWidth={1.9} color={colors.white} />
            {hasNotif ? (
              <View
                style={{
                  position: 'absolute',
                  top: s(9) - 1,
                  right: s(10) - 1,
                  width: s(8),
                  height: s(8),
                  borderRadius: s(4),
                  backgroundColor: colors.notifDot,
                  boxShadow: `0 0 0 2px ${colors.lightTeal}`,
                }}
              />
            ) : null}
          </Press>
          <Press
            onPress={() => go('account')}
            accessibilityLabel="Account"
            style={{
              width: s(42),
              height: s(42),
              borderRadius: s(21),
              padding: s(2),
              // conic-gradient(from 200deg, #FFF, #7FE3EC, #FFF) ≈ diagonal white→glow→white ring
              backgroundImage: 'linear-gradient(200deg, #FFFFFF 0%, #7FE3EC 50%, #FFFFFF 100%)',
              boxShadow: `0 ${s(6)}px ${s(16)}px ${alpha(colors.base, 0.3)}`,
            }}
          >
            <View
              style={{
                flex: 1,
                borderRadius: s(19),
                backgroundImage: 'linear-gradient(160deg, #FFFFFF 0%, #DDF6F8 100%)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt family="outfit" weight={600} size={14} tracking={0.3} color={colors.teal}>
                {initials(name)}
              </Txt>
            </View>
          </Press>
        </View>
      </View>

      {/* Level card */}
      <FadeUp
        style={{
          marginTop: -s(78),
          marginHorizontal: s(16),
          height: s(200),
          borderRadius: s(26),
          borderWidth: 1,
          borderColor: alpha(colors.glow, 0.12),
          backgroundColor: colors.deepCard,
          padding: s(18),
          overflow: 'hidden',
          boxShadow: `0 ${s(18)}px ${s(36)}px ${alpha(colors.black, 0.4)}`,
        }}
      >
        <WaveFill
          pct={avg}
          style={{ backgroundImage: 'linear-gradient(180deg, #34646B 0%, #044C57 100%)' }}
          back={{ height: s(18), top: -s(17), color: colors.waveBack }}
          front={{ height: s(14), top: -s(13), color: colors.waveFront, shape: 'b' }}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt size={12} color={colors.muted}>
            {n} {n === 1 ? 'tank' : 'tanks'} · average
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
            <Glow
              style={{
                width: s(6),
                height: s(6),
                borderRadius: s(3),
                backgroundColor: online ? colors.glow : colors.dangerText,
                boxShadow: `0 0 ${s(6)}px ${online ? colors.glow : colors.dangerText}`,
              }}
            />
            <Txt size={12} color={online ? colors.glow : colors.dangerText}>
              {status}
            </Txt>
          </View>
        </View>
        <Txt size={40} weight={700} tracking={-1.2} tabular style={{ lineHeight: s(44), marginTop: s(4) }}>
          {deviceId ? `${avg}%` : '--'}
        </Txt>
        <View style={{ position: 'absolute', left: s(18), bottom: s(14), flexDirection: 'row', gap: s(5) }}>
          <Chip>{`Start ${config.low}%`}</Chip>
          <Chip>{`Stop ${config.high}%`}</Chip>
        </View>
      </FadeUp>

      {/* Actions */}
      <FadeUp step={1} style={{ flexDirection: 'row', gap: s(8), marginTop: s(12), marginHorizontal: s(16) }}>
        <ActionTile icon="power" label="Pump" on={!!state?.pump} onPress={togglePump} />
        <ActionTile icon="auto" label="Auto" on={!!state?.auto} onPress={() => setAuto(!state?.auto)} />
        <ActionTile icon="tanks" label="Tanks" on={false} onPress={() => go('tanks')} />
        <ActionTile icon="stats" label="Usage" on={false} onPress={() => go('usage')} />
      </FadeUp>

      {/* Tank list */}
      <FadeUp
        step={2}
        style={{
          marginTop: s(20),
          marginHorizontal: s(16),
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Txt size={15} weight={600} accessibilityRole="header">
          Tanks
        </Txt>
        <Press noScale onPress={() => go('tanks')} style={{ paddingVertical: s(8) }}>
          <Txt size={13} color={colors.glow}>
            See all
          </Txt>
        </Press>
      </FadeUp>
      <FadeUp step={3} style={{ marginTop: s(4), marginHorizontal: s(16), gap: s(6) }}>
        {tanks.map((t) => (
          <Press
            key={t.i}
            onPress={() => go('tanks')}
            accessibilityLabel={`${t.name}, ${t.pct} percent`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(12),
              paddingVertical: s(10),
              paddingHorizontal: s(12),
              borderRadius: s(18),
              borderWidth: 1,
              borderColor: alpha(colors.glow, 0.08),
              backgroundColor: colors.card,
            }}
          >
            <ProgressRing pct={t.pct} low={t.pct < config.low} active={t.active} />
            <View style={{ flex: 1, gap: s(2) }}>
              <Txt size={14}>{t.name}</Txt>
              {t.litres ? (
                <Txt size={11} color={colors.faint}>
                  {litresOf(t.pct, t.litres)}
                </Txt>
              ) : null}
            </View>
            <Txt size={15} weight={600} tabular>
              {t.ok ? `${t.pct}%` : '--'}
            </Txt>
          </Press>
        ))}
      </FadeUp>
    </Screen>
  );
}
