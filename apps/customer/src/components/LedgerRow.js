import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowDownLeft, ArrowUpRight, RotateCcw, SlidersHorizontal } from 'lucide-react-native';
import { Money, Small, Text } from '../ui';
import { colors } from '../theme';
import { formatDateTime } from '../lib/dates';

const SOURCE = {
  TOPUP: { label: 'Top-up', Icon: ArrowDownLeft, bg: colors.leafSoft, fg: colors.leafDeep },
  ORDER: { label: 'Order', Icon: ArrowUpRight, bg: colors.butter, fg: '#6B4E00' },
  REFUND: { label: 'Refund', Icon: RotateCcw, bg: colors.sky, fg: '#1E4E7A' },
  ADJUSTMENT: { label: 'Adjustment', Icon: SlidersHorizontal, bg: colors.lilac, fg: '#4A3A7A' },
};

/** @param {{ entry: any }} props */
export function LedgerRow({ entry }) {
  const s = SOURCE[entry.source] || SOURCE.ADJUSTMENT;
  const credit = entry.direction === 'CREDIT';
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: s.bg }]}>
        <s.Icon size={18} color={s.fg} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium">{entry.note || s.label}</Text>
        <Small muted>
          {formatDateTime(entry.createdAt)} · {entry.reference}
        </Small>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Money
          paise={credit ? entry.amountPaise : -Number(entry.amountPaise)}
          sign
          variant="bodyMedium"
          color={credit ? colors.leafDeep : colors.ink}
        />
        <Small muted style={{ fontSize: 11 }}>
          bal ₹{Math.round(Number(entry.balanceAfterPaise) / 100)}
        </Small>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
