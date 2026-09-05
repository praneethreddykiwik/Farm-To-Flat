import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors, radius } from '../theme';

export const ORDER_STATUS = {
  PENDING_PAYMENT: { label: 'Awaiting payment', bg: colors.amberSoft, fg: '#8A5B00' },
  PAYMENT_FAILED: { label: 'Payment failed', bg: colors.tomatoSoft, fg: colors.tomato },
  CONFIRMED: { label: 'Confirmed', bg: colors.leafSoft, fg: colors.leafDeep },
  PACKED: { label: 'Packed', bg: colors.sky, fg: '#1E4E7A' },
  OUT_FOR_DELIVERY: { label: 'On its way', bg: colors.butter, fg: '#6B4E00' },
  DELIVERED: { label: 'Delivered', bg: colors.night, fg: colors.sprout },
  CANCELLED: { label: 'Cancelled', bg: 'rgba(14,27,20,0.08)', fg: colors.ink3 },
};

/** @param {{ status: keyof typeof ORDER_STATUS, style?: any }} props */
export function StatusPill({ status, style }) {
  const s = ORDER_STATUS[status] || { label: status, bg: colors.canvasDeep, fg: colors.ink2 };
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }, style]}>
      <View style={[styles.dot, { backgroundColor: s.fg }]} />
      <Text variant="micro" color={s.fg} style={{ letterSpacing: 0.6 }}>
        {s.label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
