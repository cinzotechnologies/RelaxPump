// Installer setup (reference/design-v2/AppSetup.dc.html): PIN keypad → 5 steps → Saved.
import Constants from 'expo-constants';
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { Linking, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fade, FadeUp } from '@/components/FadeUp';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { Spinner } from '@/components/Spinner';
import { Toggle } from '@/components/Toggle';
import { fmtNum, TANK_NAME_MAX } from '@/logic/format';
import { modeHelp, portsOf, type Mode } from '@/model/layout';
import type { TestPort } from '@/model/types';
import { backend } from '@/services';
import { useDevice } from '@/state/device';
import { go } from '@/state/nav';
import { useSession } from '@/state/session';
import {
  draftFrom,
  draftToConfig,
  maxTanksOf,
  modesOf,
  outputsOf,
  reduce,
  sensorChecksOf,
  SIZE_CHIPS,
  STEP_TITLES,
  stepBlocked,
  summaryRows,
  summaryText,
  tankErrors,
  FILL_STEP,
  MIN_PCT_STEP,
  type Action,
  type Draft,
} from '@/state/setup';
import { useUi } from '@/state/ui';
import { alpha, colors, font, s, Txt } from '@/theme';

const extra = (Constants.expoConfig?.extra ?? {}) as { SUPPORT_WHATSAPP?: string };
const CONFIRM_MS = 20_000;

type Phase = 'loading' | 'pin' | 'wizard' | 'saving' | 'done';
type PinMode = 'enter' | 'new' | 'confirm';

// ------------------------------------------------------------------ small parts
function Card({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return <View style={{ padding: s(14), gap: s(gap), borderRadius: s(20), backgroundColor: colors.card }}>{children}</View>;
}

function Label({ children }: { children: string }) {
  return (
    <Txt size={11} weight={600} tracking={1.5} color={colors.glow}>
      {children.toUpperCase()}
    </Txt>
  );
}

function PortTag({ children }: { children: string }) {
  return (
    <View style={{ height: s(22), paddingHorizontal: s(8), borderRadius: s(6), backgroundColor: colors.deepCard, justifyContent: 'center' }}>
      <Txt size={11} weight={700} color={colors.glow} style={{ fontFamily: 'monospace' }}>
        {children}
      </Txt>
    </View>
  );
}

function Row({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s(10) }}>
      {typeof left === 'string' ? <Txt size={14}>{left}</Txt> : left}
      {right}
    </View>
  );
}

function Ghost({ label, onPress, height = 40 }: { label: string; onPress: () => void; height?: number }) {
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        height: s(height),
        paddingHorizontal: s(height > 40 ? 22 : 12),
        borderRadius: 999,
        borderWidth: 1,
        borderColor: alpha(colors.glow, 0.4),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt size={13} weight={600} color={colors.glow}>
        {label}
      </Txt>
    </Press>
  );
}

function Mini({ value, onDec, onInc, labels }: { value: string; onDec: () => void; onInc: () => void; labels: [string, string] }) {
  const btn = (glyph: string, label: string, onPress: () => void) => (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        width: s(34),
        height: s(34),
        borderRadius: s(17),
        borderWidth: 1,
        borderColor: alpha(colors.glow, 0.4),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt size={18} weight={600} color={colors.glow}>
        {glyph}
      </Txt>
    </Press>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
      {btn('−', labels[0], onDec)}
      <Txt size={14} weight={700} tabular>
        {value}
      </Txt>
      {btn('+', labels[1], onInc)}
    </View>
  );
}

function Cta({ label, onPress, disabled, arrow }: { label: string; onPress: () => void; disabled?: boolean; arrow?: boolean }) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{
        flex: 1,
        height: s(52),
        borderRadius: 999,
        flexDirection: 'row',
        gap: s(8),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: 'linear-gradient(90deg, #A8F3F8, #7FE3EC, #2FB6C6)',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Txt size={15} weight={600} color={colors.base}>
        {label}
      </Txt>
      {arrow ? <Icon name="arrowRight" size={18} strokeWidth={2.2} color={colors.base} /> : null}
    </Press>
  );
}

