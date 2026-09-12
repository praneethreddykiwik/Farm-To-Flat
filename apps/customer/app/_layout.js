import '../global.css';
import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import {
  Fraunces_500Medium_Italic,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { store } from '../src/store';
import { colors } from '../src/theme';
import { ToastHost } from '../src/ui';
import { KeyboardDoneBar } from '../src/ui/KeyboardDone';
import { useSessionBootstrap } from '../src/hooks/useSession';
import { selectAuth } from '../src/features/auth/authSlice';
import {
  roleResolved,
  roleResolveFailed,
  selectEffectiveRole,
  selectRoleState,
} from '../src/features/role/roleSlice';
import { adminApi } from '../src/lib/adminApi';
import { configureNotifications, registerForPush } from '../src/lib/notifications';
import { useRegisterDeviceMutation } from '../src/api/api';
import { useReducedMotionSync } from '../src/hooks/useReducedMotion';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions?.({ duration: 320, fade: true });

/**
 * Route guard. Three states: booting (splash stays), signed out (auth group only),
 * signed in without an address (address capture), signed in (everything else).
 */
function AuthGate({ ready }) {
  const auth = useSelector(selectAuth);
  const roleState = useSelector(selectRoleState);
  const role = useSelector(selectEffectiveRole);
  const segments = /** @type {any} */ (useSegments());
  const router = useRouter();
  const dispatch = useDispatch();
  const [registerDevice] = useRegisterDeviceMutation();
  const pushDone = useRef(false);

  // Register this phone for order push-notifications once after sign-in (asks permission, gets the
  // Expo token, hands it to the server). Fail-open — a denied permission just means no push.
  useEffect(() => {
    if (auth.status !== 'signedIn' || pushDone.current) return;
    pushDone.current = true;
    registerForPush()
      .then((token) => token && registerDevice({ expoPushToken: token }))
      .catch(() => {});
  }, [auth.status, registerDevice]);

  // Resolve the staff role for the signed-in number (once). Fail-open to "customer" on any error /
  // timeout so the app never gets stuck if the API is unreachable.
  useEffect(() => {
    if (auth.status !== 'signedIn' || roleState.resolved || !auth.customer?.mobile) return;
    let alive = true;
    const t = setTimeout(() => alive && dispatch(roleResolveFailed()), 3500);
    adminApi
      .resolveRole(auth.customer.mobile)
      .then((r) => alive && dispatch(roleResolved(r)))
      .catch(() => alive && dispatch(roleResolveFailed()))
      .finally(() => clearTimeout(t));
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [auth.status, auth.customer, roleState.resolved, dispatch]);

  useEffect(() => {
    if (!ready || auth.status === 'booting') return;
    const inAuth = segments[0] === '(auth)';
    const inStaff = segments[0] === 'staff';
    if (auth.status === 'signedOut') {
      if (!inAuth) router.replace('/(auth)/welcome');
      return;
    }
    // hold routing until we know the role (dev override counts as resolved), so a staff number
    // never flashes the shopping app.
    if (!role.resolved) return;

    const r = role.role;
    if (r === 'PROCUREMENT') {
      if (segments[1] !== 'procurement') router.replace('/staff/procurement');
      return;
    }
    if (r === 'FULFILMENT') {
      if (segments[1] !== 'fulfilment') router.replace('/staff/fulfilment');
      return;
    }
    if (r === 'ADMIN') {
      if (!inStaff) router.replace('/staff/console');
      return;
    }
    if (r === 'SUPER_ADMIN') {
      // Land on the ops console straight after sign-in, but then let the super admin use the WHOLE
      // shopping app — the tab group AND its detail routes (calendar, product, cart, order, checkout).
      // The old check bounced them back to the console the moment they left the tab group, so tapping
      // the calendar (a top-level route) kicked them out. Only redirect from the auth screens now.
      if (inAuth) router.replace('/staff/console');
      return;
    }
    if (!r) {
      // normal customer — needs a delivery address before shopping
      const needsAddress = auth.customer && !auth.customer.hasAddress;
      if (needsAddress) {
        if (segments[1] !== 'address') router.replace('/(auth)/address');
        return;
      }
    }
    if (inAuth) router.replace('/(tabs)');
  }, [ready, auth.status, auth.customer, role.role, role.resolved, segments, router]);

  useEffect(() => {
    if (ready && auth.status !== 'booting') SplashScreen.hideAsync().catch(() => {});
  }, [ready, auth.status]);

  return null;
}

function Root() {
  useSessionBootstrap();
  useReducedMotionSync();
  const [fontsLoaded, fontError] = /** @type {any} */ (
    useFonts({
      Fraunces_500Medium_Italic,
      Fraunces_600SemiBold,
      Fraunces_700Bold,
      IBMPlexSans_400Regular,
      IBMPlexSans_500Medium,
      IBMPlexSans_600SemiBold,
      IBMPlexMono_500Medium,
    })
  );
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    configureNotifications();
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <AuthGate ready={ready} />
      {ready ? (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.canvas },
            animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
            // Freeze a screen once another is pushed over it: no background renders/animations
            // stacking up as the user drills in and out. Kept responsive on heavy navigation.
            freezeOnBlur: true,
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="staff" />
          <Stack.Screen
            name="product/[id]"
            options={{ animation: 'fade', animationDuration: 220 }}
          />
          <Stack.Screen
            name="cart"
            options={{
              presentation: Platform.OS === 'ios' ? 'formSheet' : 'modal',
              sheetAllowedDetents: [0.92],
              sheetGrabberVisible: false,
              sheetCornerRadius: 32,
              contentStyle: { backgroundColor: 'transparent' },
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen name="checkout" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen
            name="order/success"
            options={{ animation: 'fade', gestureEnabled: false }}
          />
          <Stack.Screen name="order/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
          {/* Pushed, not presented: iOS will not stack a modal over the basket's form sheet. */}
          <Stack.Screen name="coupon" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="confirm/[date]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="calendar" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="search" options={{ animation: 'fade' }} />
          <Stack.Screen
            name="address/new"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
        </Stack>
      ) : null}
      <ToastHost />
      <KeyboardDoneBar />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Provider store={store}>
          <BottomSheetModalProvider>
            <Root />
          </BottomSheetModalProvider>
        </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.canvas } });
