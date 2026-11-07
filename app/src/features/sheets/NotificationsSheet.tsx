import { View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { eventRow } from '@/logic/events';
import type { DeviceEvent } from '@/model/types';
import { useDevice } from '@/state/device';
import { useUi } from '@/state/ui';
import { alpha, colors, s, Txt } from '@/theme';

function iconFor(e: DeviceEvent): { icon: IconName; color: string; bg: string } {
  switch (e.type) {
    case 'full':
      return { icon: 'check', color: colors.glow, bg: alpha(colors.glow, 0.12) };
    case 'low':
      return { icon: 'down', color: colors.warning, bg: alpha(colors.warning, 0.14) };
    case 'pump_on':
    case 'pump_off':
      return { icon: 'power', color: colors.glow, bg: alpha(colors.glow, 0.12) };
    default:
      return { icon: 'warning', color: colors.warning, bg: alpha(colors.warning, 0.14) };
  }
}

export function NotificationsSheet() {
  const open = useUi((st) => st.sheet === 'notif');
  const close = useUi((st) => st.closeSheet);
  const events = useDevice((d) => d.events);
  const low = useDevice((d) => d.config.low);

  return (
    <Sheet open={open} onClose={close} title="Notifications" gap={10}>
      {events.length === 0 ? (
        <Txt size={14} color={colors.faint}>
          Nothing yet.
        </Txt>
      ) : null}
      {events.slice(0, 6).map((e) => {
        const r = eventRow(e, low);
        const t = iconFor(e);
        return (
          <View
            key={r.id}
            style={{
              flexDirection: 'row',
              gap: s(12),
              alignItems: 'center',
              paddingVertical: s(12),
              paddingHorizontal: s(14),
              borderRadius: s(16),
              backgroundColor: colors.card,
            }}
          >
            <View
              style={{
                width: s(32),
                height: s(32),
                borderRadius: s(10),
                backgroundColor: t.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={t.icon} size={16} color={t.color} />
            </View>
            <View style={{ flex: 1, gap: s(2) }}>
              <Txt size={14}>{r.title}</Txt>
              <Txt size={12} color={colors.faint}>
                {r.sub}
              </Txt>
            </View>
          </View>
        );
      })}
      <PrimaryButton label="Done" onPress={close} style={{ marginTop: s(6) }} />
    </Sheet>
  );
}
