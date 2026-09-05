import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSelector } from 'react-redux';
import { colors } from '../theme';
import { selectReducedMotion } from '../features/ui/uiSlice';

/**
 * Ambient background: three soft colour fields drifting very slowly behind the glass.
 * This is what makes the frost read as glass rather than grey boxes. Respects reduced motion.
 * @param {{ variant?: 'canvas'|'night', intensity?: number }} props
 */
export function Ambient({ variant = 'canvas', intensity = 1 }) {
  const reduced = useSelector(selectReducedMotion);
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      t.value = 0.5;
      return;
    }
    t.value = withRepeat(
      withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [reduced, t]);

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
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: night ? colors.night : colors.canvas }]}
    >
      <Animated.View
        style={[
          styles.blob,
          { top: -120, left: -80, width: 360, height: 360, opacity: 0.9 * a },
          b1,
        ]}
      >
        <LinearGradient
          colors={night ? ['#1E7A4C', 'rgba(30,122,76,0)'] : [colors.mint, 'rgba(191,233,208,0)']}
          style={styles.fill}
          start={{ x: 0.3, y: 0.2 }}
          end={{ x: 0.9, y: 1 }}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.blob,
          { top: 180, right: -140, width: 380, height: 380, opacity: 0.85 * a },
          b2,
        ]}
      >
        <LinearGradient
          colors={night ? ['#3C5A2A', 'rgba(60,90,42,0)'] : [colors.butter, 'rgba(244,233,183,0)']}
          style={styles.fill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.blob,
          { bottom: -160, left: 20, width: 420, height: 420, opacity: 0.8 * a },
          b3,
        ]}
      >
        <LinearGradient
          colors={night ? ['#12352A', 'rgba(18,53,42,0)'] : [colors.sky, 'rgba(207,226,243,0)']}
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
