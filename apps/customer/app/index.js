import React from 'react';
import { Redirect } from 'expo-router';
import { useSelector } from 'react-redux';
import { View } from 'react-native';
import { selectAuth } from '../src/features/auth/authSlice';
import { Ambient } from '../src/ui';

/** Entry: the AuthGate in _layout does the real routing; this only picks a sensible first target. */
export default function Index() {
  const auth = useSelector(selectAuth);
  if (auth.status === 'booting') {
    return (
      <View style={{ flex: 1 }}>
        <Ambient />
      </View>
    );
  }
  if (auth.status === 'signedIn') {
    return <Redirect href={auth.customer?.hasAddress ? '/(tabs)' : '/(auth)/address'} />;
  }
  return <Redirect href="/(auth)/welcome" />;
}
