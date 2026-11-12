import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Small, Text } from '../ui';
import { colors, fonts } from '../theme';

/**
 * The day at a glance: calories eaten against the day's target, as a ring.
 *
 * Going over the target does not turn the ring red. A meal tracker that scolds is one people stop
 * opening, and the number is an estimate in the first place — so past 100% the ring simply fills and
 * the text says how far over, in the same calm colour.
 *
 * @param {{ eaten: number, target: number, low?: number, high?: number, size?: number }} props
 */
export function CalorieRing({ eaten, target, low, high, size = 196 }) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, eaten / target) : 0;
  const over = target > 0 && eaten > target;
  const showRange = low != null && high != null && high - low >= 40 && eaten > 0;
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${eaten} of ${target} kilocalories today${showRange ? `, likely between ${low} and ${high}` : ''}`}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.canvasDeep}
          strokeWidth={stroke}
          fill="none"
        />
        {pct > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.leaf}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c * pct} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text style={styles.big}>{eaten.toLocaleString('en-IN')}</Text>
        <Small muted>of {target.toLocaleString('en-IN')} kcal</Small>
        {showRange ? (
          <Small muted style={styles.range}>
            likely {low.toLocaleString('en-IN')}–{high.toLocaleString('en-IN')}
          </Small>
        ) : over ? (
          <Small muted style={styles.range}>
            {(eaten - target).toLocaleString('en-IN')} over
          </Small>
        ) : null}
      </View>
    </View>
  );
}

/** One macro: a label, a thin bar, grams eaten of grams targeted. */
export function MacroBar({ label, value, target }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View
      style={styles.macro}
      accessible
      accessibilityLabel={`${label}: ${Math.round(value)} of ${target} grams`}
    >
      <Text variant="smallMedium">{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(pct > 0 ? 4 : 0, pct * 100)}%` }]} />
      </View>
      <Small muted style={styles.tab}>
        {Math.round(value)} / {target} g
      </Small>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  big: {
    fontFamily: fonts.display,
    fontSize: 46,
    lineHeight: 50,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  range: { marginTop: 4, fontSize: 12 },
  macro: { flex: 1, alignItems: 'center' },
  track: {
    alignSelf: 'stretch',
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.canvasDeep,
    marginTop: 8,
    marginHorizontal: 6,
    overflow: 'hidden',
  },
  fill: { height: 5, borderRadius: 3, backgroundColor: colors.leaf },
  tab: { marginTop: 6, fontVariant: ['tabular-nums'] },
});