// ------------------------------------------------------------------ PIN keypad
function Keypad({
  title,
  sub,
  err,
  pin,
  busy,
  onKey,
  onForgot,
}: {
  title: string;
  sub: string;
  err: string;
  pin: string;
  busy: boolean;
  onKey: (k: string) => void;
  onForgot?: () => void;
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  return (
    <Fade style={{ flex: 1, alignItems: 'center', gap: s(18), paddingTop: s(90), paddingHorizontal: s(28) }}>
      <View
        style={{
          width: s(64),
          height: s(64),
          borderRadius: s(32),
          backgroundColor: alpha(colors.glow, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="lock" size={28} color={colors.glow} />
      </View>
      <Txt family="outfit" size={26} weight={500}>
        {title}
      </Txt>
      <Txt size={14} color={err ? colors.dangerText : colors.muted} accessibilityLiveRegion="polite">
        {err || sub}
      </Txt>
      <View style={{ flexDirection: 'row', gap: s(16), marginTop: s(6), marginBottom: s(18), height: s(16) }}>
        {busy ? (
          <Spinner size={16} width={2} track={alpha(colors.glow, 0.2)} color={colors.glow} />
        ) : (
          [0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                width: s(16),
                height: s(16),
                borderRadius: s(8),
                borderWidth: 1.5,
                borderColor: colors.glow,
                backgroundColor: i < pin.length ? colors.glow : 'transparent',
              }}
            />
          ))
        )}
      </View>
      <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: s(10) }}>
        {keys.map((k, i) => (
          <Press
            key={i}
            disabled={!k || busy}
            onPress={() => onKey(k)}
            accessibilityLabel={k === '⌫' ? 'Delete' : k || undefined}
            style={{
              width: '31%',
              flexGrow: 1,
              height: s(62),
              borderRadius: s(18),
              backgroundColor: k ? colors.card : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Txt family="outfit" size={24} weight={500}>
              {k}
            </Txt>
          </Press>
        ))}
      </View>
      {onForgot ? (
        <Press noScale onPress={onForgot} style={{ paddingVertical: s(8) }}>
          <Txt size={13} color={colors.glow}>
            Forgot PIN? Contact CINZO
          </Txt>
        </Press>
      ) : null}
    </Fade>
  );
}

// ------------------------------------------------------------------ steps
function StepCount({ d, dispatch, max, ports }: StepProps & { max: number }) {
  const legend: [string, string][] = [
    ['Semi tank valves', `V1–V${ports.valves}`],
    ['Semi tank sensors', `S1–S${ports.sensors}`],
    ...(ports.phe ? ([['PHE line valve', 'PHE']] as [string, string][]) : []),
    ...(ports.main ? ([['Main tank sensor', 'MAIN']] as [string, string][]) : []),
    ['Pump', 'PUMP'],
  ];
  const btn = (glyph: string, label: string, n: number) => (
    <Press
      onPress={() => dispatch({ type: 'count', n })}
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
  return (
    <FadeUp style={{ gap: s(12) }}>
      <Txt size={15} color={colors.muted}>
        How many semi tanks are connected?
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(28), paddingVertical: s(26) }}>
        {btn('−', 'One less', d.n - 1)}
        <Txt family="outfit" size={72} weight={500} tabular style={{ minWidth: s(60), textAlign: 'center', lineHeight: s(80) }}>
          {String(d.n)}
        </Txt>
        {btn('+', 'One more', d.n + 1)}
      </View>
      <Card>
        <Label>This controller</Label>
        {legend.map(([k, v]) => (
          <Row key={k} left={k} right={<PortTag>{v}</PortTag>} />
        ))}
      </Card>
      <Txt size={12} color={colors.muted} style={{ lineHeight: s(18) }}>
        {`Tank 1 uses S1 and V1, tank 2 uses S2 and V2, and so on. Up to ${max} tanks.`}
      </Txt>
    </FadeUp>
  );
}

