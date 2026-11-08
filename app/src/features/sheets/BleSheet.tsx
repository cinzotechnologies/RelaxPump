import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Fade } from '@/components/FadeUp';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { bleNameFor } from '@/logic/claim';
import { signalLabel } from '@/logic/format';
import { backend } from '@/services';
import { MOCK_DEVICE_ID } from '@/services/mockBackend';
import { provisioner, type FoundController, type WifiNetwork } from '@/services/provisioning';
import { useDevice } from '@/state/device';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { alpha, colors, s, Txt } from '@/theme';

import { QrScan, type BoxCode } from './QrScan';

type Step = 'status' | 'scan' | 'search' | 'found' | 'nets' | 'join';

const TITLE: Record<Step, string> = {
  status: 'Device',
  scan: 'Scan the box',
  search: 'Searching via Bluetooth',
  found: 'Controller found',
  nets: 'Wi-Fi',
  join: 'Connecting',
};

function Waiting({ text }: { text: string }) {
  return (
    <Fade style={{ alignItems: 'center', gap: s(14), paddingTop: s(18), paddingBottom: s(8) }}>
      <Spinner size={28} width={3} track={alpha(colors.glow, 0.2)} color={colors.glow} />
      <Txt size={14} color={colors.muted} style={{ textAlign: 'center' }}>
        {text}
      </Txt>
    </Fade>
  );
}

