import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { Text } from './Text';
import { formatPaise, splitPaise } from '../lib/money';
import { colors, fonts, type } from '../theme';

/**
 * The shared Money component. Takes PAISE and renders rupees. When `animated`, each character
 * column rolls when its digit changes (used for cart totals and the wallet balance).
 *
 * @param {{ paise: string|number|bigint, variant?: keyof typeof type, color?: string, animated?: boolean, compact?: boolean, sign?: boolean, style?: any, muted?: boolean }} props
 */
function MoneyBase({
  paise,
  variant = 'price',
  color,
  animated = false,
  compact = true,
  sign = false,
  style,
  muted,
}) {
  const c = color || (muted ? colors.ink3 : colors.ink);
  if (!animated) {
    return (
      <Text variant={variant} color={c} style={style}>
        {formatPaise(paise, { compact, sign })}
      </Text>
    );
  }
  const { symbol, whole, frac } = splitPaise(paise);
  const chars = `${symbol}${whole}${compact ? frac : frac || '.00'}`.split('');
  const t = type[variant] || type.price;
  return (
    <Animated.View layout={LinearTransition.springify().damping(20)} style={[styles.row, style]}>
      {chars.map((ch, i) => (
        <View key={`slot-${chars.length - i}`} style={styles.slot}>
          <Animated.Text
            key={`${ch}-${chars.length - i}`}
            entering={FadeInDown.duration(220).springify().damping(20)}
            exiting={FadeOutUp.duration(160)}
            style={[t, { color: c, fontFamily: ch === symbol ? fonts.display : t.fontFamily }]}
          >
            {ch}
          </Animated.Text>
        </View>
      ))}
    </Animated.View>
  );
}

export const Money = memo(MoneyBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', overflow: 'hidden' },
  slot: { overflow: 'hidden' },
});
