import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '../../src/theme';

/** Staff experience (super admin / admin / procurement / fulfilment). Not the customer shop. */
export default function StaffLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="console" />
      <Stack.Screen name="orders" />
      <Stack.Screen name="procurement" />
      <Stack.Screen name="fulfilment" />
      <Stack.Screen name="approvals" />
    </Stack>
  );
}
