import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft } from 'lucide-react-native';
import { Body, Display, Pressy, Screen, Small } from '../../src/ui';
import { AddressForm } from '../../src/components/AddressForm';
import { selectCustomer, signedOut } from '../../src/features/auth/authSlice';
import { clearRefreshToken } from '../../src/features/auth/secure';
import { api, useLogoutMutation } from '../../src/api/api';
import { colors } from '../../src/theme';

export default function AddressCapture() {
  const router = useRouter();
  const dispatch = useDispatch();
  const customer = useSelector(selectCustomer);
  const [logout] = useLogoutMutation();
  // Back = return to the sign-in screen instantly. We do NOT await the server logout here: on a cold
  // Render server that call hangs ~50s and the button would feel dead. Clear the local session now
  // (the route guard sends us to /welcome) and invalidate the token server-side in the background.
  const back = () => {
    logout().catch(() => {});
    clearRefreshToken().catch(() => {});
    dispatch(signedOut());
    dispatch(api.util.resetApiState());
    // Straight back to the number, not to welcome. Someone who reaches this screen and realises
    // they typed the wrong mobile wants to retype it — sending them to the marketing screen makes
    // them walk welcome → phone → code again to fix one digit.
    router.replace('/(auth)/phone');
  };
  return (
    <Screen edges={['top']}>
      {/* The form below is its own ScrollView, and this heading sits above it rather than inside
          it. Without an opaque ground the scrolled fields showed THROUGH the heading — which is
          what reads as "Where do we deliver? is overlapped". */}
      {/* Pinned above the form, not below it. This used to sit under a flex:1 scroll area, so on a
          short screen — or any screen with the keyboard up — it was pushed out of sight and the
          step read as a dead end with no way back to change the number. */}
      <Pressy
        onPress={back}
        haptics="select"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingTop: 8,
          paddingBottom: 4,
          alignSelf: 'flex-start',
        }}
        accessibilityLabel="Go back and use a different number"
      >
        <ArrowLeft size={16} color={colors.ink3} />
        <Small muted>Use a different number</Small>
      </Pressy>
      <Animated.View
        entering={FadeInDown.duration(420).springify().damping(18)}
        style={{
          marginTop: 12,
          marginBottom: 20,
          backgroundColor: colors.canvas,
          zIndex: 2,
        }}
      >
        <Small muted>ALMOST THERE</Small>
        <Display style={{ marginTop: 6 }}>Where do we deliver?</Display>
        <Body muted style={{ marginTop: 8 }}>
          Your block and flat, so the bag reaches the right door on the first try.
        </Body>
      </Animated.View>
      <View style={{ flex: 1 }}>
        <AddressForm
          defaultName={customer?.name}
          mobile={customer?.mobile}
          onSaved={() => router.replace('/(tabs)')}
        />
      </View>
    </Screen>
  );
}
