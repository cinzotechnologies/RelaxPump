// Installer setup (reference/design-v2/AppSetup.dc.html): PIN keypad → 5 steps → Saved.
// The same wizard sets up a PHE board (docs/two-module-system.md §5.2): lines instead of tanks,
// reopen/close instead of the main tank, valves only. Which board: useUi.setupFor.
import Constants from 'expo-constants';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Linking, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fade, FadeUp } from '@/components/FadeUp';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { Screen } from '@/components/Screen';
import { Spinner } from '@/components/Spinner';
import { Toggle } from '@/components/Toggle';
import { Card, Cta, Ghost, Label, Mini, PortTag, Row } from '@/features/setup/parts';
import { fmtNum, TANK_NAME_MAX } from '@/logic/format';
import { MAX_TANKS } from '@/model/layout';
import type { TestPort } from '@/model/types';
import { backend } from '@/services';
import { useDevice } from '@/state/device';
import { useFleet } from '@/state/fleet';
import { usePhe } from '@/state/phe';
import { go } from '@/state/nav';
import {
  countHelp,
  depthOf,
  DIST_STEP,
  draftFrom,
  draftFromPhe,
  draftToConfig,
  draftToPhe,
  HEIGHT_DEFAULT,
  HEIGHT_STEP,
  levelAt,
  MIN_PCT_STEP,
  PHE_PCT_STEP,
  PHE_STEP_TITLES,
  outputsOf,
  reduce,
  sensorChecksOf,
  SIZE_CHIPS,
  STEP_TITLES,
  summaryRows,
  summaryText,
  tankPorts,
  type Action,
  type Draft,
} from '@/state/setup';
import { useUi } from '@/state/ui';
import { alpha, colors, font, s, Txt } from '@/theme';

const extra = (Constants.expoConfig?.extra ?? {}) as { SUPPORT_WHATSAPP?: string };
const CONFIRM_MS = 20_000;

type Phase = 'loading' | 'pin' | 'wizard' | 'saving' | 'done';
type PinMode = 'enter' | 'new' | 'confirm';

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
function StepCount({ d, dispatch }: StepProps) {
  const legend: [string, string][] = d.phe
    ? [
        ['PHE line sensors', `T1–T${d.max}`],
        ['PHE line valves', `V1–V${d.max}`],
      ]
    : [
        ['Semi tanks (sensor + valve)', `T1–T${d.max}`],
        ['Main tank sensor', 'MAIN'],
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
        {d.phe ? 'How many PHE lines are connected?' : 'How many semi tanks are connected?'}
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
        {btn('−', 'One less', d.n - 1)}
        <Txt
          family="outfit"
          size={72}
          weight={500}
          tabular
          style={{ minWidth: s(60), textAlign: 'center', lineHeight: s(80) }}
        >
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
      <Txt size={12} color={colors.muted} style={{ lineHeight: s(18) }} accessibilityLiveRegion="polite">
        {countHelp(d)}
      </Txt>
      {d.max < MAX_TANKS ? (
        <Txt size={12} color={colors.warningLight} style={{ lineHeight: s(18) }}>
          {`This controller's firmware supports ${d.max} ${d.phe ? 'lines' : 'tanks'}. Update it for up to ${MAX_TANKS}.`}
        </Txt>
      ) : null}
    </FadeUp>
  );
}

/**
 * Tank height and where the sensor sits: the level % (and the litres shown) come from these, and
 * tanks differ, so each one is entered. Live reading to check it, or to set "empty" exactly.
 */
