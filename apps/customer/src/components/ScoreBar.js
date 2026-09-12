import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { Small, Text } from '../ui';
import { colors, fonts, motion } from '../theme';

/**
 * The single "how far does this get me" bar: a percentage with an animated fill and a plain caption.
 * Used for plan goal coverage (Dietitian tab) and for days completed (calendar).
 * @param {{ percent: number, label: string, caption?: string, dark?: boolean, delay?: number, color?: string }} props
 */
export function ScoreBar({ percent, label, caption, dark, delay = 0, color }) {
  const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
  // Numeric px width via onLayout — an animated `%` width does not render on Android (see NutritionBars).
  const [trackW, setTrackW] = useState(0);
  const w = useSharedValue(0);
  useEffect(() => {
    if (!trackW) return;
    w.value = 0;
    w.value = withDelay(delay, withSpring((p / 100) * trackW, motion.springSoft));
  }, [p, delay, trackW, w]);
  const fill = useAnimatedStyle(() => ({ width: w.value }));
  const ink = dark ? colors.inkOnDark : colors.ink;
  const tone = color || (p >= 75 ? colors.sprout : p >= 45 ? colors.amber : colors.tomato);
  return (
    <View>
      <View style={styles.head}>
        <Text variant="bodyMedium" color={ink}>
          {label}
        </Text>
        <Text style={[styles.pct, { color: dark ? colors.sprout : colors.leafDeep }]}>{p}%</Text>
      </View>
      <View
        style={[styles.track, dark && { backgroundColor: 'rgba(255,255,255,0.12)' }]}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      >
        <Animated.View style={[styles.fill, { backgroundColor: tone }, fill]} />
      </View>
      {caption ? (
        <Small color={dark ? 'rgba(243,245,239,0.65)' : colors.ink3} style={{ marginTop: 8 }}>
          {caption}
        </Small>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pct: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.6 },
  track: {
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(14,27,20,0.08)',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 7 },
});
