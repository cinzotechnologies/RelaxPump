import { useCallback } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { Fade, FadeUp } from '@/components/FadeUp';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { RangeSlider } from '@/components/RangeSlider';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { LevelBar } from '@/components/SourceChip';
import { Toggle } from '@/components/Toggle';
import { WaveFill } from '@/components/WaveFill';
import { fmtNum, litresShort } from '@/logic/format';
import { HIGH_MAX, HIGH_MIN, LOW_MAX, LOW_MIN, STEP } from '@/logic/pump';
import { effectiveMode, modeOptions } from '@/model/layout';
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
  showValve,
}: {
  t: TankView;
  big: boolean;
  low: number;
  high: number;
  width: number;
  showValve: boolean;
}) {
  const toggleValve = useDevice((d) => d.toggleValve);
  const toggleTimedFill = useDevice((d) => d.toggleTimedFill);
  const pct = t.pct ?? 0;
  const isLow = t.hasSensor && pct < low;
  const tint = isLow ? colors.warningLight : colors.glow;
  const gaugeH = s(big ? 170 : 120);
  // Tank without a sensor: dashed gauge, "No sensor", and a timer Fill button instead of the valve.
  const timerBtn = !t.hasSensor;
  const btnOn = timerBtn ? t.active : t.valve;
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
      {t.hasSensor ? (
        <View
          style={{
            width: '100%',
            height: gaugeH,
            borderRadius: s(16),
            backgroundColor: alpha(colors.glow, 0.06),
            overflow: 'hidden',
          }}
        >
          <WaveFill
            pct={t.ok ? pct : 0}
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
            {t.pct !== null ? `${t.pct}%` : '--'}
          </Txt>
        </View>
      ) : (
        <View
          style={{
            width: '100%',
            height: gaugeH,
            borderRadius: s(16),
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: alpha(colors.muted, 0.5),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="alert" size={18} color={colors.muted} />
        </View>
      )}
      <View style={{ alignItems: 'center', gap: 1 }}>
        <Txt size={12} color={colors.muted} numberOfLines={1} style={{ maxWidth: s(96) }}>
          {t.name}
        </Txt>
        {!t.hasSensor ? (
          <Txt size={11} weight={600} color={colors.muted}>
            No sensor
          </Txt>
        ) : t.litres && t.pct !== null ? (
          <Txt size={11} weight={600}>
            {litresShort(t.pct, t.litres)}
          </Txt>
        ) : null}
        {t.hasSensor && !t.ok ? (
          <Txt size={11} color={colors.dangerText}>
            Sensor error
          </Txt>
        ) : null}
      </View>
      {timerBtn || (showValve && t.hasValve) ? (
        <Press
          haptic
          onPress={() => (timerBtn ? toggleTimedFill(t.i) : toggleValve(t.i))}
          accessibilityLabel={
            timerBtn ? (btnOn ? `Stop ${t.name}` : `Fill ${t.name}`) : `Valve ${t.i + 1} ${t.valve ? 'open' : 'closed'}`
          }
          accessibilityRole={timerBtn ? 'button' : 'switch'}
          accessibilityState={timerBtn ? undefined : { checked: t.valve }}
          style={{
            width: '100%',
            height: s(34),
            borderRadius: s(17),
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: btnOn ? colors.glow : alpha(colors.white, 0.07),
          }}
        >
          <Txt size={12} weight={600} color={btnOn ? colors.base : colors.valveOff} numberOfLines={1}>
            {timerBtn ? (btnOn ? 'Stop' : `Fill ${t.fillMin} min`) : t.valve ? 'Open' : 'Closed'}
          </Txt>
        </Press>
      ) : null}
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
  const setMode = useDevice((d) => d.setMode);
  const msg = useUi((st) => st.msg) || state?.msg || '';
  const big = tanks.length <= 3;
  const { width: winW } = useWindowDimensions();
  // flex: 0 0 calc((100% - 16px) / 3)
  const cardW = (winW - s(32) - s(16)) / 3;
  const filling = !!state && (state.pump || state.phe);
  const back = useCallback(() => go('home'), []);
  const sources = modeOptions(config.phe.enabled).map((o) => ({ key: o.k, label: o.label }));
  const mode = effectiveMode(config.mode, config.phe.enabled);
  const hasMain = config.main.enabled && config.main.sensor;
  const mainPct = state?.main?.pct ?? null;
  const hasNoSensor = tanks.some((t) => !t.hasSensor);

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
        <Txt size={17} weight={600} style={{ flex: 1 }} accessibilityRole="header">
          Tanks
        </Txt>
        <Press
          onPress={() => go('setup')}
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
            Setup
          </Txt>
        </Press>
      </View>

      <FadeUp>
        <Segmented height={42} options={sources} value={mode} onChange={setMode} />
      </FadeUp>

      {hasMain ? (
        <FadeUp
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(14),
            padding: s(14),
            borderRadius: s(20),
            backgroundColor: colors.card,
          }}
        >
          <View style={{ gap: s(3), minWidth: s(86) }}>
            <Txt size={11} weight={600} tracking={1.5} color={colors.glow}>
              MAIN TANK
            </Txt>
            <Txt family="outfit" size={24} weight={500} tabular>
              {mainPct === null ? '--' : `${mainPct}%`}
            </Txt>
            {config.main.litres ? (
              <Txt size={11} color={colors.muted}>{`${fmtNum(config.main.litres)} L`}</Txt>
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <LevelBar pct={mainPct ?? 0} height={46} markPct={config.main.minPct} />
          </View>
        </FadeUp>
      ) : null}

      <FadeUp style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8) }}>
        {tanks.map((t) => (
          <TankCard
            key={t.i}
            t={t}
            big={big}
            low={config.low}
            high={config.high}
            width={cardW}
            showValve={tanks.length > 1}
          />
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
            Auto mode
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
        {hasNoSensor ? (
          <Txt size={12} color={colors.muted} style={{ lineHeight: s(18) }}>
            Tanks without a sensor are not in Auto. Tap Fill to run them on a timer.
          </Txt>
        ) : null}
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
          accessibilityLabel={filling ? 'Stop filling' : 'Start filling'}
          style={{
            height: s(50),
            borderRadius: s(25),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: s(8),
            backgroundColor: filling ? colors.glow : colors.card,
            boxShadow: filling
              ? `0 0 ${s(24)}px ${alpha(colors.glow, 0.35)}`
              : `inset 0 0 0 1px ${alpha(colors.glow, 0.25)}`,
          }}
        >
          <Icon name="power" size={18} strokeWidth={2.2} color={filling ? colors.base : colors.text} />
          <Txt size={15} weight={600} color={filling ? colors.base : colors.text}>
            {filling ? 'Stop filling' : 'Start filling'}
          </Txt>
        </Press>
      </FadeUp>
    </Screen>
  );
}
