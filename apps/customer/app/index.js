import React from 'react';
import { Redirect } from 'expo-router';
import { useSelector } from 'react-redux';
import { View } from 'react-native';
import { selectAuth } from '../src/features/auth/authSlice';
import { Ambient } from '../src/ui';

/** Entry: the AuthGate in _layout does the real routing; this only picks a sensible first target. */
export default function Index() {
  const auth = useSelector(selectAuth);
  // 'reconnecting' too: a stored session is still being restored, so this must not send anyone to
  // the login screen (review #41, 21 Nov 2026).
  if (auth.status === 'booting' || auth.status === 'reconnecting') {
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
