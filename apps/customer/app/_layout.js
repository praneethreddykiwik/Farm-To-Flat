import '../global.css';
import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Provider, useSelector } from 'react-redux';
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
import { useSessionBootstrap } from '../src/hooks/useSession';
import { selectAuth } from '../src/features/auth/authSlice';
import { configureNotifications } from '../src/lib/notifications';
import { useReducedMotionSync } from '../src/hooks/useReducedMotion';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions?.({ duration: 320, fade: true });

/**
 * Route guard. Three states: booting (splash stays), signed out (auth group only),
 * signed in without an address (address capture), signed in (everything else).
 */
function AuthGate({ ready }) {
  const auth = useSelector(selectAuth);
  const segments = /** @type {any} */ (useSegments());
  const router = useRouter();

  useEffect(() => {
    if (!ready || auth.status === 'booting') return;
    const inAuth = segments[0] === '(auth)';
    if (auth.status === 'signedOut') {
      if (!inAuth) router.replace('/(auth)/welcome');
      return;
    }
    const needsAddress = auth.customer && !auth.customer.hasAddress;
    if (needsAddress) {
      if (segments[1] !== 'address') router.replace('/(auth)/address');
      return;
    }
    if (inAuth) router.replace('/(tabs)');
  }, [ready, auth.status, auth.customer, segments, router]);

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
