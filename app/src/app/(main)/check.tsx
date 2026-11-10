import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { FadeUp } from '@/components/FadeUp';
import { Press } from '@/components/Press';
import { Screen } from '@/components/Screen';
import { useDevice } from '@/state/device';
import { go } from '@/state/nav';
import { useTanks } from '@/state/selectors';
import { alpha, colors, motion, s, Txt } from '@/theme';

const ease = Easing.bezier(...motion.ease);

/** "1 h 5 min" / "24 min" */
export function fullIn(min: number): string {
  const m = Math.round(min);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

/** Progress bar: grows in a loop while checking (`.run i` 2.4 s), then shows the result width. */
function CheckBar({ running, pct, delay }: { running: boolean; pct: number; delay: number }) {
  const reduce = useReducedMotion();
  const x = useSharedValue(running ? 0 : pct / 100);
  useEffect(() => {
    if (running && !reduce)
      x.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: ease }), -1, false));
    else x.value = withTiming(running ? 1 : pct / 100, { duration: 550, easing: ease });
  }, [running, pct, delay, reduce, x]);
  const st = useAnimatedStyle(() => ({ width: `${x.value * 100}%` }));
  return (
    <View
      style={{
        height: s(8),
        borderRadius: s(8),
        backgroundColor: alpha(colors.glow, 0.12),
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          { height: '100%', borderRadius: s(8), backgroundImage: 'linear-gradient(90deg, #037788, #7FE3EC)' },
          st,
        ]}
      />
    </View>
  );
}

function Tag({ slow }: { slow: boolean }) {
  return (
    <View
      style={{
        height: s(22),
        paddingHorizontal: s(9),
        borderRadius: 999,
        justifyContent: 'center',
        backgroundColor: slow ? alpha(colors.warning, 0.18) : alpha(colors.glow, 0.16),
      }}
    >
      <Txt size={10} weight={700} color={slow ? colors.warningLight : colors.glow}>
        {slow ? 'Slow' : 'Good'}
      </Txt>
    </View>
  );
}

export default function PumpCheck() {
  const insets = useSafeAreaInsets();
  const config = useDevice((d) => d.config);
  const state = useDevice((d) => d.state);
  const run = useDevice((d) => d.runPumpCheck);
  const tanks = useTanks();
  const back = useCallback(() => go('account'), []);

  // Every tank has a sensor; the controller skips tanks that are already full or not answering.
  const candidates = tanks.filter((t) => t.ok && (t.pct ?? 0) < config.high - 2);
  const check = state?.check ?? null;
  const running = !!check?.run;
  const done = !!check && !check.run && check.rows.length > 0;
  const idle = !running && !done;
  const rows = done ? check!.rows.filter((r) => !r.skipped && r.i < tanks.length) : [];
  const shown = running ? candidates : [];
  const maxLpm = Math.max(1, ...rows.map((r) => r.lpm ?? r.pctMin ?? 0));

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
          Pump check
        </Txt>
      </View>
      <Txt size={14} color={colors.muted} style={{ lineHeight: s(21) }}>
        Fills each tank for 2 minutes and measures how fast the water rises.
      </Txt>

      {idle ? (
        <FadeUp style={{ padding: s(14), gap: s(10), borderRadius: s(18), backgroundColor: colors.card }}>
          <Txt size={11} weight={600} tracking={1.5} color={colors.glow}>
            READY
          </Txt>
          <Txt size={14} style={{ lineHeight: s(20) }}>
            {candidates.length
              ? `${candidates.length} ${candidates.length === 1 ? 'tank' : 'tanks'} with a sensor will be checked. It takes about ${candidates.length * 2 + 1} minutes.`
              : 'No tank to check: all are full or their sensors give no reading.'}
          </Txt>
        </FadeUp>
      ) : null}

      {shown.map((t, k) => (
        <FadeUp
          key={t.i}
          step={k}
          style={{ padding: s(14), gap: s(10), borderRadius: s(18), backgroundColor: colors.card }}
        >
          <Txt size={15} weight={700}>
            {t.name}
          </Txt>
          <CheckBar running pct={100} delay={k * 250} />
        </FadeUp>
      ))}

      {rows.map((r, k) => {
        const t = tanks[r.i];
        const ht = config.tanks[r.i]?.heightFt;
        const rate = r.lpm !== null ? `${r.lpm} L/min` : `${r.pctMin ?? 0} %/min`;
        return (
          <FadeUp
            key={r.i}
            step={k}
            style={{ padding: s(14), gap: s(10), borderRadius: s(18), backgroundColor: colors.card }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt size={15} weight={700}>
                {t.name}
              </Txt>
              <Tag slow={r.slow} />
            </View>
            <CheckBar
              running={false}
              pct={Math.min(100, ((r.lpm ?? r.pctMin ?? 0) / maxLpm) * 100)}
              delay={0}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt size={13} color={colors.muted}>
                {ht ? `${rate} · ${ht} ft` : rate}
              </Txt>
              {r.minToFull !== null ? (
                <Txt size={13} weight={700}>{`Full in ${fullIn(r.minToFull)}`}</Txt>
              ) : null}
            </View>
            {r.slow ? (
              <Txt size={12} color={colors.warningLight} style={{ lineHeight: s(18) }}>
                Rising slowly. The pump may be too weak for this height, or a pipe is blocked.
              </Txt>
            ) : null}
          </FadeUp>
        );
      })}

      <Press
        haptic
        disabled={running || !candidates.length}
        onPress={run}
        accessibilityLabel="Start pump check"
        style={{
          height: s(52),
          borderRadius: s(26),
          alignItems: 'center',
          justifyContent: 'center',
          backgroundImage: 'linear-gradient(90deg, #A8F3F8, #7FE3EC, #2FB6C6)',
          opacity: running || !candidates.length ? 0.45 : 1,
        }}
      >
        <Txt size={15} weight={600} color={colors.base}>
          {running ? 'Checking…' : done ? 'Run again' : 'Start pump check'}
        </Txt>
      </Press>
    </Screen>
  );
}
