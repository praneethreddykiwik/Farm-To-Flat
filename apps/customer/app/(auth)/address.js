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
  };
  return (
    <Screen edges={['top']}>
      <Animated.View
        entering={FadeInDown.duration(420).springify().damping(18)}
        style={{ marginTop: 20, marginBottom: 20 }}
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
      {/* Back out of the flow (sign in with a different number). The address step has no header, so
          this is the only way back — return to the sign-in screen. */}
      <Pressy
        onPress={back}
        haptics="select"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingVertical: 16,
        }}
        accessibilityLabel="Go back to sign in"
      >
        <ArrowLeft size={16} color={colors.ink3} />
        <Small muted>Back to sign in</Small>
      </Pressy>
    </Screen>
  );
}
