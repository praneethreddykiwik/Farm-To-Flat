import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { radius as R } from '../theme';

/**
 * Shimmer placeholder. Width/height in points; `radius` defaults to md.
 * @param {{ width?: number|string, height?: number, radius?: number, style?: any }} props
 */
export function Skeleton({ width = '100%', height = 16, radius = R.md, style }) {
  const x = useSharedValue(-1);
  useEffect(() => {
    x.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
  }, [x]);
  const sheen = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 300 }] }));
  return (
    <View style={[styles.base, { width, height, borderRadius: radius }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, sheen]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.65)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: 'rgba(14,27,20,0.07)', overflow: 'hidden' },
});