function SensorRows({ d, dispatch, i }: StepProps & { i: number }) {
  const t = d.tanks[i];
  const depth = depthOf(t);
  const hhLive = useDevice((st) => (st.online ? (st.state?.cm[i] ?? null) : null));
  const pheLive = usePhe((st) => (st.online ? (st.state?.cm[i] ?? null) : null));
  const live = d.phe ? pheLive : hhLive;
  return (
    <>
      <Row
        left={
          <View style={{ flex: 1, gap: s(2) }}>
            <Txt size={14}>Tank height</Txt>
            <Txt size={11} color={colors.muted}>
              Bottom to the full water line
            </Txt>
          </View>
        }
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
            <TextInput
              key={`depth-${i}-${depth}`}
              defaultValue={String(depth)}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
              accessibilityLabel={`Tank ${i + 1} height in centimetres`}
              onEndEditing={(e) => {
                const cm = parseInt(e.nativeEvent.text.replace(/\D/g, ''), 10);
                if (cm > 0) dispatch({ type: 'depth', i, cm });
              }}
              selectionColor={colors.glow}
              style={{
                width: s(64),
                height: s(40),
                borderRadius: s(12),
                borderWidth: 1,
                borderColor: alpha(colors.glow, 0.3),
                backgroundColor: colors.deepCard,
                color: colors.text,
                textAlign: 'center',
                fontSize: s(15),
                ...font(600),
              }}
            />
            <Txt size={13} color={colors.muted}>
              cm
            </Txt>
          </View>
        }
      />
      <Row
        left="Sensor above full water"
        right={
          <Mini
            value={`${t.fullCm} cm`}
            labels={['Less', 'More']}
            onDec={() => dispatch({ type: 'gap', i, cm: t.fullCm - DIST_STEP })}
            onInc={() => dispatch({ type: 'gap', i, cm: t.fullCm + DIST_STEP })}
          />
        }
      />
      {live !== null ? (
        <>
          <Txt size={12} color={colors.muted}>
            {`Sensor reads ${Math.round(live)} cm now → ${levelAt(t, live)}%${
              t.litres ? ` (${fmtNum(Math.round((levelAt(t, live) * t.litres) / 100))} L)` : ''
            }`}
          </Txt>
          <Ghost
            label="Tank is empty now: use this reading"
            onPress={() => dispatch({ type: 'emptyAt', i, cm: live })}
          />
        </>
      ) : (
        <Txt size={12} color={colors.dim}>
          {`No reading from port T${i + 1} yet. Measure with a tape from the sensor face.`}
        </Txt>
      )}
    </>
  );
}

function StepTanks({ d, dispatch }: StepProps) {
  return (
    <>
      {d.tanks.slice(0, d.n).map((t, i) => (
        <FadeUp key={i} step={Math.min(i, 6)}>
          <Card>
            <Row
              left={
                <Txt size={15} weight={700}>
                  {`${d.phe ? 'PHE line' : 'Tank'} ${i + 1}`}
                </Txt>
              }
              right={<PortTag>{tankPorts(d, i)}</PortTag>}
            />
            <TextInput
              defaultValue={t.name ?? ''}
              placeholder={`${d.phe ? 'Line' : 'Tank'} ${i + 1}`}
              placeholderTextColor={colors.dim}
              maxLength={TANK_NAME_MAX}
              autoCapitalize="words"
              accessibilityLabel={d.phe ? 'Line name' : 'Tank name'}
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
            {d.phe ? null : (
              <Row
                left="Height above the main tank"
                right={
                  <Mini
                    value={`${t.heightFt ?? HEIGHT_DEFAULT} ft`}
                    labels={['Lower', 'Higher']}
                    onDec={() => dispatch({ type: 'height', i, delta: -HEIGHT_STEP })}
                    onInc={() => dispatch({ type: 'height', i, delta: HEIGHT_STEP })}
                  />
                }
              />
            )}
            <SensorRows d={d} dispatch={dispatch} i={i} />
          </Card>
        </FadeUp>
      ))}
    </>
  );
}

function StepMain({ d, dispatch }: StepProps) {
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
    <FadeUp>
      <Card>
        <Row
          left={title('Main tank sensor', 'Port MAIN · protects the pump')}
          right={
            <Toggle
              value={d.mainOn}
              onChange={(on) => dispatch({ type: 'main', on })}
              label="Main tank sensor"
            />
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
  );
}

