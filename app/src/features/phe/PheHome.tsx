// Home → PHE tab (reference/design-v3/AppDevices.dc.html): PHE supply card with the flowing bar and
// the Auto fill switch, then one row per PHE line with its level ring and an OPEN / CLOSED valve
// button. Lines are independent: any number of valves may be open, no pump.
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { FadeUp } from '@/components/FadeUp';
import { Badge } from '@/components/ModuleBadge';
import { Press } from '@/components/Press';
import { ProgressRing } from '@/components/ProgressRing';
import { Toggle } from '@/components/Toggle';
import { litresOf } from '@/logic/format';
import { lineViews, supplyView, usePhe, type LineView } from '@/state/phe';
import { alpha, colors, s, Txt } from '@/theme';

/** Light running along the bar while PHE water flows (`.flow i` 1.6 s linear). */
function FlowBar() {
  const x = useSharedValue(-0.4);
  const w = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.linear }), -1, false);
  }, [x]);
  const run = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * w.value }] }));
  return (
    <View
      onLayout={(e) => {
        w.value = e.nativeEvent.layout.width;
      }}
      style={{
        height: s(6),
        borderRadius: s(6),
        backgroundColor: alpha(colors.glow, 0.12),
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '40%',
            borderRadius: s(6),
            backgroundImage: `linear-gradient(90deg, transparent, ${colors.glow}, transparent)`,
          },
          run,
        ]}
      />
    </View>
  );
}

function lineSub(l: LineView, flowing: boolean): { text: string; warn: boolean } {
  if (!l.ok) return { text: 'Sensor error · valve closed', warn: true };
  if (!l.valve) return { text: l.full ? 'Full · valve closed' : 'Valve closed', warn: false };
  if (l.rising || flowing) return { text: 'Filling', warn: false };
  return { text: 'Valve open · waiting for PHE water', warn: false };
}

export function PheLines() {
  const state = usePhe((p) => p.state);
  const config = usePhe((p) => p.config);
  const toggleValve = usePhe((p) => p.toggleValve);
  const setAuto = usePhe((p) => p.setAuto);
  const lines = lineViews(state, config);
  const supply = supplyView(state, lines);
  const auto = !!state?.auto;

  return (
    <>
      <FadeUp
        step={1}
        style={{
          marginTop: s(14),
          marginHorizontal: s(16),
          padding: s(14),
          gap: s(10),
          borderRadius: s(22),
          backgroundColor: colors.card,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt size={11} weight={600} tracking={1.5} color={colors.glow}>
            PHE SUPPLY
          </Txt>
          <Txt
            size={12}
            weight={600}
            color={supply.tone === 'ok' ? colors.okText : colors.muted}
            accessibilityLiveRegion="polite"
          >
            {supply.text}
          </Txt>
        </View>
        {supply.flowing ? <FlowBar /> : null}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s(10) }}
        >
          <View style={{ flex: 1, gap: s(3) }}>
            <Txt size={14} weight={700}>
              Auto fill
            </Txt>
            <Txt size={12} color={colors.muted}>
              {`Valve opens below ${config.low}% and closes at ${config.high}%`}
            </Txt>
          </View>
          <Toggle value={auto} onChange={setAuto} label="Auto fill" />
        </View>
      </FadeUp>

      <FadeUp
        step={2}
        style={{
          marginTop: s(20),
          marginBottom: s(8),
          marginHorizontal: s(16),
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Txt size={11} weight={600} tracking={1.5} color={colors.glow} accessibilityRole="header">
          {`PHE LINES · ${lines.length}`}
        </Txt>
        <Txt size={12} color={colors.muted}>
          Sensor + valve each
        </Txt>
      </FadeUp>
      <FadeUp step={3} style={{ marginTop: s(4), marginHorizontal: s(16), gap: s(8) }}>
        {lines.map((l) => {
          const sub = lineSub(l, supply.flowing);
          return (
            <View
              key={l.i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(12),
                paddingVertical: s(10),
                paddingHorizontal: s(12),
                borderRadius: s(16),
                backgroundColor: colors.card,
              }}
            >
              <ProgressRing pct={l.pct ?? 0} low={(l.pct ?? 0) < 25} active={l.valve && l.rising} />
              <View style={{ flex: 1, gap: s(3), minWidth: 0 }}>
                <Txt size={14} weight={600} numberOfLines={1}>
                  {l.name}
                  <Txt size={14} weight={500} color={colors.muted}>
                    {` · ${l.pct === null ? '--' : `${l.pct}%`}`}
                  </Txt>
                </Txt>
                <Txt size={11} color={sub.warn ? colors.dangerText : colors.muted} numberOfLines={1}>
                  {l.litres && l.pct !== null && !sub.warn
                    ? `${sub.text} · ${litresOf(l.pct, l.litres)}`
                    : sub.text}
                </Txt>
              </View>
              <Press
                haptic
                onPress={() => toggleValve(l.i)}
                accessibilityLabel={`${l.name} valve ${l.valve ? 'open' : 'closed'}`}
                accessibilityRole="switch"
                accessibilityState={{ checked: l.valve }}
              >
                <Badge label={l.valve ? 'OPEN' : 'CLOSED'} tone={l.valve ? 'open' : 'shut'} height={30} />
              </Press>
            </View>
          );
        })}
      </FadeUp>
      <FadeUp step={4} style={{ marginTop: s(10), marginHorizontal: s(16) }}>
        <Txt size={12} color={colors.muted} style={{ lineHeight: s(18) }}>
          {auto
            ? 'Valves close by themselves if the power goes off. Tap a valve to open or close it by hand.'
            : 'Auto fill is off: valves only open when you tap them. They still close at the close level.'}
        </Txt>
      </FadeUp>
    </>
  );
}
