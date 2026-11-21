import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSelector } from 'react-redux';
import { useIsFocused } from 'expo-router';
import { colors } from '../theme';
import { selectReducedMotion } from '../features/ui/uiSlice';

/**
 * Ambient background: three soft colour fields drifting very slowly behind the glass.
 * This is what makes the frost read as glass rather than grey boxes. Respects reduced motion.
 * @param {{ variant?: 'canvas'|'night', intensity?: number }} props
 */
/** Richer versions of the ambient tints (mint / butter / sky), for the background glows only. */
const VIVID = { mint: '#A6E3C0', butter: '#F7E08E', sky: '#B7D5F2' };

export function Ambient({ variant = 'canvas', intensity = 1 }) {
  // Still on Android, as it is for someone who has asked for less motion. This drift touches the
  // whole screen, so while it runs every frame is a full redraw — sixty or a hundred and twenty a
  // second with nobody touching the phone, on every screen that has this background. Measured, it
  // was one of the two things that kept an idle screen from ever being idle; a drift this slow is
  // not worth that on any Android phone, and a cheap one cannot spare it at all.
  const reduced = useSelector(selectReducedMotion) || Platform.OS === 'android';
  const focused = useIsFocused();
  const t = useSharedValue(0);
  useEffect(() => {
    // Only the visible screen animates. Every mounted screen (all 5 tabs + anything stacked
    // underneath) would otherwise keep this 3-blob loop running, and they pile up the more you
    // navigate — the main cause of gradual lag on heavy use. Pause when not focused.
    if (reduced) {
      t.value = 0.5;
      return undefined;
    }
    if (!focused) {
      cancelAnimation(t);
      return undefined;
    }
    t.value = withRepeat(
      withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(t);
  }, [reduced, focused, t]);

  const b1 = useAnimatedStyle(() => ({
    transform: /** @type {any} */ ([
      { translateX: t.value * 40 - 20 },
      { translateY: t.value * 30 - 15 },
    ]),
  }));
  const b2 = useAnimatedStyle(() => ({
    transform: /** @type {any} */ ([
      { translateX: -t.value * 50 + 25 },
      { translateY: t.value * 20 - 10 },
    ]),
  }));
  const b3 = useAnimatedStyle(() => ({
    transform: /** @type {any} */ ([
      { translateX: t.value * 30 - 15 },
      { translateY: -t.value * 40 + 20 },
    ]),
  }));

  const night = variant === 'night';
  const a = intensity;
  // The background glows are drawn richer than the pastel tokens (owner, 21 Nov 2026: "bright on
  // the simulator, lighter on my phone"). A Mac screen shows pale pastels at high brightness in wide
  // colour; a phone at everyday brightness — with True Tone, a Xiaomi/Samsung colour profile, or
  // outdoor light — washes the same values out to near-white. These keep the same hues, about a
  // third more saturated, so the screen reads green / sunlit / sky on the phone too.
  const glow = VIVID;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: night ? colors.night : colors.canvas }]}
    >
      <Animated.View
        style={[styles.blob, { top: -120, left: -80, width: 360, height: 360, opacity: 1 * a }, b1]}
      >
        <LinearGradient
          colors={night ? ['#1E7A4C', 'rgba(30,122,76,0)'] : [glow.mint, 'rgba(166,227,192,0)']}
          style={styles.fill}
          start={{ x: 0.3, y: 0.2 }}
          end={{ x: 0.9, y: 1 }}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.blob,
          { top: 180, right: -140, width: 380, height: 380, opacity: 0.95 * a },
          b2,
        ]}
      >
        <LinearGradient
          colors={night ? ['#3C5A2A', 'rgba(60,90,42,0)'] : [glow.butter, 'rgba(247,224,142,0)']}
          style={styles.fill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.blob,
          { bottom: -160, left: 20, width: 420, height: 420, opacity: 0.9 * a },
          b3,
        ]}
      >
        <LinearGradient
          colors={night ? ['#12352A', 'rgba(18,53,42,0)'] : [glow.sky, 'rgba(183,213,242,0)']}
          style={styles.fill}
          start={{ x: 0.2, y: 0.1 }}
          end={{ x: 0.8, y: 1 }}
        />
      </Animated.View>
    </View>
  );
}

/**
 * Standard screen shell: ambient background + safe-area padding.
 * @param {{ children: any, variant?: 'canvas'|'night', edges?: ('top'|'bottom')[], style?: any, padded?: boolean }} props
 */
export function Screen({ children, variant = 'canvas', edges = ['top'], style, padded = true }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.root, { backgroundColor: variant === 'night' ? colors.night : colors.canvas }]}
    >
      <Ambient variant={variant} />
      <View
        style={[
          styles.root,
          {
            paddingTop: edges.includes('top') ? insets.top : 0,
            paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
            paddingHorizontal: padded ? 20 : 0,
          },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  blob: { position: 'absolute', borderRadius: 999, overflow: 'hidden' },
  fill: { flex: 1, borderRadius: 999 },
});