/** PHE step 3: Auto fill opens a line's valve below "reopen" and closes it at "close". */
function StepPheLevels({ d, dispatch }: StepProps) {
  return (
    <FadeUp style={{ gap: s(12) }}>
      <Card>
        <Row
          left={
            <View style={{ flex: 1, gap: s(3) }}>
              <Txt size={14} weight={700}>
                Reopen below
              </Txt>
              <Txt size={12} color={colors.muted}>
                Auto fill opens the valve when the tank drops below this
              </Txt>
            </View>
          }
          right={
            <Mini
              value={`${d.low}%`}
              labels={['Lower', 'Higher']}
              onDec={() => dispatch({ type: 'pheLow', delta: -PHE_PCT_STEP })}
              onInc={() => dispatch({ type: 'pheLow', delta: PHE_PCT_STEP })}
            />
          }
        />
        <Row
          left={
            <View style={{ flex: 1, gap: s(3) }}>
              <Txt size={14} weight={700}>
                Close at
              </Txt>
              <Txt size={12} color={colors.muted}>
                The valve closes here, also when opened by hand
              </Txt>
            </View>
          }
          right={
            <Mini
              value={`${d.high}%`}
              labels={['Lower', 'Higher']}
              onDec={() => dispatch({ type: 'pheHigh', delta: -PHE_PCT_STEP })}
              onInc={() => dispatch({ type: 'pheHigh', delta: PHE_PCT_STEP })}
            />
          }
        />
      </Card>
      <Txt size={12} color={colors.muted} style={{ lineHeight: s(18) }}>
        PHE water comes at its own times. A high reopen level keeps the tanks topped up whenever it flows.
        Valves close by themselves on a power cut.
      </Txt>
    </FadeUp>
  );
}

function StepWiring({ d }: StepProps) {
  const hhDetected = useDevice((st) => st.state?.detected ?? null);
  const hhOnline = useDevice((st) => st.online);
  const hhTest = useDevice((st) => st.testPort);
  const pheDetected = usePhe((st) => st.state?.detected ?? null);
  const pheOnline = usePhe((st) => st.online);
  const pheTest = usePhe((st) => st.testValve);
  const detected = d.phe ? pheDetected : hhDetected;
  const online = d.phe ? pheOnline : hhOnline;
  const testPort = (port: TestPort) => (d.phe ? pheTest(Number(port.slice(1)) - 1) : hhTest(port));
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
                  color={
                    c.state === 'ok' ? colors.glow : c.state === 'bad' ? colors.dangerText : colors.muted
                  }
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
          <Label>{d.phe ? 'Valves' : 'Valves and pump'}</Label>
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
            {d.phe
              ? 'Tap Test and listen for the valve click.'
              : 'Tap Test and listen for the click. The pump test runs 2 seconds.'}
          </Txt>
        </Card>
      </FadeUp>
    </>
  );
}

