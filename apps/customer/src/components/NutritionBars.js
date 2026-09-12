import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { Mono, Small, Text } from '../ui';
import { colors, motion } from '../theme';

const ROWS = [
  ['kcal', 'Calories', 'kcal', colors.sprout],
  ['protein', 'Protein', 'g', colors.leaf],
  ['carbs', 'Carbs', 'g', colors.amber],
  ['fat', 'Fat', 'g', '#C48BD9'],
  ['fibre', 'Fibre', 'g', '#6FB3D2'],
];

function Bar({ label, value, target, unit, color, index, dark }) {
  // Animate a numeric pixel width, not a percentage string: reanimated cannot animate a `%` width on
  // Android (the fill renders at 0 and the coloured bar is invisible), so we measure the track once
  // with onLayout and drive px instead. Works identically on both platforms.
  const [trackW, setTrackW] = useState(0);
  const w = useSharedValue(0);
  const pct = Math.min(1, target ? value / target : 0);
  useEffect(() => {
    if (!trackW) return;
    w.value = 0;
    w.value = withDelay(index * motion.stagger, withSpring(pct * trackW, motion.springSoft));
  }, [pct, index, trackW, w]);
  const fill = useAnimatedStyle(() => ({ width: w.value }));
  const ink = dark ? colors.inkOnDark : colors.ink;
  const muted = dark ? 'rgba(243,245,239,0.6)' : colors.ink3;
  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Text variant="smallMedium" color={ink}>
          {label}
        </Text>
        <Mono color={muted} style={{ fontSize: 12 }}>
          {value} / {target} {unit} · {Math.round(pct * 100)}%
        </Mono>
      </View>
      <View
        style={[styles.track, dark && { backgroundColor: 'rgba(255,255,255,0.12)' }]}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      >
        <Animated.View style={[styles.fill, { backgroundColor: color }, fill]} />
      </View>
    </View>
  );
}

/**
 * Animated macro coverage bars: actual (app-computed) against the customer's daily target.
 * @param {{ totals: any, targets: any, dark?: boolean, caption?: string }} props
 */
export function NutritionBars({ totals, targets, dark, caption }) {
  return (
    <View style={{ gap: 12 }}>
      {ROWS.map(([key, label, unit, color], i) => (
        <Bar
          key={key}
          label={label}
          value={totals?.[key] || 0}
          target={targets?.[key] || 0}
          unit={unit}
          color={color}
          index={i}
          dark={dark}
        />
      ))}
      {caption ? (
        <Small color={dark ? 'rgba(243,245,239,0.55)' : colors.ink3} style={{ fontSize: 11 }}>
          {caption}
        </Small>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(14,27,20,0.08)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
