import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Check, Phone } from 'lucide-react-native';
import { Body, Button, Display, Glass, Input, Pressy, Screen, Small, Text } from '../../src/ui';
import { colors, fonts, radius } from '../../src/theme';
import { useRequestOtpMutation } from '../../src/api/api';
import { useSlowHint, WAKING_MESSAGE } from '../../src/hooks/useSlowHint';
import { setPendingMobile } from '../../src/features/auth/authSlice';
import { selectLanguage, showToast } from '../../src/features/ui/uiSlice';
import { t } from '../../src/lib/i18n';
import { NOTICE_VERSION, setSignupConsent } from '../../src/lib/consent';
import { haptic } from '../../src/lib/haptics';
import { checkMobile, cleanMobile, isMobileValid } from '../../src/lib/validators';

export default function PhoneScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState(null);
  // DPDP §6 and §9: consent is a clear action (two unticked boxes), not "by continuing you agree".
  const [agreed, setAgreed] = useState(false);
  const [adult, setAdult] = useState(false);
  const lang = useSelector(selectLanguage);
  const [requestOtp, { isLoading }] = useRequestOtpMutation();
  // A tester's very first tap is the one most likely to land on a sleeping server.
  const slow = useSlowHint(isLoading);
  const input = useRef(null);
  const valid = isMobileValid(mobile);

  const submit = async () => {
    const problem = checkMobile(mobile);
    if (problem) {
      setError(problem);
      haptic.warning();
      return;
    }
    if (!agreed || !adult) {
      haptic.warning();
      dispatch(showToast({ title: t('consentNeeded', lang), tone: 'neutral' }));
      return;
    }
    setSignupConsent({ version: NOTICE_VERSION, adult: true });
    try {
      const res = await requestOtp({ mobile }).unwrap();
      dispatch(setPendingMobile(mobile));
      if (res?.devOtp)
        dispatch(
          showToast({
            title: `Your code: ${res.devOtp}`,
            message: 'Test number — no message is sent to it',
            tone: 'neutral',
            duration: 5000,
          }),
        );
      router.push('/(auth)/otp');
    } catch (e) {
      haptic.error();
      setError(e?.message || 'Could not send the code');
    }
  };

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
          <Small muted>STEP 1 OF 2</Small>
          <Display style={{ marginTop: 6 }}>What’s your number?</Display>
          <Body muted style={{ marginTop: 8 }}>
            We’ll send a 6-digit code to this number on WhatsApp. It is also the number our delivery
            partner will call from the gate.
          </Body>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(90).duration(420).springify().damping(18)}
          style={{ marginTop: 28 }}
        >
          <Input
            ref={input}
            label="Mobile number"
            value={mobile}
            onChangeText={(t) => {
              setError(null);
              setMobile(cleanMobile(t));
            }}
            keyboardType="number-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            autoFocus
            maxLength={10}
            placeholder="98480 00000"
            error={error}
            mono
            leading={
              <View style={styles.prefix}>
                <Phone size={16} color={colors.ink3} />
                <Text variant="bodyMedium" color={colors.ink2} style={{ fontFamily: fonts.mono }}>
                  +91
                </Text>
              </View>
            }
            onSubmitEditing={submit}
            returnKeyType="done"
          />
        </Animated.View>

        <View style={{ flex: 1 }} />
        <Animated.View entering={FadeInDown.delay(160).duration(420).springify().damping(18)}>
          <Tick
            checked={agreed}
            onPress={() => setAgreed((v) => !v)}
            label={t('consentAgree', lang)}
          />
          <Tick
            checked={adult}
            onPress={() => setAdult((v) => !v)}
            label={t('consentAdult', lang)}
          />
          <Button
            title="Send code"
            onPress={submit}
            loading={isLoading}
            disabled={!valid || !agreed || !adult}
            style={{ marginTop: 12 }}
          />
          {slow ? (
            <Small muted center style={{ marginTop: 12 }}>
              {WAKING_MESSAGE}
            </Small>
          ) : null}
          <View style={styles.links}>
            <Pressy
              onPress={() =>
                Linking.openURL(`https://fooducia.health/privacy?lang=${lang}`).catch(() => {})
              }
              haptics="select"
            >
              <Small style={styles.link}>{t('privacyPolicy', lang)}</Small>
            </Pressy>
            <Pressy
              onPress={() =>
                Linking.openURL(`https://fooducia.health/terms?lang=${lang}`).catch(() => {})
              }
              haptics="select"
            >
              <Small style={styles.link}>{t('termsOfUse', lang)}</Small>
            </Pressy>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** One consent box. Unticked until the customer ticks it. */
function Tick({ checked, onPress, label }) {
  return (
    <Pressy
      onPress={onPress}
      haptics="select"
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <View style={styles.tick}>
        <View style={[styles.box, checked && styles.boxOn]}>
          {checked ? <Check size={15} color={colors.inkOnDark} strokeWidth={3} /> : null}
        </View>
        <Small style={{ flex: 1 }}>{label}</Small>
      </View>
    </Pressy>
  );
}

const styles = StyleSheet.create({
  tick: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.ink3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.leafDeep, borderColor: colors.leafDeep },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 14 },
  link: { color: colors.leafDeep, textDecorationLine: 'underline' },
  back: { alignSelf: 'flex-start', marginTop: 8 },
  backInner: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  prefix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 8,
    borderRightWidth: 1,
    borderRightColor: colors.hairline,
  },
});
