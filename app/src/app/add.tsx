// Add device (reference/design-v3/AppAddDevice.dc.html, docs/two-module-system.md §5):
//   1 Bluetooth scan (radar; boards with their HOUSEHOLD / PHE badge)
//   2 Wi-Fi (the name is remembered for the next board; the password for this app session)
//   3 Connecting checklist: Bluetooth → Wi-Fi → RelaxPump cloud → linked to your account
//   4 Number of semi tanks / PHE lines + names (household also the main tank sensor)
//   5 Check wiring (sensors found, test each valve; household also the pump) → Save
//   6 Done + "Add another device"
// Reuses the v2 Bluetooth provisioning and the claim; step 4–5 is Installer setup in short form.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { Fade, FadeUp } from '@/components/FadeUp';
import { Icon } from '@/components/Icon';
import { ModuleBadge, ModuleIcon, MODULE_LABEL } from '@/components/ModuleBadge';
import { Press } from '@/components/Press';
import { Screen } from '@/components/Screen';
import { Spinner } from '@/components/Spinner';
import { Toggle } from '@/components/Toggle';
import { Card, Cta, Ghost, Label, PortTag, Row } from '@/features/setup/parts';
import { typeFromBleName, type ControllerIdentity } from '@/logic/claim';
import { TANK_NAME_MAX } from '@/logic/format';
import {
  countHelpOf,
  HH_NAMES,
  householdConfig,
  outputsFor,
  PHE_NAMES,
  pheConfig,
  portsOf,
  stepTitle,
  type Step,
} from '@/features/add/logic';
import { DEFAULT_LAYOUT, MAX_TANKS, type LayoutConfig } from '@/model/layout';
import { DEFAULT_PHE, type PheConfig } from '@/model/phe';
import type { DeviceState, ModuleType, TestPort } from '@/model/types';
import { backend } from '@/services';
import { ClaimError } from '@/services/backend';
import { BluetoothDenied, provisioner } from '@/services/provisioning';
import { isOnline } from '@/state/device';
import { useFleet } from '@/state/fleet';
import { go } from '@/state/nav';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { alpha, colors, font, motion, s, Txt } from '@/theme';

const WIFI_KEY = 'rp.wifi.v1';
/** The board joins Wi-Fi, then reaches the cloud: give it a minute. */
const CLOUD_WAIT_MS = 60_000;
/** Password of the last Wi-Fi used, for the next board in this app session only (never stored). */
let lastWifiPassword = '';

type Found = { name: string; type: ModuleType };
type Picked = Found & { identity: ControllerIdentity };

// ------------------------------------------------------------------ parts

/** Three rings growing out of the Bluetooth dot (`.radar span` 2.4 s, .8 s apart). */
function useRing(delay: number) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 2400, easing: Easing.bezier(...motion.ease) }), -1, false),
    );
  }, [v, delay]);
  return useAnimatedStyle(() => ({ transform: [{ scale: 0.25 + 0.75 * v.value }], opacity: 1 - v.value }));
}

