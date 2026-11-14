import '../global.css';
import { initSentry } from '../src/lib/sentry';

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { hydrateHousehold } from '../src/features/household/householdSlice';
import { BrandIntro } from '../src/components/BrandIntro';
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
import * as Notifications from 'expo-notifications';
import { store } from '../src/store';
import { colors } from '../src/theme';
import { ToastHost } from '../src/ui';
import { StatusScrim } from '../src/components/StatusScrim';
import { FlyToBagHost } from '../src/components/FlyToBag';
import { KeyboardDoneBar } from '../src/ui/KeyboardDone';
import { useSessionBootstrap } from '../src/hooks/useSession';
import { selectAuth } from '../src/features/auth/authSlice';
import {
  ROLE_META,
  roleResolved,
  roleResolveFailed,
  selectEffectiveRole,
  selectRoleState,
} from '../src/features/role/roleSlice';
import { adminApi } from '../src/lib/adminApi';
import { env } from '../src/lib/env';
import { configureNotifications, registerForPush } from '../src/lib/notifications';
import { useRegisterDeviceMutation } from '../src/api/api';
import { useReducedMotionSync } from '../src/hooks/useReducedMotion';
import { useOrderLiveNotification } from '../src/hooks/useOrderLiveNotification';
import { useMealReminders } from '../src/hooks/useMealReminders';
import { routeForNotification } from '../src/lib/notificationRoutes';
import { hydrateLanguage, readSavedLanguage } from '../src/features/ui/uiSlice';

// ESM imports are hoisted, so this still runs before any component renders — which is the point:
// a crash during the first render is exactly the one worth catching.
initSentry();

SplashScreen.preventAutoHideAsync().catch(() => {});
// Short: the system splash hands over to BrandIntro, which carries on from the same plain screen.
SplashScreen.setOptions?.({ duration: 160, fade: true });

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

  // Restore the saved reading language once the app is running, rather than while the slice module
  // is still evaluating — storage is not necessarily ready that early.
  useEffect(() => {
    const saved = readSavedLanguage();
    if (saved) dispatch(hydrateLanguage(saved));
    dispatch(hydrateHousehold());
  }, [dispatch]);

  // Register this phone for order push-notifications once after sign-in (asks permission, gets the
  // Expo token, hands it to the server). Fail-open — a denied permission just means no push.
  useEffect(() => {
    if (auth.status !== 'signedIn') {
      pushDone.current = false; // re-register for the next account on this phone
      return;
    }
    if (pushDone.current) return;
    pushDone.current = true;
    registerForPush()
      .then((token) => token && registerDevice({ expoPushToken: token }))
      .catch(() => {});
  }, [auth.status, registerDevice]);

  // Resolve the staff role for the signed-in number (once). Render's free tier cold-starts (~50s),
  // so a single short timeout used to fail-open to "customer" and mis-route a staff number into the
  // shop whenever the server was asleep. Now we retry with a generous per-attempt timeout and only
  // fall back to customer after several genuine failures — a staff login survives a cold start.
  useEffect(() => {
    if (auth.status !== 'signedIn' || roleState.resolved || !auth.customer?.mobile) return;
    // On mocks there is no server to ask, and the real one must not be asked on a mock session's
    // behalf: it answered 401 four times over ten seconds while the app sat on "Signing you in…".
    // The role comes from EXPO_PUBLIC_MOCK_ROLE instead (nothing set = a customer).
    if (env.useMocks) {
      const role = ROLE_META[env.mockRole] ? env.mockRole : null;
      dispatch(
        roleResolved(
          role
            ? {
                isStaff: true,
                role,
                roleLabel: ROLE_META[role].label,
                sections: ROLE_META[role].sections,
                aiAccess: ROLE_META[role].ai,
              }
            : { isStaff: false },
        ),
      );
      return;
    }
    let alive = true;
    const withTimeout = (p, ms) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    (async () => {
      for (let attempt = 0; attempt < 4 && alive; attempt++) {
        try {
          const r = await withTimeout(adminApi.resolveRole(), 25000);
          if (alive) dispatch(roleResolved(r));
          return;
        } catch {
          if (!alive) return;
          await new Promise((res) => setTimeout(res, 2500)); // brief pause, server is likely warming
        }
      }
      if (alive) dispatch(roleResolveFailed()); // truly unreachable → treat as a normal customer
    })();
    return () => {
      alive = false;
    };
  }, [auth.status, auth.customer, roleState.resolved, dispatch]);

  // Tapping a notification — or one of its action buttons ("Snap my plate", "Confirm & pay", "Skip
  // this day") — takes you straight to the thing it's about. The table lives in
  // lib/notificationRoutes.js. Guard runs after, so a signed-out tap still routes safely.
  //
  // Two paths, because a tap can arrive two ways: while the app is alive (the listener), or as the
  // thing that launched it from cold (the "last response", read once the app is ready to navigate).
  // The evening-before "Confirm tomorrow's order" reminder used to fall through both: its payload
  // carries a date, not an order id, so tapping it opened the app and went nowhere.
  const handled = useRef(null);
  const here = useRef(segments);
  useEffect(() => {
    here.current = segments;
  }, [segments]);
  useEffect(() => {
    const go = (resp) => {
      const id = resp?.notification?.request?.identifier;
      const key = `${id}|${resp?.actionIdentifier}|${resp?.notification?.date}`;
      if (!resp || handled.current === key) return;
      handled.current = key;
      const target = routeForNotification({
        actionIdentifier: resp.actionIdentifier,
        data: resp.notification?.request?.content?.data,
      });
      if (!target) return;
      // Already looking at that kind of screen (the tracker is open and "Skipped it" is pressed on
      // a reminder)? Swap it rather than stack a second copy on top — Back should leave the
      // tracker, not reveal an older tracker underneath.
      const sameScreen = here.current?.[0] === String(target.pathname).split('/')[1];
      if (sameScreen) router.replace(/** @type {any} */ (target));
      else router.push(/** @type {any} */ (target));
    };
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    if (ready && auth.status === 'signedIn' && role.resolved)
      Notifications.getLastNotificationResponseAsync()
        .then(go)
        .catch(() => {});
    return () => sub.remove();
  }, [router, ready, auth.status, role.resolved]);

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
    // Each role has a home screen, and the customer-notes screen both of them need — a buyer reads
    // the item notes before the market, a rider reads the door instructions. Pinning them to one
    // screen meant neither could reach the notes at all.
    const SHARED = 'notes';
    if (r === 'PROCUREMENT') {
      if (segments[1] !== 'procurement' && segments[1] !== SHARED)
        router.replace('/staff/procurement');
      return;
    }
    if (r === 'FULFILMENT') {
      if (segments[1] !== 'fulfilment' && segments[1] !== SHARED)
        router.replace('/staff/fulfilment');
      return;
    }
    if (r === 'ADMIN' || r === 'SUPER_ADMIN') {
      // Both admin and super admin land on the ops console straight after sign-in, but then get to use
      // the WHOLE shopping app — the tab group AND its detail routes (calendar, product, cart, order,
      // checkout) — plus the web admin panel. Only redirect from the auth screens; never bounce them
      // out of the shop once they've opened it.
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

/**
 * The cover shown while a signed-in number's role is being looked up, so a staff phone never
 * flashes the shop before landing on its own tools.
 *
 * It lifts by itself after a few seconds. The lookup retries for up to two minutes when the
 * network is bad, and a customer on a weak signal should get their shop — with whatever is cached —
 * rather than a spinner for that long. The lookup carries on underneath; a staff number is still
 * routed the moment it answers.
 */
function SigningInCover() {
  const [lifted, setLifted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLifted(true), 6000);
    return () => clearTimeout(t);
  }, []);
  if (lifted) return null;
  return (
    <View
      style={styles.signingIn}
      accessibilityRole="progressbar"
      accessibilityLabel="Signing you in"
    >
      <ActivityIndicator color={colors.leaf} size="large" />
      <Text style={styles.signingInText}>Signing you in…</Text>
    </View>
  );
}

