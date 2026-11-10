import { useCallback, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { Fade, FadeUp } from '@/components/FadeUp';
import { Press } from '@/components/Press';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { fmtNum, hm, tankName } from '@/logic/format';
import { useDevice } from '@/state/device';
import { go } from '@/state/nav';
import { alpha, colors, motion, s, Txt } from '@/theme';

type Seg = 'use' | 'pump';
const ease = Easing.bezier(...motion.ease);
const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** `.bar` — height/width transition .55 s. */
function AnimBar({ size, horizontal, style }: { size: number; horizontal?: boolean; style: object }) {
  const anim = useAnimatedStyle(() =>
    horizontal
      ? { width: withTiming(`${size}%`, { duration: 550, easing: ease }) }
      : { height: withTiming(size, { duration: 550, easing: ease }) },
  );
  return <Animated.View style={[style, anim]} />;
}

export default function Usage() {
  const insets = useSafeAreaInsets();
  const usage = useDevice((d) => d.usage);
  const tankCfg = useDevice((d) => d.config.semi);
  const hasPhe = useDevice((d) => d.config.phe.enabled);
  const tankCount = tankCfg.length;
  const [seg, setSeg] = useState<Seg>('use');
  const [picked, setSel] = useState<number | null>(null);
  const back = useCallback(() => go('home'), []);

  // Today (the last bar) is selected until the user taps another day.
  const sel = picked ?? usage.length - 1;

  const data = usage.map((u) => (seg === 'use' ? u.litres : u.pumpMin));
  const mx = Math.max(1, ...data);
  const fmt = (v: number) => (seg === 'use' ? `${fmtNum(v)} L` : `${Math.round(v)} min`);
  const tot = data.reduce((a, b) => a + b, 0);
  const per = Array.from({ length: tankCount }, (_, i) =>
    usage.reduce(
      (a, u) => a + (seg === 'use' ? (u.perTank[i]?.litres ?? 0) : (u.perTank[i]?.pumpMin ?? 0)),
      0,
    ),
  );
  const pmx = Math.max(1, ...per);
  const pheTot = usage.reduce((a, u) => a + u.pheLitres, 0);
  const pumpTot = Math.max(0, usage.reduce((a, u) => a + u.litres, 0) - pheTot);

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
        <Txt size={17} weight={600} accessibilityRole="header">
          Usage
        </Txt>
      </View>
      <FadeUp>
        <Segmented
          height={38}
          style={{ width: s(200) }}
          options={[
            { key: 'use', label: 'Water' },
            { key: 'pump', label: 'Pump' },
          ]}
          value={seg}
          onChange={setSeg}
        />
      </FadeUp>
      <FadeUp step={1}>
        <Txt size={34} weight={700} tracking={-1} tabular>
          {seg === 'use' ? `${fmtNum(tot)} L` : hm(tot)}
        </Txt>
        {seg === 'use' && hasPhe ? (
          <View style={{ flexDirection: 'row', gap: s(14), marginTop: s(6) }}>
            <Txt size={12} color={colors.warningLight}>{`Pump ${fmtNum(pumpTot)} L`}</Txt>
            <Txt size={12} color={colors.glow}>{`PHE ${fmtNum(pheTot)} L`}</Txt>
          </View>
        ) : null}
      </FadeUp>
      <FadeUp
        step={2}
        style={{
          flexDirection: 'row',
          gap: s(6),
          alignItems: 'flex-end',
          height: s(190),
          backgroundColor: colors.deepCard,
          borderRadius: s(22),
          paddingTop: s(36),
          paddingHorizontal: s(12),
          paddingBottom: s(12),
        }}
      >
        {usage.map((u, i) => {
          const h = Math.round((data[i] / mx) * s(110));
          const on = i === sel;
          const day = DAY[new Date(`${u.date}T12:00:00`).getDay()];
          return (
            <Press
              key={u.date}
              noScale
              onPress={() => setSel(i)}
              accessibilityLabel={`${u.date}: ${fmt(data[i])}`}
              style={{ flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', gap: s(6) }}
            >
              {on ? (
                <Fade
                  style={{
                    position: 'absolute',
                    bottom: h + s(26),
                    backgroundColor: colors.glow,
                    paddingVertical: s(4),
                    paddingHorizontal: s(8),
                    borderRadius: 999,
                  }}
                >
                  <Txt size={11} weight={600} color={colors.base} numberOfLines={1}>
                    {fmt(data[i])}
                  </Txt>
                </Fade>
              ) : null}
              <AnimBar
                size={h}
                style={{
                  width: '100%',
                  maxWidth: s(26),
                  borderRadius: s(8),
                  ...(on
                    ? {
                        backgroundImage: 'linear-gradient(180deg, #7FE3EC, #037788)',
                        boxShadow: `0 0 ${s(16)}px ${alpha(colors.glow, 0.45)}`,
                      }
                    : { backgroundColor: alpha(colors.glow, 0.12) }),
                }}
              />
              <Txt size={11} weight={on ? 600 : 400} color={on ? colors.glow : colors.faint}>
                {day}
              </Txt>
            </Press>
          );
        })}
      </FadeUp>
      <FadeUp step={3} style={{ gap: s(6) }}>
        {per.map((v, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(12),
              paddingVertical: s(12),
              paddingHorizontal: s(14),
              borderRadius: s(16),
              backgroundColor: colors.card,
            }}
          >
            <Txt size={13} numberOfLines={1} style={{ width: s(92) }}>
              {tankName(
                tankCfg.map((t) => t.name),
                i,
              )}
            </Txt>
            <View
              style={{
                flex: 1,
                height: s(4),
                borderRadius: s(2),
                backgroundColor: alpha(colors.glow, 0.1),
                overflow: 'hidden',
              }}
            >
              <AnimBar
                horizontal
                size={Math.round((v / pmx) * 100)}
                style={{ height: '100%', borderRadius: s(2), backgroundColor: colors.glow }}
              />
            </View>
            <Txt size={13} weight={600} style={{ width: s(52), textAlign: 'right' }}>
              {seg === 'use' ? `${fmtNum(v)} L` : `${Math.round(v)}m`}
            </Txt>
          </View>
        ))}
      </FadeUp>
    </Screen>
  );
}
