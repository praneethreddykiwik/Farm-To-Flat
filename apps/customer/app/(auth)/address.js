import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Body, Display, Screen, Small } from '../../src/ui';
import { AddressForm } from '../../src/components/AddressForm';
import { selectCustomer } from '../../src/features/auth/authSlice';

export default function AddressCapture() {
  const router = useRouter();
  const customer = useSelector(selectCustomer);
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
    </Screen>
  );
}
