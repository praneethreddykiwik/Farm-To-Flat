import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ArrowLeft } from 'lucide-react-native';
import { Body, Button, Display, Glass, Pressy, Screen, Small, Text } from '../../src/ui';
import { colors, fonts, radius } from '../../src/theme';
import { useRequestOtpMutation, useVerifyOtpMutation } from '../../src/api/api';
import { selectAuth, signedIn } from '../../src/features/auth/authSlice';
import { saveRefreshToken } from '../../src/features/auth/secure';
import { showToast } from '../../src/features/ui/uiSlice';
import { haptic } from '../../src/lib/haptics';

const LEN = 6;

export default function OtpScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { pendingMobile } = useSelector(selectAuth);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [seconds, setSeconds] = useState(30);
  const [verify, { isLoading }] = useVerifyOtpMutation();
  const [resend, { isLoading: resending }] = useRequestOtpMutation();
  const input = useRef(null);
  const submitting = useRef(false);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const blink = useSharedValue(1);
  useEffect(() => {
    blink.value = withRepeat(
      withSequence(withTiming(0, { duration: 500 }), withTiming(1, { duration: 500 })),
      -1,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const blinkStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  useEffect(() => {
    if (code.length === LEN && !isLoading) submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const submit = async (otp) => {
    if (!pendingMobile) {
      router.replace('/(auth)/phone');
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    try {
      const res = await verify({ mobile: pendingMobile, otp }).unwrap();
      await saveRefreshToken(res.refreshToken);
      haptic.success();
      dispatch(signedIn({ accessToken: res.accessToken, customer: res.customer }));
      // AuthGate routes to address capture or home
    } catch (e) {
      haptic.error();
      setError(e?.message || 'That code is not right');
      shake.value = withSequence(
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 50 }),
        withTiming(-6, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
      setCode('');
      setTimeout(() => input.current?.focus(), 50);
    } finally {
      submitting.current = false;
    }
  };

  const doResend = async () => {
    try {
      const res = await resend({ mobile: pendingMobile }).unwrap();
      setSeconds(30);
      setError(null);
      if (res?.devOtp)
        dispatch(
          showToast({
            title: `Your code: ${res.devOtp}`,
            message: 'Test number — no message is sent to it',
            tone: 'neutral',
            duration: 5000,
          }),
        );
      else dispatch(showToast({ title: 'Code sent again', tone: 'success' }));
    } catch (e) {
      dispatch(showToast({ title: e?.message || 'Could not resend', tone: 'error' }));
    }
  };

  const digits = Array.from({ length: LEN }, (_, i) => code[i] || '');

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Pressy
          onPress={() => router.back()}
          haptics="select"
          style={styles.back}
          accessibilityLabel="Back"
        >
          <Glass radius={radius.pill} innerStyle={styles.backInner}>
            <ArrowLeft size={20} color={colors.ink} />
          </Glass>
        </Pressy>

        <Animated.View
          entering={FadeInDown.duration(420).springify().damping(18)}
          style={{ marginTop: 32 }}
        >
          <Small muted>STEP 2 OF 2</Small>
          <Display style={{ marginTop: 6 }}>Enter the code</Display>
          <Body muted style={{ marginTop: 8 }}>
            Sent to +91 {pendingMobile?.replace(/(\d{5})(\d{5})/, '$1 $2')}.{' '}
            <Text variant="bodyMedium" color={colors.leafDeep} onPress={() => router.back()}>
              Change
            </Text>
          </Body>
        </Animated.View>

        <Pressy
          onPress={() => input.current?.focus()}
          haptics="none"
          scale={1}
          style={{ marginTop: 28 }}
          accessibilityLabel="One-time code"
        >
          <View style={styles.boxRow}>
            <Animated.View style={[styles.boxes, shakeStyle]}>
              {digits.map((d, i) => {
                const active = i === code.length;
                return (
                  <Glass
                    key={i}
                    radius={radius.md}
                    elevated={active}
                    style={styles.boxWrap}
                    innerStyle={[styles.box, active && styles.boxActive, error && styles.boxError]}
                  >
                    {d ? <Text style={styles.digit}>{d}</Text> : null}
                    {active && !d ? <Animated.View style={[styles.caret, blinkStyle]} /> : null}
                  </Glass>
                );
              })}
            </Animated.View>
            {/* Invisible input laid OVER the boxes: transparent text + hidden native caret so
                Android never shows its blinking cursor (caretHidden alone is unreliable there).
                Covering the whole row also makes every box tappable. */}
            <TextInput
              ref={input}
              value={code}
              onChangeText={(t) => {
                setError(null);
                setCode(t.replace(/\D/g, '').slice(0, LEN));
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              autoFocus
              maxLength={LEN}
              caretHidden
              selectionColor="transparent"
              cursorColor="transparent"
              underlineColorAndroid="transparent"
              style={styles.overlayInput}
            />
          </View>
        </Pressy>
        {error ? (
          <Small color={colors.tomato} style={{ marginTop: 10 }}>
            {error}
          </Small>
        ) : null}

        <View style={{ flex: 1 }} />
        <Animated.View entering={FadeInDown.delay(160).duration(420).springify().damping(18)}>
          <Button
            title="Verify"
            onPress={() => submit(code)}
            loading={isLoading}
            disabled={code.length !== LEN}
          />
          <View style={styles.resendRow}>
            {seconds > 0 ? (
              <Small muted>Resend in {seconds}s</Small>
            ) : (
              <Pressy onPress={doResend} haptics="select" disabled={resending}>
                <Text variant="smallMedium" color={colors.leafDeep}>
                  {resending ? 'Sending…' : 'Resend code'}
                </Text>
              </Pressy>
            )}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', marginTop: 8 },
  backInner: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  boxRow: { position: 'relative' },
  boxes: { flexDirection: 'row', gap: 8 },
  boxWrap: { flex: 1 },
  box: { height: 60, alignItems: 'center', justifyContent: 'center' },
  boxActive: { borderWidth: 1.5, borderColor: colors.leaf },
  boxError: { borderWidth: 1.5, borderColor: colors.tomato },
  digit: { fontFamily: fonts.mono, fontSize: 24, color: colors.ink },
  // Absolutely centered so it lines up exactly regardless of sibling text — the box's own
  // alignItems/justifyContent only centers a single child reliably, not a conditional pair.
  caret: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -12,
    marginLeft: -1,
    width: 2,
    height: 24,
    backgroundColor: colors.leaf,
    borderRadius: 1,
  },
  // Fills the boxes exactly; text is transparent (digits render in the boxes behind) and the caret
  // is hidden, so there is no stray blinking line on Android.
  overlayInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 0,
    color: 'transparent',
    textAlign: 'center',
    fontSize: 1,
  },
  resendRow: { alignItems: 'center', marginTop: 14 },
});
