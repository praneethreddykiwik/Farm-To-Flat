import React, { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Phone } from 'lucide-react-native';
import { Ambient, Body, Button, Display, Glass, Input, Pressy, Small } from '../src/ui';
import { useRequestMobileChangeMutation, useVerifyMobileChangeMutation } from '../src/api/api';
import { showToast } from '../src/features/ui/uiSlice';
import { customerUpdated } from '../src/features/auth/authSlice';
import { checkMobile } from '../src/lib/validators';
import { useSlowHint, WAKING_MESSAGE } from '../src/hooks/useSlowHint';
import { colors, fonts, radius } from '../src/theme';

/**
 * Change the mobile number without losing the account.
 *
 * The old flow simply signed you out and sent you back through sign-in, so you returned as a new
 * customer and were asked for your community and address again — your orders, addresses and wallet
 * left behind on the previous number. Here the account stays put: the server verifies a code sent to
 * the NEW number and moves the same customer onto it, session intact.
 */
export default function ChangeMobile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const current = useSelector((s) => s.auth.customer?.mobile);

  const [step, setStep] = useState('NUMBER'); // NUMBER → CODE
  const [next, setNext] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const codeRef = useRef(null);

  const [requestChange, { isLoading: sending }] = useRequestMobileChangeMutation();
  const [verifyChange, { isLoading: verifying }] = useVerifyMobileChangeMutation();
  const slow = useSlowHint(sending || verifying);

  const valid = !checkMobile(next) && next !== current;

  const send = async () => {
    const err = checkMobile(next);
    if (err) return setError(err);
    if (next === current) return setError('That is already your number.');
    setError(null);
    try {
      await requestChange({ mobile: next }).unwrap();
      setStep('CODE');
      setTimeout(() => codeRef.current?.focus(), 120);
    } catch (e) {
      setError(e?.message || 'Could not send the code. Try again.');
    }
  };

  const verify = async (value) => {
    const otp = String(value ?? code).trim();
    if (otp.length !== 6) return;
    setError(null);
    try {
      const res = await verifyChange({ mobile: next, otp }).unwrap();
      // Keep the signed-in customer in step so the profile shows the new number straight away.
      if (res?.customer?.mobile) dispatch(customerUpdated({ mobile: res.customer.mobile }));
      dispatch(
        showToast({
          title: 'Number updated',
          message: 'Sign in with this number from now on.',
          tone: 'success',
        }),
      );
      router.back();
    } catch (e) {
      setCode('');
      setError(e?.message || 'That code is not right.');
    }
  };

  return (
    <View style={styles.root}>
      <Ambient intensity={0.7} />
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20 }}>
        <Pressy
          onPress={() => router.back()}
          haptics="select"
          accessibilityLabel="Back"
          style={{ alignSelf: 'flex-start' }}
        >
          <Glass radius={radius.pill} innerStyle={styles.iconBtn}>
            <ArrowLeft size={20} color={colors.ink} />
          </Glass>
        </Pressy>

        <Animated.View entering={FadeInDown.duration(380)} style={{ marginTop: 22 }}>
          <Small muted>{step === 'NUMBER' ? 'STEP 1 OF 2' : 'STEP 2 OF 2'}</Small>
          <Display style={{ marginTop: 6 }}>
            {step === 'NUMBER' ? 'New mobile number' : 'Enter the code'}
          </Display>
          <Body muted style={{ marginTop: 8 }}>
            {step === 'NUMBER'
              ? 'Your orders, addresses and wallet all stay exactly where they are — only the number you sign in with changes.'
              : `We sent a 6-digit code to +91 ${next}.`}
          </Body>
        </Animated.View>

        {step === 'NUMBER' ? (
          <Animated.View entering={FadeInDown.delay(80).duration(380)} style={{ marginTop: 28 }}>
            <Input
              label="Mobile number"
              value={next}
              onChangeText={(t) => {
                setNext(t.replace(/\D/g, '').slice(0, 10));
                if (error) setError(null);
              }}
              placeholder="9876543210"
              keyboardType="number-pad"
              maxLength={10}
              error={error}
              leading={<Phone size={18} color={colors.ink3} />}
              autoFocus
            />
            <Button
              title="Send code"
              onPress={send}
              loading={sending}
              disabled={!valid}
              style={{ marginTop: 20 }}
            />
            <Small muted center style={{ marginTop: 10 }}>
              Currently +91 {current}
            </Small>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.delay(80).duration(380)} style={{ marginTop: 28 }}>
            <TextInput
              ref={codeRef}
              value={code}
              onChangeText={(t) => {
                const v = t.replace(/\D/g, '').slice(0, 6);
                setCode(v);
                if (error) setError(null);
                if (v.length === 6) verify(v);
              }}
              keyboardType="number-pad"
              maxLength={6}
              style={styles.codeInput}
              placeholder="······"
              placeholderTextColor={colors.ink3}
              accessibilityLabel="Verification code"
            />
            {error ? (
              <Small style={{ color: colors.tomato, marginTop: 10 }} center>
                {error}
              </Small>
            ) : null}
            <Button
              title="Confirm"
              onPress={() => verify()}
              loading={verifying}
              disabled={code.length !== 6}
              style={{ marginTop: 20 }}
            />
            <Pressy
              onPress={() => {
                setStep('NUMBER');
                setCode('');
                setError(null);
              }}
              haptics="select"
              style={{ paddingVertical: 14 }}
            >
              <Small center color={colors.leafDeep}>
                Use a different number
              </Small>
            </Pressy>
          </Animated.View>
        )}

        {slow ? (
          <Small muted center style={{ marginTop: 12 }}>
            {WAKING_MESSAGE}
          </Small>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  codeInput: {
    fontFamily: fonts.display,
    fontSize: 32,
    letterSpacing: 10,
    textAlign: 'center',
    color: colors.ink,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: 16,
  },
});