function Root() {
  // Scoped to this component: AuthGate has its own `segments`, which is not in scope here.
  const rootSegments = /** @type {any} */ (useSegments());
  useSessionBootstrap();
  useReducedMotionSync();
  useOrderLiveNotification(); // Android: keep the live order card in sync (iOS Live Activities later)
  useMealReminders(); // meal-time "snap your plate" reminders, re-armed as the plan and logs change
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
  const auth = useSelector(selectAuth);
  const roleState = useSelector(selectRoleState);
  // Signed in but role not yet resolved (common on a cold Render start): show an explicit progress
  // state instead of leaving the OTP/current screen frozen, which read as a deadlock.
  const signingIn = ready && auth.status === 'signedIn' && !roleState.resolved;

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
              // A sheet over the page you came from, on both. iPhone has the system's; Android
              // gets a see-through screen and the sheet is drawn in it (ui/PopupSheet), which
              // brings its own slide and dimming — so the route itself does not animate.
              presentation: Platform.OS === 'ios' ? 'formSheet' : 'transparentModal',
              sheetAllowedDetents: [0.92],
              sheetGrabberVisible: false,
              sheetCornerRadius: 32,
              contentStyle: { backgroundColor: 'transparent' },
              animation: Platform.OS === 'ios' ? 'slide_from_bottom' : 'none',
            }}
          />
          <Stack.Screen name="checkout" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen
            name="order/success"
            options={{ animation: 'fade', gestureEnabled: false }}
          />
          <Stack.Screen name="order/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="meal-checkin" options={{ animation: 'slide_from_right' }} />
          {/* Pushed, not presented: iOS will not stack a modal over the basket's form sheet. */}
          <Stack.Screen name="coupon" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="confirm/[date]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="calendar" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="search" options={{ animation: 'fade' }} />
          <Stack.Screen
            name="address/new"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="address/[id]"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
        </Stack>
      ) : null}
      {signingIn ? <SigningInCover /> : null}
      {/* "Added to basket" flights. Above the screens, below the toasts. */}
      <FlyToBagHost />
      {/* Every scrolling screen starts its content at the top safe-area inset, so without this the
          content travels up through the transparent status bar and collides with the clock and
          battery icons. Mounted once here rather than on each screen. Skipped for (auth), whose
          onboarding is a full-bleed dark scene that scrolls under the status bar on purpose, and for
          the "Locked in." screen, which is dark to its top edge — a pale strip across it looked
          like a rendering fault. */}
      {rootSegments[0] === '(auth)' ||
      (rootSegments[0] === 'order' && rootSegments[1] === 'success') ? null : (
        <StatusScrim />
      )}
      <ToastHost />
      <KeyboardDoneBar />
      {/* The opening: the logo drawing itself in, and on a phone's first launch, what Fooducia is.
          On top of everything, and started the moment the system splash comes down. */}
      <BrandIntro start={ready && auth.status !== 'booting'} />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  signingIn: {
    // Spelled out. This used to spread StyleSheet.absoluteFillObject, which React Native 0.86 no
    // longer has: spreading undefined adds nothing, so the "cover the screen" overlay laid out in
    // flow instead — a strip under the app that shoved the tab bar up the page.
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  signingInText: { color: colors.ink3, fontSize: 15 },
});