export function BleSheet() {
  const open = useUi((st) => st.sheet === 'ble');
  const close = useUi((st) => st.closeSheet);
  const showToast = useUi((st) => st.showToast);
  const myDevice = useSession((st) => st.deviceId);
  const hasDevice = !!myDevice;
  const state = useDevice((d) => d.state);
  const tankCount = useDevice((d) => d.config.tankCount);
  const online = useDevice((d) => hasDevice && d.online);

  const [step, setStep] = useState<Step>('status');
  const [found, setFound] = useState<FoundController[]>([]);
  const [nets, setNets] = useState<WifiNetwork[]>([]);
  const [pick, setPick] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [box, setBox] = useState<BoxCode | null>(null);
  const alive = useRef(true);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep('status');
      setErr('');
    }
  }
  useEffect(() => {
    alive.current = open;
    if (!open) provisioner().disconnect();
  }, [open]);

  const fail = (text: string) => {
    if (!alive.current) return;
    setStep('status');
    showToast(text);
  };

  // Real devices: scan the box QR first (it carries the Bluetooth PoP and the claim code).
  const startSetup = () => {
    if (provisioner().real) setStep('scan');
    else search(null);
  };

  const search = async (b: BoxCode | null) => {
    setBox(b);
    setStep('search');
    try {
      let list = await provisioner().search();
      if (!alive.current) return;
      if (b) list = list.filter((c) => c.name === bleNameFor(b.deviceId));
      if (!list.length) return fail('No controller found');
      setFound(list);
      setStep('found');
    } catch {
      fail('Bluetooth search failed');
    }
  };

  const pickDevice = async (c: FoundController) => {
    try {
      await provisioner().connect(c.name, box?.pop ?? '');
      const list = await provisioner().scanWifi();
      if (!alive.current) return;
      setNets(list);
      setPick('');
      setPass('');
      setErr('');
      setStep('nets');
    } catch {
      fail('Could not connect to the controller');
    }
  };

  const join = async () => {
    const secure = nets.find((n) => n.ssid === pick)?.secure ?? true;
    if (!pick || (secure && pass.length < 8)) {
      setErr('Pick a network and enter its password');
      return;
    }
    setStep('join');
    try {
      await provisioner().provision(pick, pass);
    } catch {
      return fail('Wrong Wi-Fi password?');
    }
    // Link the controller to this account (first setup). Mock mode links the demo controller.
    try {
      if (box && box.deviceId !== myDevice) await backend().claimDevice(box.deviceId, box.code);
      else if (!box && !hasDevice && backend().kind === 'mock')
        await backend().claimDevice(MOCK_DEVICE_ID, 'DEMO-CODE');
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Could not add the controller');
    }
    if (!alive.current) return;
    setStep('status');
    showToast('Wi-Fi saved · Controller online');
  };

  return (
    <Sheet open={open} onClose={close} title={TITLE[step]} gap={12}>
      {step === 'status' ? (
        <Fade style={{ gap: s(12) }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(14),
              padding: s(16),
              borderRadius: s(20),
              backgroundImage: 'linear-gradient(140deg, #0C3640, #0A242B)',
              borderWidth: 1,
              borderColor: alpha(colors.glow, 0.2),
            }}
          >
            <View
              style={{
                width: s(48),
                height: s(48),
                borderRadius: s(14),
                backgroundColor: alpha(colors.glow, 0.12),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="chip" size={24} strokeWidth={1.8} color={colors.glow} />
            </View>
            <View style={{ flex: 1, gap: s(3) }}>
              <Txt size={15} weight={600}>
                RelaxPump Controller
              </Txt>
              <Txt size={12} color={colors.muted}>
                {online ? `Online · ${tankCount} ${tankCount === 1 ? 'tank' : 'tanks'}` : 'Not connected'}
              </Txt>
            </View>
            <View
              style={{
                paddingVertical: s(4),
                paddingHorizontal: s(10),
                borderRadius: 999,
                backgroundColor: online ? alpha(colors.glow, 0.15) : 'rgba(248,113,113,0.15)',
              }}
            >
              <Txt size={11} weight={600} color={online ? colors.glow : colors.dangerText}>
                {online ? 'Online' : 'Offline'}
              </Txt>
            </View>
          </View>
          {online ? (
            <View style={{ flexDirection: 'row', gap: s(8) }}>
              {[
                ['Wi-Fi', state?.ssid || '—'],
                ['Signal', signalLabel(state?.rssi ?? -90)],
              ].map(([k, v]) => (
                <View
                  key={k}
                  style={{
                    flex: 1,
                    padding: s(12),
                    borderRadius: s(16),
                    backgroundColor: colors.card,
                    gap: s(2),
                  }}
                >
                  <Txt size={11} color={colors.faint}>
                    {k}
                  </Txt>
                  <Txt size={14} weight={600} numberOfLines={1}>
                    {v}
                  </Txt>
                </View>
              ))}
            </View>
          ) : null}
          <PrimaryButton label={online ? 'Change Wi-Fi' : 'Set up device'} onPress={startSetup} />
        </Fade>
      ) : null}

      {step === 'scan' ? (
        <QrScan onCode={(c) => search(c)} onBad={() => showToast('This is not a RelaxPump code')} />
      ) : null}

      {step === 'search' ? (
        <Waiting text="Turn on Bluetooth, power the controller and keep your phone close." />
      ) : null}

      {step === 'found' ? (
        <Fade style={{ gap: s(10) }}>
          <Txt size={13} color={colors.muted}>
            Found nearby
          </Txt>
          {found.map((c) => (
            <Press
              key={c.name}
              onPress={() => pickDevice(c)}
              accessibilityLabel={`Connect to ${c.name}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(12),
                paddingVertical: s(13),
                paddingHorizontal: s(14),
                borderRadius: s(16),
                borderWidth: 1,
                borderColor: alpha(colors.glow, 0.1),
                backgroundColor: colors.card,
              }}
            >
              <View
                style={{
                  width: s(8),
                  height: s(8),
                  borderRadius: s(4),
                  backgroundColor: colors.glow,
                  boxShadow: `0 0 ${s(8)}px ${colors.glow}`,
                }}
              />
              <Txt size={14} style={{ flex: 1 }}>
                {c.name}
              </Txt>
              <Txt size={12} weight={600} color={colors.glow}>
                Connect
              </Txt>
            </Press>
          ))}
        </Fade>
      ) : null}

      {step === 'nets' ? (
        <Fade style={{ gap: s(8) }}>
          <Txt size={13} color={colors.muted}>
            Choose your home Wi-Fi. We send it to the controller over Bluetooth.
          </Txt>
          {nets.map((n) => {
            const sel = n.ssid === pick;
            return (
              <Press
                key={n.ssid}
                onPress={() => {
                  setPick(n.ssid);
                  setErr('');
                }}
                accessibilityState={{ selected: sel }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: s(12),
                  paddingVertical: s(12),
                  paddingHorizontal: s(14),
                  borderRadius: s(16),
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: sel ? alpha(colors.glow, 0.6) : alpha(colors.glow, 0.1),
                }}
              >
                <Icon name="wifi" size={18} color={colors.glow} />
                <Txt size={14} style={{ flex: 1 }} numberOfLines={1}>
                  {n.ssid}
                </Txt>
                {sel ? <Icon name="check" size={16} strokeWidth={2.4} color={colors.glow} /> : null}
              </Press>
            );
          })}
          <TextField
            inSheet
            value={pass}
            onChangeText={setPass}
            secureTextEntry
            placeholder="Wi-Fi password"
            style={{ marginTop: s(4) }}
          />
          {err ? (
            <Fade>
              <Txt size={12} color={colors.dangerText}>
                {err}
              </Txt>
            </Fade>
          ) : null}
          <PrimaryButton label="Connect" onPress={join} style={{ marginTop: s(4) }} />
        </Fade>
      ) : null}

      {step === 'join' ? <Waiting text={`Connecting to ${pick}…`} /> : null}
    </Sheet>
  );
}
