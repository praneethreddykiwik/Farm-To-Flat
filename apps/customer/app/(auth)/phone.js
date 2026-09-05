import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Phone } from 'lucide-react-native';
import { Body, Button, Display, Glass, Input, Pressy, Screen, Small, Text } from '../../src/ui';
import { colors, fonts, radius } from '../../src/theme';
import { useRequestOtpMutation } from '../../src/api/api';
import { setPendingMobile } from '../../src/features/auth/authSlice';
import { showToast } from '../../src/features/ui/uiSlice';
import { haptic } from '../../src/lib/haptics';

export default function PhoneScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState(null);
  const [requestOtp, { isLoading }] = useRequestOtpMutation();
  const input = useRef(null);
  const valid = /^[6-9]\d{9}$/.test(mobile);

  const submit = async () => {
    if (!valid) {
      setError('Enter a 10-digit Indian mobile number');
      haptic.warning();
      return;
    }
    try {
      const res = await requestOtp({ mobile }).unwrap();
      dispatch(setPendingMobile(mobile));
      if (res?.devOtp)
        dispatch(
          showToast({
            title: `Dev OTP: ${res.devOtp}`,
            message: 'Mock server — MSG91 not wired yet',
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
            We’ll text you a 6-digit code. This is also the number our delivery partner will call
            from the gate.
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
              setMobile(t.replace(/\D/g, '').slice(0, 10));
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
          <Button title="Send code" onPress={submit} loading={isLoading} disabled={!valid} />
          <Small muted center style={{ marginTop: 12 }}>
            By continuing you agree to our terms and privacy policy.
          </Small>
        </Animated.View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
