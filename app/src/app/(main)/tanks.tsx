import { useCallback } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { Fade, FadeUp } from '@/components/FadeUp';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { RangeSlider } from '@/components/RangeSlider';
import { Screen } from '@/components/Screen';
import { Toggle } from '@/components/Toggle';
import { WaveFill } from '@/components/WaveFill';
import { litresShort } from '@/logic/format';
import { HIGH_MAX, HIGH_MIN, LOW_MAX, LOW_MIN, STEP } from '@/logic/pump';
import { useDevice } from '@/state/device';
import { go } from '@/state/nav';
import { useTanks, type TankView } from '@/state/selectors';
import { useUi } from '@/state/ui';
import { alpha, colors, s, Txt } from '@/theme';

function DashLine({ pct, color }: { pct: number; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: s(6),
        right: s(6),
        bottom: `${pct}%`,
        borderTopWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: color,
      }}
    />
  );
}

function TankCard({
  t,
  big,
  low,
  high,
  width,
}: {
  t: TankView;
  big: boolean;
  low: number;
  high: number;
  width: number;
}) {
  const toggleValve = useDevice((d) => d.toggleValve);
  const isLow = t.pct < low;
  const tint = isLow ? colors.warningLight : colors.glow;
  return (
    <View
      style={{
        width,
        alignItems: 'center',
        gap: s(8),
        padding: s(8),
        borderRadius: s(22),
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: t.active ? alpha(colors.glow, 0.55) : alpha(colors.glow, 0.06),
        boxShadow: t.active ? `0 0 ${s(20)}px ${alpha(colors.glow, 0.15)}` : undefined,
      }}
    >
      <View
        style={{
          width: '100%',
          height: s(big ? 170 : 120),
          borderRadius: s(16),
          backgroundColor: alpha(colors.glow, 0.06),
          overflow: 'hidden',
        }}
      >
        <WaveFill
          pct={t.ok ? t.pct : 0}
          style={{
            backgroundImage: isLow
              ? 'linear-gradient(180deg, #FCD34D, #D97706)'
              : 'linear-gradient(180deg, #7FE3EC, #037788)',
            boxShadow: t.active ? `0 0 ${s(20)}px ${alpha(colors.glow, 0.55)}` : undefined,
          }}
          back={{ height: s(9), top: -s(9), color: tint, opacity: 0.45 }}
          front={{ height: s(8), top: -s(7), color: tint }}
        />
        <DashLine pct={high} color={alpha(colors.text, 0.75)} />
        <DashLine pct={low} color={alpha(colors.warning, 0.85)} />
        <Txt
          size={16}
          weight={700}
          tabular
          style={{ position: 'absolute', left: 0, right: 0, top: s(10), textAlign: 'center' }}
        >
          {t.ok ? `${t.pct}%` : '--'}
        </Txt>
      </View>
      <View style={{ alignItems: 'center', gap: 1 }}>
        <Txt size={12} color={colors.muted}>
          {t.name}
        </Txt>
        {t.litres ? (
          <Txt size={11} weight={600}>
            {litresShort(t.pct, t.litres)}
          </Txt>
        ) : null}
        {!t.ok ? (
          <Txt size={11} color={colors.dangerText}>
            Sensor error
          </Txt>
        ) : null}
      </View>
      <Press
        haptic
        onPress={() => toggleValve(t.i)}
        accessibilityLabel={`Valve ${t.i + 1} ${t.valve ? 'open' : 'closed'}`}
        accessibilityRole="switch"
        accessibilityState={{ checked: t.valve }}
        style={{
          width: '100%',
          height: s(34),
          borderRadius: s(17),
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.valve ? colors.glow : alpha(colors.white, 0.07),
        }}
      >
        <Txt size={12} weight={600} color={t.valve ? colors.base : colors.valveOff}>
          {t.valve ? 'Open' : 'Closed'}
        </Txt>
      </Press>
    </View>
  );
}

