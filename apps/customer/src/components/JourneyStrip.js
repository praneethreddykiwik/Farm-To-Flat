import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { Sprout, Scissors, Package, Home } from 'lucide-react-native';
import { Glass, Small, Text } from '../ui';
import { colors, radius } from '../theme';
import { selectReducedMotion } from '../features/ui/uiSlice';

const STAGES = [
  { icon: Sprout, label: 'Our farms' },
  { icon: Scissors, label: 'Harvested' },
  { icon: Package, label: 'Packed' },
  { icon: Home, label: 'Your flat' },
];

/**
 * The produce's journey, farm → flat, as a small animated strip. A pulse travels the line to show
 * the "picked after you order, at your door by morning" story. Honours the OS reduce-motion setting.
 */
export function JourneyStrip({ style }) {
  const reduced = useSelector(selectReducedMotion);
  const focused = useIsFocused();
  const [w, setW] = useState(0);
  const p = useSharedValue(0);

  useEffect(() => {
    if (reduced || !w || !focused) {
      cancelAnimation(p);
      return undefined;
    }
    p.value = 0;
    p.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false,
    );
    return () => cancelAnimation(p);
  }, [reduced, w, focused, p]);

  const dot = useAnimatedStyle(() => {
    // Travel between the first and last node centres (each node is 32px, centred in a 64px stage).
    const travel = Math.max(0, w - 64);
    return {
      transform: [{ translateX: p.value * travel }],
      opacity: p.value < 0.04 || p.value > 0.96 ? 0 : 1,
    };
  });

  return (
    <Glass tone="dark" radius={radius.lg} innerStyle={styles.inner} style={style}>
      <Text variant="bodyMedium" color={colors.inkOnDark} style={{ marginBottom: 12 }}>
        Fresh from our farms to your flat
      </Text>
      <View style={styles.track} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <View style={styles.line} />
        {!reduced ? <Animated.View style={[styles.pulse, dot]} /> : null}
        <View style={styles.stages}>
          {STAGES.map(({ icon: Icon, label }, i) => (
            <View key={label} style={styles.stage}>
              <View style={[styles.node, i === STAGES.length - 1 && styles.nodeEnd]}>
                <Icon size={16} color={i === STAGES.length - 1 ? colors.ink : colors.sprout} />
              </View>
              <Small color="rgba(243,245,239,0.72)" style={styles.stageLabel}>
                {label}
              </Small>
            </View>
          ))}
        </View>
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  inner: { padding: 16 },
  track: { position: 'relative', justifyContent: 'center' },
  line: {
    position: 'absolute',
    left: 32,
    right: 32,
    top: 15,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(199,240,160,0.28)',
  },
  pulse: {
    position: 'absolute',
    top: 9,
    left: 25,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.sprout,
    shadowColor: colors.sprout,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  stages: { flexDirection: 'row', justifyContent: 'space-between' },
  stage: { alignItems: 'center', gap: 6, width: 64 },
  node: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(199,240,160,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(199,240,160,0.30)',
  },
  nodeEnd: { backgroundColor: colors.sprout, borderColor: colors.sprout },
  stageLabel: { fontSize: 11, textAlign: 'center' },
});