function Radar() {
  const r = [useRing(0), useRing(800), useRing(1600)];
  const size = s(150);
  return (
    <View style={{ width: size, height: size, alignSelf: 'center', marginVertical: s(10) }}>
      {r.map((st, i) => (
        <Animated.View
          key={i}
          style={[
            {
              position: 'absolute',
              inset: 0,
              borderRadius: size / 2,
              borderWidth: 1.5,
              borderColor: alpha(colors.glow, 0.5),
            },
            st,
          ]}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          left: size / 2 - s(27),
          top: size / 2 - s(27),
          width: s(54),
          height: s(54),
          borderRadius: s(27),
          backgroundColor: colors.lightTeal,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="bluetooth" size={26} color={colors.white} />
      </View>
    </View>
  );
}

function BoardRow({
  b,
  busy,
  onPress,
  sub,
}: {
  b: Found;
  busy?: boolean;
  onPress?: () => void;
  sub: string;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={!onPress || busy}
      accessibilityLabel={`${MODULE_LABEL[b.type]} board ${b.name}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        padding: s(14),
        borderRadius: s(18),
        borderWidth: 1,
        borderColor: alpha(colors.glow, 0.22),
        backgroundColor: colors.card,
      }}
    >
      <ModuleIcon type={b.type} />
      <View style={{ flex: 1, gap: s(4) }}>
        <Txt size={15} weight={700}>{`RelaxPump ${MODULE_LABEL[b.type]}`}</Txt>
        <Txt size={12} color={colors.muted} numberOfLines={1}>
          {sub}
        </Txt>
      </View>
      {busy ? (
        <Spinner size={18} width={2} track={alpha(colors.glow, 0.2)} color={colors.glow} />
      ) : (
        <ModuleBadge type={b.type} />
      )}
    </Press>
  );
}

function Field({
  label,
  value,
  onChange,
  secure,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  secure?: boolean;
}) {
  return (
    <View style={{ gap: s(8) }}>
      <Label>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        placeholderTextColor={colors.dim}
        style={{
          height: s(44),
          borderRadius: s(12),
          borderWidth: 1,
          borderColor: alpha(colors.glow, 0.3),
          backgroundColor: colors.deepCard,
          color: colors.text,
          paddingHorizontal: s(12),
          ...font(500),
          fontSize: s(15),
        }}
      />
    </View>
  );
}

function Check({ on, label }: { on: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
      <View
        style={{
          width: s(22),
          height: s(22),
          borderRadius: s(11),
          borderWidth: 1.5,
          borderColor: on ? colors.glow : alpha(colors.glow, 0.35),
          backgroundColor: on ? colors.glow : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {on ? <Icon name="check" size={12} strokeWidth={3} color={colors.base} /> : null}
      </View>
      <Txt size={14} color={on ? colors.text : colors.muted}>
        {label}
      </Txt>
    </View>
  );
}

function RoundBtn({ glyph, label, onPress }: { glyph: string; label: string; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        width: s(56),
        height: s(56),
        borderRadius: s(28),
        borderWidth: 1,
        borderColor: alpha(colors.glow, 0.4),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt size={28} weight={500} color={colors.glow}>
        {glyph}
      </Txt>
    </Press>
  );
}

// ------------------------------------------------------------------ screen

type Form = { n: number; names: string[]; mainOn: boolean };
type FormAction =
  | { type: 'reset'; f: Form }
  | { type: 'n'; n: number }
  | { type: 'name'; i: number; v: string }
  | { type: 'main' };

function formReducer(f: Form, a: FormAction): Form {
  switch (a.type) {
    case 'reset':
      return a.f;
    case 'n':
      return { ...f, n: Math.max(1, Math.min(MAX_TANKS, a.n)) };
    case 'name':
      return { ...f, names: f.names.map((x, i) => (i === a.i ? a.v.slice(0, TANK_NAME_MAX) : x)) };
    case 'main':
      return { ...f, mainOn: !f.mainOn };
  }
}

export default function AddDevice() {
  const insets = useSafeAreaInsets();
  const myIds = useSession((st) => st.deviceIds);
  const showToast = useUi((st) => st.showToast);
  const [step, setStep] = useState<Step>(0);
  const [scan, setScan] = useState<'scanning' | 'done' | 'error'>('scanning');
  const [scanErr, setScanErr] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [ssid, setSsid] = useState('');
  const [pw, setPw] = useState(lastWifiPassword);
  const [prog, setProg] = useState(0); // 0..4 checklist ticks
  /** Claimed: this account may read the board's state and config now. */
  const [linked, setLinked] = useState(false);
  const [err, setErr] = useState('');
  const [form, dispatch] = useReducer(formReducer, { n: 1, names: HH_NAMES, mainOn: false });
  const [tested, setTested] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [state, setState] = useState<DeviceState | null>(null);
  const [hhBase, setHhBase] = useState<LayoutConfig>(DEFAULT_LAYOUT);
  const [pheBase, setPheBase] = useState<PheConfig>(DEFAULT_PHE);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
      provisioner().disconnect();
    },
    [],
  );

  const type: ModuleType = picked?.type ?? 'household';
  const id = picked?.identity.deviceId ?? null;

  /** Bluetooth search; the list and status change only when it answers. */
  const search = useCallback(
    () =>
      provisioner()
        .search()
        .then(
          (list) => {
            if (!alive.current) return;
            setFound(
              list.flatMap((c) => {
                const t = typeFromBleName(c.name);
                return t ? [{ name: c.name, type: t }] : [];
              }),
            );
            setScan('done');
          },
          (e: unknown) => {
            if (!alive.current) return;
            setScan('error');
            setScanErr(
              e instanceof BluetoothDenied
                ? e.message
                : 'Bluetooth search failed. Turn on Bluetooth and try again.',
            );
          },
        ),
    [],
  );

  const startScan = useCallback(() => {
    setScan('scanning');
    setScanErr('');
    setFound([]);
    void search();
  }, [search]);

  useEffect(() => {
    void search();
    AsyncStorage.getItem(WIFI_KEY)
      .then((v) => v && alive.current && setSsid((cur) => cur || v))
      .catch(() => {});
  }, [search]);

  // Live state + config of the board being added (after it is linked to this account).
  useEffect(() => {
    if (!id || !linked) return;
    const b = backend();
    const unsubs = [
      b.onState(id, (st) => setState(st)),
      b.onConfig(id, (c) => c && setHhBase(c)),
      b.onPheConfig(id, (c) => c && setPheBase(c)),
    ];
    return () => unsubs.forEach((u) => u());
  }, [id, linked]);

  const pick = async (b: Found) => {
    setConnecting(b.name);
    try {
      const p = provisioner();
      await p.connect(b.name);
      const identity = await p.readIdentity();
      if (!identity) throw new Error('identity');
      if (!alive.current) return;
      // The identity reply is the truth; the name only guides the scan list.
      setPicked({ ...b, type: identity.type, identity });
      if (!ssid) {
        const nets = await p.scanWifi().catch(() => []);
        if (alive.current && nets[0]) setSsid((cur) => cur || nets[0].ssid);
      }
      setStep(1);
    } catch {
      if (alive.current) showToast('Could not connect. Keep the phone close and try again.');
    } finally {
      if (alive.current) setConnecting(null);
    }
  };

  const connect = async () => {
    if (!picked) return;
    const { deviceId, code } = picked.identity;
    setStep(2);
    setProg(1); // Bluetooth ✓
    setErr('');
    try {
      await provisioner().provision(ssid.trim(), pw);
    } catch {
      if (!alive.current) return;
      setErr('The board could not join this Wi-Fi. Check the name and password (2.4 GHz only).');
      return;
    }
    lastWifiPassword = pw;
    AsyncStorage.setItem(WIFI_KEY, ssid.trim()).catch(() => {});
    if (!alive.current) return;
    setProg(2); // Wi-Fi ✓
    try {
      if (!myIds.includes(deviceId)) await backend().claimDevice(deviceId, code);
      if (alive.current) setLinked(true);
    } catch (e) {
      if (!alive.current) return;
      setErr(
        e instanceof ClaimError && e.code === 'bad-code'
          ? 'This board already belongs to another account. Ask its owner to remove it in My devices.'
          : 'Could not reach the RelaxPump server. Check the phone’s internet and try again.',
      );
      return;
    }
    // Linked; now wait for the board itself to report from the cloud.
    const t0 = Date.now();
    const offsetOf = () => useFleet.getState().serverOffset;
    let reached = false;
    await new Promise<void>((res) => {
      const un = backend().onState(deviceId, (st) => {
        if (isOnline(st, Date.now() + offsetOf())) {
          reached = true;
          un();
          res();
        }
      });
      const tick = setInterval(() => {
        if (reached || !alive.current || Date.now() - t0 > CLOUD_WAIT_MS) {
          clearInterval(tick);
          un();
          res();
        }
      }, 500);
    });
    if (!alive.current) return;
    if (!reached) {
      setErr('The board joined Wi-Fi but has not reached the cloud yet. Check the router’s internet.');
      return;
    }
    setProg(3); // cloud ✓
    useFleet.getState().select(deviceId);
    setProg(4); // linked ✓
    const names = picked.type === 'phe' ? PHE_NAMES : HH_NAMES;
    dispatch({ type: 'reset', f: { n: picked.type === 'phe' ? 2 : 3, names: names.slice(), mainOn: false } });
  };

  // Start the form from the board's saved layout once it arrives (re-adding a board keeps it).
  const formFromBoard = useRef(false);
  useEffect(() => {
    if (step !== 3 || formFromBoard.current) return;
    formFromBoard.current = true;
    if (type === 'phe' && pheBase !== DEFAULT_PHE) {
      const n = pheBase.lines.length;
      dispatch({
        type: 'reset',
        f: { n, names: PHE_NAMES.map((d, i) => pheBase.lines[i]?.name ?? d), mainOn: false },
      });
    } else if (type === 'household' && hhBase !== DEFAULT_LAYOUT && hhBase.tanks.some((t) => t.name)) {
      dispatch({
        type: 'reset',
        f: {
          n: hhBase.tanks.length,
          names: HH_NAMES.map((d, i) => hhBase.tanks[i]?.name ?? d),
          mainOn: hhBase.main.enabled,
        },
      });
    }
  }, [step, type, pheBase, hhBase]);

  const test = (port: TestPort) => {
    if (!id) return;
    backend()
      .sendCommand(id, { test: { port, ms: 2000 } })
      .then(() => setTested((t) => ({ ...t, [port]: true })))
      .catch(() => showToast('Could not reach the controller'));
  };

  const save = async () => {
    if (!id) return;
    setSaving(true);
    try {
      if (type === 'phe') await backend().savePheSetup(id, pheConfig(pheBase, form.n, form.names));
      else await backend().saveSetup(id, householdConfig(hhBase, form.n, form.names, form.mainOn));
      setSaveNote('');
    } catch {
      // An installer PIN is set on this board: the layout stays as it was.
      setSaveNote('This board has an installer PIN. Open Installer setup to change its tanks.');
    }
    void backend().endSetup(id);
    if (!alive.current) return;
    setSaving(false);
    setStep(5);
  };

  const again = () => {
    provisioner().disconnect();
    setPicked(null);
    setStep(0);
    setProg(0);
    setErr('');
    setTested({});
    setState(null);
    setLinked(false);
    setSaveNote('');
    formFromBoard.current = false;
    startScan();
  };

  const back = useCallback(() => {
    if (step === 0 || step === 5) go('home');
    else if (step === 1) {
      provisioner().disconnect();
      setStep(0);
    } else if (step === 2) setStep(1);
    else if (step === 3) setStep(1);
    else setStep((step - 1) as Step);
  }, [step]);

  const canBack = step !== 2 || !!err;
  const blocked = step === 0 || (step === 1 && !ssid.trim()) || (step === 2 && prog < 4) || saving;
  const nextLabel =
    step === 1
      ? 'Connect'
      : step === 2 && err
        ? 'Try again'
        : step === 4
          ? 'Save'
          : step === 5
            ? 'Go to Home'
            : 'Next';
  const next = () => {
    if (step === 1) void connect();
    else if (step === 2 && err) setStep(1);
    else if (step === 4) void save();
    else if (step === 5) go('home');
    else setStep((step + 1) as Step);
  };

  const names = form.names.slice(0, form.n);
  const det = state?.detected;
  const sensorRows = [
    ...names.map((nm, i) => ({ port: `T${i + 1}`, name: nm || `Tank ${i + 1}`, ok: !!det?.tanks[i] })),
    ...(type === 'household' && form.mainOn ? [{ port: 'MAIN', name: 'Main tank', ok: !!det?.main }] : []),
  ];
  const outs = outputsFor(
    type,
    form.n,
    names.map((nm, i) => nm || `${type === 'phe' ? 'Line' : 'Tank'} ${i + 1}`),
  );
  const kind = MODULE_LABEL[type];
  const unit =
    type === 'phe' ? (form.n > 1 ? 'PHE lines' : 'PHE line') : form.n > 1 ? 'semi tanks' : 'semi tank';

  return (
    <Screen onBack={back} contentStyle={{ paddingBottom: insets.bottom }}>
      {/* Title + 6 progress dots */}
      <View
        style={{
          paddingTop: Math.max(s(52), insets.top + s(12)),
          paddingHorizontal: s(16),
          paddingBottom: s(12),
          gap: s(12),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
          {canBack ? <BackButton onPress={back} /> : null}
          <Txt family="outfit" size={26} weight={500} accessibilityRole="header">
            {stepTitle(step, type)}
          </Txt>
          <Txt size={12} color={colors.muted} style={{ marginLeft: 'auto' }}>{`${step + 1} / 6`}</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: s(6) }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: s(4),
                borderRadius: s(4),
                backgroundColor: i <= step ? colors.glow : alpha(colors.glow, 0.15),
              }}
            />
          ))}
        </View>
      </View>

      <ScrollView
        key={step}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: s(16),
          paddingTop: s(6),
          paddingBottom: s(20),
          gap: s(12),
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 0 ? (
          <Fade style={{ gap: s(14) }}>
            <Radar />
            <Txt
              size={14}
              color={scan === 'error' ? colors.dangerText : colors.muted}
              style={{ textAlign: 'center' }}
            >
              {scan === 'scanning'
                ? 'Looking for boards nearby…'
                : scan === 'error'
                  ? scanErr
                  : found.length
                    ? 'Tap your board'
                    : 'No board found nearby.'}
            </Txt>
            {found.map((b, i) => (
              <FadeUp key={b.name} step={i}>
                <BoardRow
                  b={b}
                  busy={connecting === b.name}
                  onPress={connecting ? undefined : () => void pick(b)}
                  sub={`${b.name} · ${b.type === 'phe' ? 'PHE lines' : 'pump + semi tanks'}`}
                />
              </FadeUp>
            ))}
            {scan !== 'scanning' ? (
              <View style={{ alignItems: 'center' }}>
                <Ghost label="Search again" onPress={startScan} />
              </View>
            ) : null}
            <Txt size={12} color={colors.muted} style={{ textAlign: 'center', lineHeight: s(18) }}>
              Not listed? Hold the BOOT button on the board for 5 seconds, then search again.
            </Txt>
          </Fade>
        ) : null}

        {step === 1 && picked ? (
          <Fade style={{ gap: s(12) }}>
            <BoardRow b={picked} sub={`${picked.identity.deviceId} · connected by Bluetooth`} />
            <Txt size={14} color={colors.muted}>
              Which Wi-Fi should this board use?
            </Txt>
            <Card>
              <Field label="Wi-Fi name" value={ssid} onChange={setSsid} />
              <Field label="Password" value={pw} onChange={setPw} secure />
            </Card>
            <Txt size={12} color={colors.muted} style={{ lineHeight: s(18) }}>
              Use 2.4 GHz Wi-Fi. The app remembers it, so your next board is quicker.
            </Txt>
          </Fade>
        ) : null}

        {step === 2 ? (
          <Fade style={{ gap: s(16), paddingTop: s(10) }}>
            <Check on={prog > 0} label="Connected by Bluetooth" />
            <Check on={prog > 1} label={`Joined Wi-Fi “${ssid.trim()}”`} />
            <Check on={prog > 2} label="Reached RelaxPump cloud" />
            <Check on={prog > 3} label="Linked to your account" />
            <View
              style={{
                marginTop: s(8),
                height: s(8),
                borderRadius: s(8),
                backgroundColor: alpha(colors.glow, 0.12),
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${prog * 25}%`,
                  height: '100%',
                  borderRadius: s(8),
                  backgroundImage: `linear-gradient(90deg, ${colors.lightTeal}, ${colors.glow})`,
                }}
              />
            </View>
            {err ? (
              <View
                style={{
                  padding: s(12),
                  borderRadius: s(12),
                  backgroundColor: alpha(colors.dangerText, 0.12),
                }}
              >
                <Txt size={12} color={colors.dangerText} style={{ lineHeight: s(18) }}>
                  {err}
                </Txt>
              </View>
            ) : prog < 4 ? (
              <View style={{ alignItems: 'center' }}>
                <Spinner size={22} width={2.5} track={alpha(colors.glow, 0.2)} color={colors.glow} />
              </View>
            ) : null}
          </Fade>
        ) : null}

        {step === 3 ? (
          <Fade style={{ gap: s(12) }}>
            <Txt size={15} color={colors.muted}>
              {type === 'phe' ? 'How many PHE lines are connected?' : 'How many semi tanks are connected?'}
            </Txt>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: s(28),
                paddingVertical: s(26),
              }}
            >
              <RoundBtn glyph="−" label="One less" onPress={() => dispatch({ type: 'n', n: form.n - 1 })} />
              <Txt
                family="outfit"
                size={72}
                weight={500}
                tabular
                style={{ minWidth: s(60), textAlign: 'center' }}
              >
                {String(form.n)}
              </Txt>
              <RoundBtn glyph="+" label="One more" onPress={() => dispatch({ type: 'n', n: form.n + 1 })} />
            </View>
            {names.map((nm, i) => (
              <FadeUp key={i} step={i}>
                <Card>
                  <Row
                    left={<Txt weight={700}>{`${type === 'phe' ? 'PHE line' : 'Tank'} ${i + 1}`}</Txt>}
                    right={<PortTag>{portsOf(type, form.n, i)}</PortTag>}
                  />
                  <TextInput
                    value={nm}
                    onChangeText={(v) => dispatch({ type: 'name', i, v })}
                    accessibilityLabel={`Name of ${type === 'phe' ? 'PHE line' : 'tank'} ${i + 1}`}
                    placeholder={type === 'phe' ? `Line ${i + 1}` : `Tank ${i + 1}`}
                    placeholderTextColor={colors.dim}
                    style={{
                      height: s(44),
                      borderRadius: s(12),
                      borderWidth: 1,
                      borderColor: alpha(colors.glow, 0.3),
                      backgroundColor: colors.deepCard,
                      color: colors.text,
                      paddingHorizontal: s(12),
                      ...font(500),
                      fontSize: s(15),
                    }}
                  />
                </Card>
              </FadeUp>
            ))}
            {type === 'household' ? (
              <Card>
                <Row
                  left={
                    <View style={{ flex: 1, gap: s(3) }}>
                      <Txt weight={700}>Main tank sensor</Txt>
                      <Txt size={12} color={colors.muted}>
                        Port MAIN · protects the pump
                      </Txt>
                    </View>
                  }
                  right={
                    <Toggle
                      value={form.mainOn}
                      onChange={() => dispatch({ type: 'main' })}
                      label="Main tank sensor"
                    />
                  }
                />
              </Card>
            ) : null}
            <Txt size={12} color={colors.muted} style={{ lineHeight: s(18) }}>
              {countHelpOf(type, form.n)}
            </Txt>
          </Fade>
        ) : null}

        {step === 4 ? (
          <Fade style={{ gap: s(12) }}>
            <Card>
              <Label>Sensors</Label>
              {sensorRows.map((r) => (
                <Row
                  key={r.port}
                  left={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), flex: 1 }}>
                      <PortTag>{r.port}</PortTag>
                      <Txt size={14} numberOfLines={1} style={{ flexShrink: 1 }}>
                        {r.name}
                      </Txt>
                    </View>
                  }
                  right={
                    <Txt size={14} weight={700} color={r.ok ? colors.glow : colors.dangerText}>
                      {r.ok ? 'Found ✓' : state ? 'Not found' : '…'}
                    </Txt>
                  }
                />
              ))}
            </Card>
            <Card>
              <Label>{type === 'phe' ? 'Valves' : 'Valves and pump'}</Label>
              {outs.map((o) => (
                <Row
                  key={o.port}
                  left={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), flex: 1 }}>
                      <PortTag>{o.port}</PortTag>
                      <Txt size={14} numberOfLines={1} style={{ flexShrink: 1 }}>
                        {o.name}
                      </Txt>
                    </View>
                  }
                  right={
                    <Ghost
                      label={tested[o.port] ? 'Clicked ✓' : 'Test'}
                      height={32}
                      onPress={() => test(o.port)}
                    />
                  }
                />
              ))}
              <Txt size={12} color={colors.muted} style={{ lineHeight: s(18) }}>
                {type === 'phe'
                  ? 'Tap Test and listen for the valve click (2 seconds).'
                  : 'Tap Test and listen for the valve click or the pump (2 seconds).'}
              </Txt>
            </Card>
            {sensorRows.some((r) => !r.ok) && state ? (
              <Txt size={12} color={colors.warningLight} style={{ lineHeight: s(18) }}>
                A sensor is not answering. Check its cable and port, then come back. You can save now and fix
                it later.
              </Txt>
            ) : null}
          </Fade>
        ) : null}

        {step === 5 && picked ? (
          <Fade style={{ alignItems: 'center', gap: s(14), paddingTop: s(50) }}>
            <View
              style={{
                width: s(84),
                height: s(84),
                borderRadius: s(42),
                backgroundImage: 'linear-gradient(180deg, #B5F4F8, #7FE3EC, #1FA9B9)',
                boxShadow: `0 0 ${s(40)}px ${alpha(colors.glow, 0.45)}`,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="check" size={38} strokeWidth={2.6} color={colors.base} />
            </View>
            <Txt family="outfit" size={26} weight={500}>
              {`${kind} added`}
            </Txt>
            <Txt size={14} color={colors.muted} style={{ textAlign: 'center', lineHeight: s(21) }}>
              {`${picked.identity.deviceId} · ${form.n} ${unit}. It now shows on Home.`}
              {saveNote ? `\n${saveNote}` : ''}
            </Txt>
            <Ghost label="Add another device" onPress={again} />
          </Fade>
        ) : null}
      </ScrollView>

      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: s(16),
          paddingTop: s(14),
          paddingBottom: Math.max(s(26), insets.bottom + s(12)),
        }}
      >
        <Cta label={saving ? 'Saving…' : nextLabel} arrow onPress={next} disabled={blocked} />
      </View>
    </Screen>
  );
}
