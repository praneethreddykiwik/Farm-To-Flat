import React, { useCallback } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { motion } from '../theme';
import { haptic } from '../lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable with the "premium" press: scale to 0.97 on a spring, optional haptic.
 * Use everywhere instead of TouchableOpacity.
 * @param {{ scale?: number, haptics?: 'tap'|'soft'|'select'|'none', style?: any, onPress?: any, children?: any } & import('react-native').PressableProps} props
 */
export function Pressy({
  scale = 0.97,
  haptics = 'tap',
  // A small default tap-target expansion so icon-only controls (a 16px clear "X", a chevron) reach a
  // comfortable ~44pt target without every caller remembering to add it. A caller can still override
  // or pass hitSlop={0}.
  hitSlop = 10,
  style,
  onPress,
  onPressIn,
  onPressOut,
  children,
  ...rest
}) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  const handleIn = useCallback(
    (e) => {
      s.value = withSpring(scale, motion.springSnappy);
      onPressIn?.(e);
    },
    [onPressIn, s, scale],
  );
  const handleOut = useCallback(
    (e) => {
      s.value = withSpring(1, motion.spring);
      onPressOut?.(e);
    },
    [onPressOut, s],
  );
  const handlePress = useCallback(
    (e) => {
      if (haptics !== 'none') haptic[haptics]?.();
      onPress?.(e);
    },
    [haptics, onPress],
  );

  return (
    <AnimatedPressable
      accessibilityRole="button"
      {...rest}
      onPress={handlePress}
      onPressIn={handleIn}
      onPressOut={handleOut}
      style={[anim, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