function StepTanks({ d, dispatch, ports }: StepProps) {
  const errs = tankErrors(d, ports);
  return (
    <>
      {d.tanks.slice(0, d.n).map((t, i) => (
        <FadeUp key={i} step={Math.min(i, 6)}>
          <Card>
            <Row
              left={
                <Txt size={15} weight={700}>
                  {`Tank ${i + 1}`}
                </Txt>
              }
              right={
                <View style={{ flexDirection: 'row', gap: s(6) }}>
                  <PortTag>{`S${i + 1}`}</PortTag>
                  <PortTag>{`V${i + 1}`}</PortTag>
                </View>
              }
            />
            <TextInput
              defaultValue={t.name ?? ''}
              placeholder={`Tank ${i + 1}`}
              placeholderTextColor={colors.dim}
              maxLength={TANK_NAME_MAX}
              autoCapitalize="words"
              accessibilityLabel="Tank name"
              onChangeText={(v) => dispatch({ type: 'tank', i, patch: { name: v.trim() || null } })}
              selectionColor={colors.glow}
              style={{
                height: s(44),
                borderRadius: s(12),
                borderWidth: 1,
                borderColor: alpha(colors.glow, 0.3),
                backgroundColor: colors.deepCard,
                color: colors.text,
                paddingHorizontal: s(12),
                fontSize: s(15),
                ...font(500),
              }}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(6) }}>
              {SIZE_CHIPS.map((l) => {
                const on = t.litres === l;
                return (
                  <Press
                    key={l}
                    onPress={() => dispatch({ type: 'tank', i, patch: { litres: on ? null : l } })}
                    accessibilityState={{ selected: on }}
                    style={{
                      height: s(32),
                      paddingHorizontal: s(12),
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: on ? colors.lightTeal : alpha(colors.glow, 0.3),
                      backgroundColor: on ? colors.lightTeal : 'transparent',
                      justifyContent: 'center',
                    }}
                  >
                    <Txt size={12} weight={600} color={on ? colors.white : colors.muted}>
                      {`${fmtNum(l)} L`}
                    </Txt>
                  </Press>
                );
              })}
            </View>
            <Row
              left="Sensor"
              right={
                <Toggle value={t.sensor} onChange={(v) => dispatch({ type: 'tank', i, patch: { sensor: v } })} label="Sensor" />
              }
            />
            <Row
              left="Valve"
              right={<Toggle value={t.valve} onChange={(v) => dispatch({ type: 'tank', i, patch: { valve: v } })} label="Valve" />}
            />
            {!t.sensor ? (
              <Row
                left="Fill time (no sensor)"
                right={
                  <Mini
                    value={`${t.fillMin ?? 10} min`}
                    labels={['Less time', 'More time']}
                    onDec={() => dispatch({ type: 'fillMin', i, delta: -FILL_STEP })}
                    onInc={() => dispatch({ type: 'fillMin', i, delta: FILL_STEP })}
                  />
                }
              />
            ) : null}
            {!t.sensor ? (
              <Txt size={12} color={colors.muted}>
                Fit an overflow pipe on this tank.
              </Txt>
            ) : null}
            {errs[i] ? (
              <View style={{ paddingVertical: s(10), paddingHorizontal: s(12), borderRadius: s(12), backgroundColor: alpha(colors.dangerText, 0.12) }}>
                <Txt size={12} color={colors.dangerText}>
                  {errs[i]}
                </Txt>
              </View>
            ) : null}
          </Card>
        </FadeUp>
      ))}
    </>
  );
}

