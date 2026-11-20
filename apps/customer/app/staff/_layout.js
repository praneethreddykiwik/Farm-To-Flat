import React from 'react';
import { Redirect, Stack, useSegments } from 'expo-router';
import { useSelector } from 'react-redux';
import { colors } from '../../src/theme';
import { selectAuth } from '../../src/features/auth/authSlice';
import { selectEffectiveRole } from '../../src/features/role/roleSlice';
import { staffAccess, staffHomeFor } from '../../src/lib/staffAccess';

/** Staff experience (super admin / admin / procurement / fulfilment). Not the customer shop. */
export default function StaffLayout() {
  const auth = useSelector(selectAuth);
  const role = useSelector(selectEffectiveRole);
  const segments = /** @type {any} */ (useSegments());
  // Review #47 (21 Nov 2026): these screens were reachable by deep link for any signed-in number.
  // Nothing renders until the role is known, and a number without the right role is sent home.
  const access = staffAccess({
    signedIn: auth.status === 'signedIn',
    resolved: !!role.resolved,
    role: role.role,
    section: segments[1],
  });
  if (access === 'wait') return null;
  if (access === 'deny') return <Redirect href={/** @type {any} */ (staffHomeFor(role.role))} />;
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
      <Stack.Screen name="notes" />
      <Stack.Screen name="complaints" />
    </Stack>
  );
}
