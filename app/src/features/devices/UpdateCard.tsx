// Software update card (reference/design-v3/AppDevice.dc.html): version + notes → Update now →
// progress (Downloading % → Checking → Installing → Restarting) → Up to date ✓. Disabled while the
// household pump runs or the board is offline. A failed update says why; the board went back to
// the old version by itself.
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Cta, Label, Row } from '@/features/setup/parts';
import { updateView } from '@/logic/ota';
import type { DeviceInfo, DeviceState, FirmwareStable } from '@/model/types';
import { alpha, colors, motion, s, Txt } from '@/theme';

const ease = Easing.bezier(...motion.ease);

function ProgressBar({ pct }: { pct: number }) {
  const p = useSharedValue(pct);
  useEffect(() => {
    p.value = withTiming(pct, { duration: 600, easing: ease });
  }, [pct, p]);
  const fill = useAnimatedStyle(() => ({ width: `${p.value}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{
        height: s(8),
        borderRadius: s(8),
        backgroundColor: alpha(colors.glow, 0.12),
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          {
            height: '100%',
            borderRadius: s(8),
            backgroundImage: `linear-gradient(90deg, ${colors.lightTeal}, ${colors.glow})`,
          },
          fill,
        ]}
      />
    </View>
  );
}

/** Progress of the four update steps: download counts 0–70 %, the rest 10 % each. */
function overall(phase: string, pct: number): number {
  if (phase === 'download') return Math.round(pct * 0.7);
  if (phase === 'verify') return 80;
  if (phase === 'install') return 90;
  return 100;
}

const sizeMb = (bytes: number) => (bytes > 0 ? `${(bytes / 1_048_576).toFixed(1)} MB` : '');

export function UpdateCard({
  info,
  state,
  stable,
  online,
  onUpdate,
}: {
  info: DeviceInfo | null;
  state: DeviceState | null;
  stable: FirmwareStable | null;
  online: boolean;
  onUpdate: () => void;
}) {
  const v = updateView(info, state, stable, online);
  const pump = !!state?.pump;
  return (
    <View style={{ padding: s(14), gap: s(12), borderRadius: s(20), backgroundColor: colors.card }}>
      <Row
        left={<Label>Software update</Label>}
        right={
          v.kind === 'uptodate' || v.kind === 'done' ? (
            <Txt size={13} weight={700} color={colors.glow}>
              Up to date ✓
            </Txt>
          ) : null
        }
      />
      {v.kind === 'uptodate' ? (
        <Txt size={12} color={colors.muted}>{`Version ${v.current} is the newest for this controller.`}</Txt>
      ) : null}
      {v.kind === 'done' ? (
        <Txt size={12} color={colors.muted}>{`Updated to ${v.current}. Everything is back on.`}</Txt>
      ) : null}
      {v.kind === 'available' || v.kind === 'running' ? (
        <View style={{ gap: s(10) }}>
          <Row
            left={
              <Txt size={16} weight={700}>
                {`Version ${v.version}`}
              </Txt>
            }
            right={
              <Txt size={12} color={colors.muted}>
                {stable?.version === v.version ? sizeMb(stable.size) : ''}
              </Txt>
            }
          />
          {v.kind === 'available'
            ? v.notes.map((n, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: s(8) }}>
                  <Txt size={13} color={colors.glow}>
                    •
                  </Txt>
                  <Txt size={13} color={colors.muted} style={{ flex: 1, lineHeight: s(18) }}>
                    {n}
                  </Txt>
                </View>
              ))
            : null}
          {v.kind === 'running' ? (
            <View style={{ gap: s(8) }}>
              <ProgressBar pct={overall(v.phase, v.pct)} />
              <Txt size={12} color={colors.muted} accessibilityLiveRegion="polite">
                {v.phase === 'install' ? 'Installing · pump off, valves closed' : v.label}
              </Txt>
            </View>
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <Cta
                label={pump ? 'Wait — the pump is running' : 'Update now'}
                onPress={onUpdate}
                disabled={!!v.blocked}
              />
            </View>
          )}
          <Txt
            size={12}
            color={v.kind === 'available' && v.blocked && !pump ? colors.warningLight : colors.muted}
            style={{ lineHeight: s(18) }}
          >
            {v.kind === 'available' && v.blocked && !pump
              ? v.blocked
              : 'About 2 minutes. The pump stops and every valve closes during the update. If anything goes wrong the board goes back to the old version by itself.'}
          </Txt>
        </View>
      ) : null}
      {v.kind === 'failed' ? (
        <View style={{ gap: s(10) }}>
          <Txt size={14} weight={700} color={colors.dangerText}>
            {`Update to ${v.version} failed`}
          </Txt>
          <Txt size={12} color={colors.muted} style={{ lineHeight: s(18) }}>
            {v.message}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}