function StepExtras({ d, dispatch, ports }: StepProps) {
  const title = (t: string, sub: string) => (
    <View style={{ gap: s(3), flex: 1 }}>
      <Txt size={14} weight={700}>
        {t}
      </Txt>
      <Txt size={12} color={colors.muted}>
        {sub}
      </Txt>
    </View>
  );
  return (
    <>
      <FadeUp>
        <Card>
          <Row
            left={title('Main tank sensor', ports.main ? 'Port MAIN · protects the pump' : 'Not on this controller')}
            right={
              ports.main ? (
                <Toggle value={d.mainOn} onChange={(on) => dispatch({ type: 'main', on })} label="Main tank sensor" />
              ) : null
            }
          />
          {d.mainOn ? (
            <Row
              left="Stop the pump below"
              right={
                <Mini
                  value={`${d.minPct}%`}
                  labels={['Lower', 'Higher']}
                  onDec={() => dispatch({ type: 'minPct', delta: -MIN_PCT_STEP })}
                  onInc={() => dispatch({ type: 'minPct', delta: MIN_PCT_STEP })}
                />
              }
            />
          ) : null}
        </Card>
      </FadeUp>
      <FadeUp step={1}>
        <Card>
          <Row
            left={title('PHE line', ports.phe ? 'Port PHE · public water supply' : 'Not on this controller')}
            right={ports.phe ? <Toggle value={d.pheOn} onChange={(on) => dispatch({ type: 'phe', on })} label="PHE line" /> : null}
          />
          {d.pheOn ? (
            <Txt size={12} color={colors.muted} style={{ lineHeight: s(18) }}>
              Fit a check valve on the PHE line and on the pump line.
            </Txt>
          ) : null}
        </Card>
      </FadeUp>
    </>
  );
}

function StepWiring({ d }: StepProps) {
  const detected = useDevice((st) => st.state?.detected ?? null);
  const online = useDevice((st) => st.online);
  const testPort = useDevice((st) => st.testPort);
  const [tested, setTested] = useState<Record<string, boolean>>({});
  const sensors = sensorChecksOf(d, online ? detected : null);
  return (
    <>
      <FadeUp>
        <Card>
          <Label>Sensors</Label>
          {sensors.length === 0 ? (
            <Txt size={13} color={colors.muted}>
              No sensors in this setup.
            </Txt>
          ) : null}
          {sensors.map((c) => (
            <Row
              key={c.port}
              left={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), flex: 1 }}>
                  <PortTag>{c.port}</PortTag>
                  <Txt size={14} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {c.name}
                  </Txt>
                </View>
              }
              right={
                <Txt
                  size={13}
                  weight={700}
                  color={c.state === 'ok' ? colors.glow : c.state === 'bad' ? colors.dangerText : colors.muted}
                >
                  {c.state === 'ok' ? 'Found ✓' : c.state === 'bad' ? 'No answer — check cable' : 'Waiting…'}
                </Txt>
              }
            />
          ))}
        </Card>
      </FadeUp>
      <FadeUp step={1}>
        <Card>
          <Label>Valves and pump</Label>
          {outputsOf(d).map((o) => (
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
                  height={32}
                  label={tested[o.port] ? 'Clicked ✓' : 'Test'}
                  onPress={() => {
                    testPort(o.port as TestPort);
                    setTested((t) => ({ ...t, [o.port]: true }));
                  }}
                />
              }
            />
          ))}
          <Txt size={12} color={colors.muted} style={{ lineHeight: s(18) }}>
            Tap Test and listen for the click. The pump test runs 2 seconds.
          </Txt>
        </Card>
      </FadeUp>
    </>
  );
}

function StepSource({ d, dispatch }: StepProps) {
  const modes = modesOf(d).map((m) => ({ key: m.k, label: m.label }));
  return (
    <FadeUp style={{ gap: s(12) }}>
      <Txt size={15} color={colors.muted}>
        Where should the water come from?
      </Txt>
      <Segmented height={42} options={modes} value={d.mode} onChange={(mode: Mode) => dispatch({ type: 'mode', mode })} />
      <Txt size={13} color={colors.muted} style={{ lineHeight: s(20) }}>
        {modeHelp(d.mode, d.pheOn)}
      </Txt>
      <Card>
        <Label>Summary</Label>
        {summaryRows(d).map((r) => (
          <Row
            key={r.k}
            left={
              <Txt size={14} color={colors.muted}>
                {r.k}
              </Txt>
            }
            right={
              <Txt size={14} weight={700}>
                {r.v}
              </Txt>
            }
          />
        ))}
      </Card>
    </FadeUp>
  );
}

