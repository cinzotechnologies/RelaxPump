import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { BackButton } from '@/components/BackButton';
import { Fade, FadeUp } from '@/components/FadeUp';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { TextField, type TextFieldRef } from '@/components/TextField';
import { backend } from '@/services';
import { AuthError } from '@/services/backend';
import { go } from '@/state/nav';
import { useUi } from '@/state/ui';
import { alpha, colors, s, Txt } from '@/theme';

const schema = z.object({
  name: z.string().trim().max(40),
  phone: z.string().regex(/^\d{10}$/),
  pass: z.string().min(6),
});
type Form = z.infer<typeof schema>;
type Mode = 'in' | 'up';

function Label({ children }: { children: string }) {
  return (
    <Txt size={12} color={colors.muted}>
      {children}
    </Txt>
  );
}

function FieldError({ children }: { children: string }) {
  return (
    <Fade>
      <Txt size={12} color={colors.dangerText}>
        {children}
      </Txt>
    </Fade>
  );
}

export default function Auth() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('in');
  const [show, setShow] = useState(false);
  const [serverErr, setServerErr] = useState('');
  const phoneRef = useRef<TextFieldRef>(null);
  const passRef = useRef<TextFieldRef>(null);
  const showToast = useUi((st) => st.showToast);
  const openSheet = useUi((st) => st.openSheet);
  const signUp = mode === 'up';

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitted },
    clearErrors,
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: '', phone: '', pass: '' } });

  const submit = handleSubmit(async (f) => {
    setServerErr('');
    try {
      if (signUp) await backend().signUp(f.name.trim(), f.phone, f.pass);
      else await backend().signIn(f.phone, f.pass);
      showToast(signUp ? 'Account created' : 'Signed in');
      // The auth gate in _layout moves to Home. A new account with no controller opens Bluetooth setup.
      if (signUp) setTimeout(() => openSheet('ble'), 700);
    } catch (e) {
      setServerErr(e instanceof AuthError ? e.message : 'Something went wrong. Try again.');
    }
  });

  return (
    <Screen onBack={() => go('welcome')}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: Math.max(s(56), insets.top + s(12)),
            paddingHorizontal: s(20),
            paddingBottom: Math.max(s(36), insets.bottom + s(16)),
            gap: s(22),
          }}
        >
          <BackButton onPress={() => go('welcome')} />
          <FadeUp style={{ gap: s(4) }}>
            <Txt size={24} weight={700} tracking={-0.5} accessibilityRole="header">
              {signUp ? 'Create account' : 'Welcome back'}
            </Txt>
            <Txt size={14} color={colors.muted}>
              {signUp ? 'It takes a minute.' : 'Sign in to your tanks.'}
            </Txt>
          </FadeUp>
          <FadeUp step={1}>
            <Segmented
              options={[
                { key: 'in', label: 'Sign in' },
                { key: 'up', label: 'Sign up' },
              ]}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setServerErr('');
                clearErrors();
              }}
            />
          </FadeUp>
          <FadeUp step={2} style={{ gap: s(12) }}>
            {signUp ? (
              <Fade style={{ gap: s(6) }}>
                <Label>Name</Label>
                <Controller
                  control={control}
                  name="name"
                  render={({ field }) => (
                    <TextField
                      value={field.value}
                      onChangeText={field.onChange}
                      placeholder="Your name"
                      autoComplete="name"
                      textContentType="name"
                      returnKeyType="next"
                      onSubmitEditing={() => phoneRef.current?.focus()}
                    />
                  )}
                />
              </Fade>
            ) : null}

            <View style={{ gap: s(6) }}>
              <Label>Phone</Label>
              <View style={{ flexDirection: 'row', gap: s(8) }}>
                <View
                  style={{
                    height: s(46),
                    paddingHorizontal: s(12),
                    borderRadius: s(14),
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: alpha(colors.glow, 0.14),
                    justifyContent: 'center',
                  }}
                >
                  <Txt size={15}>+91</Txt>
                </View>
                <Controller
                  control={control}
                  name="phone"
                  render={({ field }) => (
                    <TextField
                      ref={phoneRef}
                      value={field.value}
                      onChangeText={(t) => field.onChange(t.replace(/\D/g, '').slice(0, 10))}
                      keyboardType="number-pad"
                      placeholder="10-digit number"
                      autoComplete="tel"
                      textContentType="telephoneNumber"
                      tracking={0.5}
                      style={{ flex: 1, minWidth: 0 }}
                      returnKeyType="next"
                      onSubmitEditing={() => passRef.current?.focus()}
                    />
                  )}
                />
              </View>
              {isSubmitted && errors.phone ? <FieldError>Enter a 10-digit number</FieldError> : null}
            </View>

            <View style={{ gap: s(6) }}>
              <Label>Password</Label>
              <View>
                <Controller
                  control={control}
                  name="pass"
                  render={({ field }) => (
                    <TextField
                      ref={passRef}
                      value={field.value}
                      onChangeText={field.onChange}
                      secureTextEntry={!show}
                      placeholder="At least 6 characters"
                      autoComplete={signUp ? 'new-password' : 'current-password'}
                      textContentType={signUp ? 'newPassword' : 'password'}
                      style={{ paddingRight: s(46) }}
                      returnKeyType="go"
                      onSubmitEditing={() => submit()}
                    />
                  )}
                />
                <Press
                  noScale
                  onPress={() => setShow((v) => !v)}
                  accessibilityLabel={show ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: s(2),
                    top: 1,
                    width: s(44),
                    height: s(44),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="eye" size={18} strokeWidth={1.8} color={colors.muted} />
                </Press>
              </View>
              {isSubmitted && errors.pass ? <FieldError>Use at least 6 characters</FieldError> : null}
              {serverErr ? <FieldError>{serverErr}</FieldError> : null}
            </View>

            {!signUp ? (
              <Press
                noScale
                onPress={() => openSheet('forgot')}
                style={{ alignSelf: 'flex-end', paddingVertical: s(4) }}
              >
                <Txt size={13} color={colors.glow}>
                  Forgot password?
                </Txt>
              </Press>
            ) : null}
          </FadeUp>
          <View style={{ flex: 1 }} />
          <FadeUp step={3}>
            <PrimaryButton
              label={signUp ? 'Sign up' : 'Sign in'}
              height={50}
              glow
              loading={isSubmitting}
              onPress={() => submit()}
            />
          </FadeUp>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