function StepSave({ d }: StepProps) {
  return (
    <FadeUp style={{ gap: s(12) }}>
      <Txt size={15} color={colors.muted}>
        Check and save. You can change this later with the installer PIN.
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
};

// ------------------------------------------------------------------ screen
export default function Setup() {
  const insets = useSafeAreaInsets();
  const setupFor = useUi((st) => st.setupFor);
  const hhId = useFleet((f) => f.householdId);
  const pheId = useFleet((f) => f.pheId);
  const phe = setupFor === 'phe';
  const deviceId = phe ? pheId : hhId;
  const hhInfo = useDevice((st) => st.info);
  const pheInfo = usePhe((st) => st.info);
  const config = useDevice((st) => st.config);
  const hhOnline = useDevice((st) => st.online);
  const pheOnline = usePhe((st) => st.online);
  const info = phe ? pheInfo : hhInfo;
  const online = phe ? pheOnline : hhOnline;
  const titles = phe ? PHE_STEP_TITLES : STEP_TITLES;
  const showToast = useUi((st) => st.showToast);
  const maxTanks = info?.maxTanks ?? MAX_TANKS;

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
    (d: Draft, a: Action | { type: 'reset'; d: Draft }) => (a.type === 'reset' ? a.d : reduce(d, a)),
    undefined,
    () => (phe ? draftFromPhe(usePhe.getState().config, maxTanks) : draftFrom(config, maxTanks)),
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
    dispatchRaw({
      type: 'reset',
      d: phe
        ? draftFromPhe(usePhe.getState().config, usePhe.getState().info?.maxTanks ?? MAX_TANKS)
        : draftFrom(useDevice.getState().config, useDevice.getState().info?.maxTanks ?? MAX_TANKS),
    });
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
    setPhase('saving');
    try {
      if (phe) await backend().savePheSetup(deviceId, draftToPhe(draft), newPin);
      else await backend().saveSetup(deviceId, draftToConfig(draft), newPin);
    } catch {
      if (!alive.current) return;
      showToast('Could not save. Enter the PIN again.');
      setPhase('pin');
      setPinMode(newPin ? 'new' : 'enter');
      return;
    }
    void backend().endSetup(deviceId);
    // Wait for the controller to report the new layout.
    const want = draft.n;
    const live = () => (phe ? usePhe.getState() : useDevice.getState());
    const t0 = Date.now();
    while (alive.current && Date.now() - t0 < CONFIRM_MS) {
      const st = live();
      if (!st.online) break;
      if (st.state?.tanks.length === want) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!alive.current) return;
    const st = live();
    setDoneNote(
      !st.online
        ? 'The controller picks it up when it is online.'
        : st.state?.tanks.length === want
          ? 'The controller is updated — no re-flash needed.'
          : 'Saved. The controller has not confirmed yet — check it is online.',
    );
    setPhase('done');
  };

  const back = useCallback(() => {
    if (phase === 'wizard' && step > 0) setStep((x) => x - 1);
    else exit();
  }, [phase, step, exit]);

  return (
    <Screen onBack={back} contentStyle={{ paddingBottom: insets.bottom }}>
      {phase === 'loading' && !deviceId ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: s(10), padding: s(24) }}>
          <Txt size={16} weight={600} style={{ textAlign: 'center' }}>
            No controller yet
          </Txt>
          <Txt size={14} color={colors.muted} style={{ textAlign: 'center' }}>
            First add the controller with Add device on Home. Installer setup opens after that.
          </Txt>
        </View>
      ) : phase === 'loading' || phase === 'saving' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: s(14) }}>
          <Spinner size={28} width={3} track={alpha(colors.glow, 0.2)} color={colors.glow} />
          <Txt size={14} color={colors.muted}>
            {phase === 'saving' ? 'Saving…' : 'Loading…'}
          </Txt>
        </View>
      ) : null}

      {phase === 'pin' ? (
        <Keypad
          title={phe ? 'PHE setup' : 'Installer setup'}
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
        <Fade
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: s(16),
            paddingHorizontal: s(28),
          }}
        >
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
          <View
            style={{
              paddingTop: Math.max(s(52), insets.top + s(12)),
              paddingHorizontal: s(16),
              paddingBottom: s(12),
              gap: s(12),
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt family="outfit" size={26} weight={500} accessibilityRole="header">
                {titles[step]}
              </Txt>
              <Txt size={12} color={colors.muted}>{`Step ${step + 1} of 5`}</Txt>
            </View>
            <View style={{ flexDirection: 'row', gap: s(6) }}>
              {titles.map((_, i) => (
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
            {!online ? (
              <Txt size={12} color={colors.warningLight}>
                Controller is offline. You can save now; tests need it online.
              </Txt>
            ) : null}
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
            {step === 0 ? <StepCount d={draft} dispatch={dispatch} /> : null}
            {step === 1 ? <StepTanks d={draft} dispatch={dispatch} /> : null}
            {step === 2 && !phe ? <StepMain d={draft} dispatch={dispatch} /> : null}
            {step === 2 && phe ? <StepPheLevels d={draft} dispatch={dispatch} /> : null}
            {step === 3 ? <StepWiring d={draft} dispatch={dispatch} /> : null}
            {step === 4 ? <StepSave d={draft} dispatch={dispatch} /> : null}
          </ScrollView>
          <View
            style={{
              flexDirection: 'row',
              gap: s(10),
              paddingHorizontal: s(16),
              paddingTop: s(14),
              paddingBottom: Math.max(s(26), insets.bottom + s(12)),
            }}
          >
            <Ghost label={step > 0 ? 'Back' : 'Cancel'} onPress={back} height={52} />
            <Cta
              label={step === 4 ? 'Save' : 'Next'}
              arrow
              onPress={() => (step === 4 ? void save() : setStep((x) => x + 1))}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
