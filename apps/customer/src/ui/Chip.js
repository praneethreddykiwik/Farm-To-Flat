import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { Pressy } from './Pressy';
import { Text } from './Text';
import { colors, motion, radius, shadow } from '../theme';

/**
 * Selectable chip. Selected chips fill with ink and lift slightly, like the category filters in the reference.
 * @param {{ label: string, selected?: boolean, onPress?: () => void, icon?: any, tone?: 'light'|'dark', style?: any }} props
 */
export function Chip({ label, selected, onPress, icon, tone = 'light', style }) {
  const dark = tone === 'dark';
  const anim = useAnimatedStyle(() => ({
    backgroundColor: withTiming(
      selected
        ? dark
          ? colors.sprout
          : colors.night
        : dark
          ? 'rgba(255,255,255,0.10)'
          : 'rgba(255,255,255,0.62)',
      {
        duration: motion.dur.fast,
      },
    ),
    transform: [{ translateY: withSpring(selected ? -1 : 0, motion.spring) }],
  }));
  return (
    <Pressy
      onPress={onPress}
      haptics="select"
      style={style}
      accessibilityState={{ selected: !!selected }}
    >
      <Animated.View style={[styles.chip, selected && shadow.soft, anim]}>
        {icon ? <View style={{ marginRight: 6 }}>{icon}</View> : null}
        <Text
          variant="smallMedium"
          color={
            selected
              ? dark
                ? colors.ink
                : colors.inkOnDark
              : dark
                ? colors.inkOnDark
                : colors.ink2
          }
        >
          {label}
        </Text>
      </Animated.View>
    </Pressy>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
});