export default function Tanks() {
  const insets = useSafeAreaInsets();
  const tanks = useTanks();
  const config = useDevice((d) => d.config);
  const state = useDevice((d) => d.state);
  const togglePump = useDevice((d) => d.togglePump);
  const setAuto = useDevice((d) => d.setAuto);
  const setLow = useDevice((d) => d.setLow);
  const setHigh = useDevice((d) => d.setHigh);
  const openSheet = useUi((st) => st.openSheet);
  const msg = useUi((st) => st.msg) || state?.msg || '';
  const big = tanks.length <= 3;
  const { width: winW } = useWindowDimensions();
  // flex: 0 0 calc((100% - 16px) / 3)
  const cardW = (winW - s(32) - s(16)) / 3;
  const pump = !!state?.pump;
  const back = useCallback(() => go('home'), []);

  return (
    <Screen
      scroll
      onBack={back}
      contentStyle={{
        paddingTop: Math.max(s(52), insets.top + s(12)),
        paddingHorizontal: s(16),
        paddingBottom: s(110) + insets.bottom,
        gap: s(16),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
        <BackButton onPress={back} />
        <Txt size={17} weight={600} style={{ flex: 1 }} accessibilityRole="header">
          Tanks
        </Txt>
        <Press
          onPress={() => openSheet('tanks')}
          style={{
            height: s(34),
            paddingHorizontal: s(14),
            borderRadius: s(17),
            borderWidth: 1,
            borderColor: alpha(colors.glow, 0.25),
            justifyContent: 'center',
          }}
        >
          <Txt size={13} weight={600} color={colors.glow}>
            Edit
          </Txt>
        </Press>
      </View>

      <FadeUp style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8) }}>
        {tanks.map((t) => (
          <TankCard key={t.i} t={t} big={big} low={config.low} high={config.high} width={cardW} />
        ))}
      </FadeUp>

      <FadeUp
        step={1}
        style={{
          gap: s(16),
          paddingTop: s(14),
          paddingHorizontal: s(16),
          paddingBottom: s(18),
          borderRadius: s(20),
          backgroundColor: colors.card,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt size={14} weight={600}>
            Auto
          </Txt>
          <Toggle value={!!state?.auto} onChange={setAuto} label="Auto mode" />
        </View>
        <View style={{ gap: s(10) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt size={13} color={colors.muted}>
              Start below
            </Txt>
            <Txt size={13} weight={700} tabular>{`${config.low}%`}</Txt>
          </View>
          <RangeSlider
            label="Start below"
            min={LOW_MIN}
            max={LOW_MAX}
            step={STEP}
            value={config.low}
            onChange={setLow}
            fill={colors.warning}
          />
        </View>
        <View style={{ gap: s(10) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt size={13} color={colors.muted}>
              Stop at
            </Txt>
            <Txt size={13} weight={700} tabular>{`${config.high}%`}</Txt>
          </View>
          <RangeSlider
            label="Stop at"
            min={HIGH_MIN}
            max={HIGH_MAX}
            step={STEP}
            value={config.high}
            onChange={setHigh}
            fill={colors.glow}
          />
        </View>
      </FadeUp>

      {msg ? (
        <Fade
          style={{
            flexDirection: 'row',
            gap: s(8),
            alignItems: 'center',
            paddingVertical: s(10),
            paddingHorizontal: s(14),
            borderRadius: s(14),
            backgroundColor: 'rgba(250,204,21,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(250,204,21,0.25)',
          }}
        >
          <Icon name="warning" size={16} color={colors.warningIcon} />
          <Txt size={13} color={colors.warningText} style={{ flex: 1 }} accessibilityLiveRegion="polite">
            {msg}
          </Txt>
        </Fade>
      ) : null}

      <FadeUp step={2}>
        <Press
          haptic
          onPress={togglePump}
          accessibilityLabel={pump ? 'Stop pump' : 'Start pump'}
          style={{
            height: s(50),
            borderRadius: s(25),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: s(8),
            backgroundColor: pump ? colors.glow : colors.card,
            boxShadow: pump
              ? `0 0 ${s(24)}px ${alpha(colors.glow, 0.35)}`
              : `inset 0 0 0 1px ${alpha(colors.glow, 0.25)}`,
          }}
        >
          <Icon name="power" size={18} strokeWidth={2.2} color={pump ? colors.base : colors.text} />
          <Txt size={15} weight={600} color={pump ? colors.base : colors.text}>
            {pump ? 'Stop pump' : 'Start pump'}
          </Txt>
        </Press>
      </FadeUp>
    </Screen>
  );
}
