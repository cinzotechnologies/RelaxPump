// Account → My devices (reference/design-v3/AppDevice.dc.html): every board on the account with its
// type badge, online state, firmware and an UPDATE badge; tap one for its details, the Software
// update card, Installer setup and Remove from my account.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { FadeUp } from '@/components/FadeUp';
import { Badge, ModuleBadge, ModuleIcon, MODULE_LABEL, OnlineDot } from '@/components/ModuleBadge';
import { Press } from '@/components/Press';
import { Screen } from '@/components/Screen';
import { UpdateCard } from '@/features/devices/UpdateCard';
import { Card, Ghost, Label, Row } from '@/features/setup/parts';
import { signalLabel } from '@/logic/format';
import { hasUpdate } from '@/logic/ota';
import { useFleet, type FleetEntry } from '@/state/fleet';
import { go } from '@/state/nav';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { colors, s, Txt } from '@/theme';

/** "3 semi tanks · main tank sensor" / "2 PHE lines" from what the board reports. */
export function layoutText(e: FleetEntry): string {
  const n = e.state?.tanks.length ?? 0;
  if (!n) return 'Not set up yet';
  if (e.info?.type === 'phe') return `${n} ${n === 1 ? 'PHE line' : 'PHE lines'}`;
  return `${n} ${n === 1 ? 'semi tank' : 'semi tanks'}${e.state?.main ? ' · main tank sensor' : ''}`;
}

function DeviceRow({ e, onPress }: { e: FleetEntry; onPress: () => void }) {
  const type = e.info?.type ?? 'household';
  const upd = hasUpdate(e.state, e.info);
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={`${MODULE_LABEL[type]} ${e.id}, ${e.online ? 'online' : 'offline'}${upd ? ', update available' : ''}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        padding: s(14),
        borderRadius: s(18),
        borderWidth: 1,
        borderColor: 'rgba(127,227,236,0.22)',
        backgroundColor: colors.card,
      }}
    >
      <ModuleIcon type={type} />
      <View style={{ flex: 1, gap: s(4) }}>
        <Txt size={15} weight={700}>
          {MODULE_LABEL[type]}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
          <OnlineDot online={e.online} />
          <Txt size={12} color={colors.muted} numberOfLines={1}>
            {`${e.online ? 'Online' : 'Offline'} · ${e.id}${e.info?.fw ? ` · v${e.info.fw}` : ''}`}
          </Txt>
        </View>
      </View>
      {upd ? <Badge label="UPDATE" tone="open" /> : null}
    </Press>
  );
}

function Detail({ e, onBack }: { e: FleetEntry; onBack: () => void }) {
  const stable = useFleet((f) => f.stable);
  const startUpdate = useFleet((f) => f.startUpdate);
  const select = useFleet((f) => f.select);
  const remove = useFleet((f) => f.remove);
  const setSetupFor = useUi((st) => st.setSetupFor);
  const showToast = useUi((st) => st.showToast);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const type = e.info?.type ?? 'household';
  const wifi = e.state?.ssid ? `${e.state.ssid} · ${signalLabel(e.state.rssi).toLowerCase()}` : '—';

  const onRemove = async () => {
    if (!confirm) {
      setConfirm(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setConfirm(false), 4000);
      return;
    }
    setBusy(true);
    const ok = await remove(e.id);
    setBusy(false);
    if (ok) {
      showToast(`${e.id} removed`);
      onBack();
    }
  };

  return (
    <>
      <FadeUp step={1}>
        <Card>
          <Label>Device</Label>
          <Row left={<Txt color={colors.muted}>Type</Txt>} right={<ModuleBadge type={type} />} />
          <Row left={<Txt color={colors.muted}>ID</Txt>} right={<Txt weight={700}>{e.id}</Txt>} />
          <Row
            left={<Txt color={colors.muted}>Status</Txt>}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
                <OnlineDot online={e.online} />
                <Txt weight={700}>{e.online ? 'Online' : 'Offline'}</Txt>
              </View>
            }
          />
          <Row left={<Txt color={colors.muted}>Wi-Fi</Txt>} right={<Txt weight={700}>{wifi}</Txt>} />
          <Row
            left={<Txt color={colors.muted}>Firmware</Txt>}
            right={<Txt weight={700}>{e.info?.fw ? `v${e.info.fw}` : '—'}</Txt>}
          />
          <Txt size={12} color={colors.muted}>
            The type is set at the factory and cannot be changed.
          </Txt>
        </Card>
      </FadeUp>
      <FadeUp step={2}>
        <UpdateCard
          info={e.info}
          state={e.state}
          stable={stable}
          online={e.online}
          onUpdate={() => startUpdate(e.id)}
        />
      </FadeUp>
      <FadeUp step={3}>
        <Card>
          <Label>Setup</Label>
          <Row
            left={
              <Txt size={14} style={{ flex: 1 }}>
                {layoutText(e)}
              </Txt>
            }
            right={
              <Ghost
                label="Installer setup"
                height={32}
                onPress={() => {
                  select(e.id);
                  setSetupFor(type);
                  go('setup');
                }}
              />
            }
          />
        </Card>
      </FadeUp>
      <FadeUp step={4}>
        <Ghost
          label={busy ? 'Removing…' : confirm ? 'Tap again to remove' : 'Remove from my account'}
          onPress={() => void onRemove()}
          disabled={busy}
          danger
          height={48}
          grow
        />
        <Txt size={12} color={colors.muted} style={{ marginTop: s(8), lineHeight: s(18) }}>
          The board keeps working by itself. To use it again, add it with Add device.
        </Txt>
      </FadeUp>
    </>
  );
}

export default function Devices() {
  const insets = useSafeAreaInsets();
  const ids = useSession((st) => st.deviceIds);
  const devices = useFleet((f) => f.devices);
  const [openId, setOpenId] = useState<string | null>(null);
  // A board removed here or on another phone drops back to the list.
  const open = openId && ids.includes(openId) ? devices[openId] : undefined;
  const back = useCallback(() => (open ? setOpenId(null) : go('account')), [open]);

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
        <Txt family="outfit" size={26} weight={500} accessibilityRole="header">
          {open ? MODULE_LABEL[open.info?.type ?? 'household'] : 'My devices'}
        </Txt>
      </View>
      {open ? (
        <Detail key={open.id} e={open} onBack={() => setOpenId(null)} />
      ) : (
        <FadeUp key="list" style={{ gap: s(10) }}>
          {ids.length === 0 ? (
            <Txt size={14} color={colors.muted}>
              No devices yet.
            </Txt>
          ) : null}
          {ids.map((id) =>
            devices[id] ? <DeviceRow key={id} e={devices[id]} onPress={() => setOpenId(id)} /> : null,
          )}
          <Ghost label="+ Add device" onPress={() => go('add')} height={48} grow />
        </FadeUp>
      )}
    </Screen>
  );
}