type StepProps = {
  d: Draft;
  dispatch: (a: Action) => void;
  ports: ReturnType<typeof portsOf>;
};

// ------------------------------------------------------------------ screen
export default function Setup() {
  const insets = useSafeAreaInsets();
  const deviceId = useSession((st) => st.deviceId);
  const info = useDevice((st) => st.info);
  const config = useDevice((st) => st.config);
  const online = useDevice((st) => st.online);
  const showToast = useUi((st) => st.showToast);
  const ports = portsOf(info);

  const [phase, setPhase] = useState<Phase>('loading');
  const [pinMode, setPinMode] = useState<PinMode>('enter');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [newPin, setNewPin] = useState<string | undefined>();
  const [pinErr, setPinErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [doneNote, setDoneNote] = useState('');
  const [draft, dispatchRaw] = useReducer(
    (d: Draft, a: Action | { type: 'reset'; d: Draft }) => (a.type === 'reset' ? a.d : reduce(d, a, ports)),
    undefined,
    () => draftFrom(config, ports),
  );
  const dispatch = useCallback((a: Action) => dispatchRaw(a), []);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const exit = useCallback(() => {
    if (deviceId) void backend().endSetup(deviceId);
    go('home');
  }, [deviceId]);

  // Which keypad: set a PIN (first setup) or enter it.
  useEffect(() => {
    if (!deviceId) return;
    let stop = false;
    backend()
      .pinStatus(deviceId)
      .then((st) => {
        if (stop) return;
        setPinMode(st === 'none' ? 'new' : 'enter');
        setPhase('pin');
      })
      .catch(() => {
        if (stop) return;
        showToast('Could not reach the server');
        go('home');
      });
    return () => {
      stop = true;
    };
  }, [deviceId, showToast]);

  const startWizard = () => {
    dispatchRaw({ type: 'reset', d: draftFrom(useDevice.getState().config, ports) });
    setStep(0);
    setPhase('wizard');
  };

  const onKey = (k: string) => {
    if (k === '⌫') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + k).slice(0, 4);
    setPin(next);
    setPinErr('');
    if (next.length < 4) return;
    setTimeout(async () => {
      if (!alive.current || !deviceId) return;
      setPin('');
      if (pinMode === 'new') {
        setFirstPin(next);
        setPinMode('confirm');
        return;
      }
      if (pinMode === 'confirm') {
        if (next !== firstPin) {
          setPinErr('PINs do not match. Try again.');
          setPinMode('new');
          return;
        }
        setNewPin(next);
        startWizard();
        return;
      }
      setBusy(true);
      const ok = await backend()
        .verifyPin(deviceId, next)
        .catch(() => false);
      if (!alive.current) return;
      setBusy(false);
      if (ok) startWizard();
      else setPinErr('Wrong PIN');
    }, 180);
  };

  const save = async () => {
    if (!deviceId) return;
    const cfg = draftToConfig(draft);
    setPhase('saving');
    try {
      await backend().saveSetup(deviceId, cfg, newPin);
    } catch {
      if (!alive.current) return;
      showToast('Could not save. Enter the PIN again.');
      setPhase('pin');
      setPinMode(newPin ? 'new' : 'enter');
      return;
    }
    void backend().endSetup(deviceId);
    // Wait for the controller to report the new layout.
    const want = cfg.semi.length;
    const t0 = Date.now();
    while (alive.current && Date.now() - t0 < CONFIRM_MS) {
      const st = useDevice.getState();
      if (!st.online) break;
      if (st.state?.semi.length === want) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!alive.current) return;
    const st = useDevice.getState();
    setDoneNote(
      !st.online
        ? 'The controller picks it up when it is online.'
        : st.state?.semi.length === want
          ? 'The controller is updated — no re-flash needed.'
          : 'Saved. The controller has not confirmed yet — check it is online.',
    );
    setPhase('done');
  };

  const back = useCallback(() => {
    if (phase === 'wizard' && step > 0) setStep((x) => x - 1);
    else exit();
  }, [phase, step, exit]);

  const blocked = stepBlocked(draft, step, ports);

  return (
    <Screen onBack={back} contentStyle={{ paddingBottom: insets.bottom }}>
      {phase === 'loading' || phase === 'saving' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: s(14) }}>
          <Spinner size={28} width={3} track={alpha(colors.glow, 0.2)} color={colors.glow} />
          <Txt size={14} color={colors.muted}>
            {phase === 'saving' ? 'Saving…' : !deviceId ? 'Waiting for the controller…' : 'Loading…'}
          </Txt>
        </View>
      ) : null}

      {phase === 'pin' ? (
        <Keypad
          title="Installer setup"
          sub={
            pinMode === 'enter'
              ? 'Enter the installer PIN'
              : pinMode === 'new'
                ? 'Choose a 4-digit installer PIN'
                : 'Enter the PIN again'
          }
          err={pinErr}
          pin={pin}
          busy={busy}
          onKey={onKey}
          onForgot={
            pinMode === 'enter'
              ? () => {
                  if (extra.SUPPORT_WHATSAPP) Linking.openURL(extra.SUPPORT_WHATSAPP).catch(() => {});
                }
              : undefined
          }
        />
      ) : null}

      {phase === 'done' ? (
        <Fade style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: s(16), paddingHorizontal: s(28) }}>
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
            Saved
          </Txt>
          <Txt size={14} color={colors.muted} style={{ textAlign: 'center', lineHeight: s(21) }}>
            {`${summaryText(draft)}\n${doneNote}`}
          </Txt>
          <View style={{ flexDirection: 'row', marginTop: s(12), alignSelf: 'stretch' }}>
            <Cta label="Go to Home" onPress={() => go('home')} />
          </View>
        </Fade>
      ) : null}

      {phase === 'wizard' ? (
        <View style={{ flex: 1 }}>
          <View style={{ paddingTop: Math.max(s(52), insets.top + s(12)), paddingHorizontal: s(16), paddingBottom: s(12), gap: s(12) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt family="outfit" size={26} weight={500} accessibilityRole="header">
                {STEP_TITLES[step]}
              </Txt>
              <Txt size={12} color={colors.muted}>{`Step ${step + 1} of 5`}</Txt>
            </View>
            <View style={{ flexDirection: 'row', gap: s(6) }}>
              {STEP_TITLES.map((_, i) => (
                <View
                  key={i}
                  style={{ flex: 1, height: s(4), borderRadius: s(4), backgroundColor: i <= step ? colors.glow : alpha(colors.glow, 0.15) }}
                />
              ))}
            </View>
            {!online ? (
              <Txt size={12} color={colors.warningLight}>
                Controller is offline. You can save now; tests need it online.
              </Txt>
            ) : null}
          </View>
          <ScrollView
            key={step}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: s(16), paddingTop: s(6), paddingBottom: s(20), gap: s(12) }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {step === 0 ? <StepCount d={draft} dispatch={dispatch} ports={ports} max={maxTanksOf(ports)} /> : null}
            {step === 1 ? <StepTanks d={draft} dispatch={dispatch} ports={ports} /> : null}
            {step === 2 ? <StepExtras d={draft} dispatch={dispatch} ports={ports} /> : null}
            {step === 3 ? <StepWiring d={draft} dispatch={dispatch} ports={ports} /> : null}
            {step === 4 ? <StepSource d={draft} dispatch={dispatch} ports={ports} /> : null}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: s(10), paddingHorizontal: s(16), paddingTop: s(14), paddingBottom: Math.max(s(26), insets.bottom + s(12)) }}>
            <Ghost label={step > 0 ? 'Back' : 'Cancel'} onPress={back} height={52} />
            <Cta
              label={step === 4 ? 'Save' : 'Next'}
              arrow
              disabled={blocked}
              onPress={() => (step === 4 ? void save() : setStep((x) => x + 1))}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
