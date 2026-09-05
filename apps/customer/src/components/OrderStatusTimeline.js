import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInLeft } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { Small, Text } from '../ui';
import { colors, motion } from '../theme';
import { formatDateTime } from '../lib/dates';

const STEPS = [
  { key: 'CONFIRMED', label: 'Confirmed', hint: 'Locked in for your window' },
  { key: 'PACKED', label: 'Packed', hint: 'Weighed and bagged this morning' },
  { key: 'OUT_FOR_DELIVERY', label: 'On its way', hint: 'Heading to your block' },
  { key: 'DELIVERED', label: 'Delivered', hint: 'At your door' },
];

/** @param {{ status: string, timeline?: {status:string, at:string}[] }} props */
export function OrderStatusTimeline({ status, timeline = [] }) {
  if (status === 'CANCELLED' || status === 'PAYMENT_FAILED' || status === 'PENDING_PAYMENT') {
    const at = timeline.find((t) => t.status === status)?.at;
    return (
      <View style={styles.single}>
        <Text variant="bodyMedium">
          {status === 'CANCELLED'
            ? 'This order was cancelled'
            : status === 'PAYMENT_FAILED'
              ? 'Payment did not go through'
              : 'Waiting for payment'}
        </Text>
        {at ? <Small muted>{formatDateTime(at)}</Small> : null}
      </View>
    );
  }
  const reached = STEPS.findIndex((s) => s.key === status);
  return (
    <View>
      {STEPS.map((s, i) => {
        const done = i <= reached;
        const current = i === reached;
        const at = timeline.find((t) => t.status === s.key)?.at;
        return (
          <Animated.View
            key={s.key}
            entering={FadeInLeft.delay(i * motion.stagger).duration(320)}
            style={styles.row}
          >
            <View style={styles.rail}>
              <View style={[styles.node, done && styles.nodeDone, current && styles.nodeCurrent]}>
                {done ? (
                  <Check
                    size={12}
                    color={current ? colors.ink : colors.inkOnDark}
                    strokeWidth={3}
                  />
                ) : null}
              </View>
              {i < STEPS.length - 1 ? (
                <View style={[styles.line, i < reached && styles.lineDone]} />
              ) : null}
            </View>
            <View style={styles.body}>
              <Text variant="bodyMedium" color={done ? colors.ink : colors.ink3}>
                {s.label}
              </Text>
              <Small muted>{at ? formatDateTime(at) : s.hint}</Small>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14 },
  rail: { alignItems: 'center', width: 24 },
  node: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(14,27,20,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  nodeDone: { backgroundColor: colors.night, borderColor: colors.night },
  nodeCurrent: { backgroundColor: colors.sprout, borderColor: colors.sprout },
  line: {
    width: 2,
    flex: 1,
    minHeight: 28,
    backgroundColor: 'rgba(14,27,20,0.10)',
    marginVertical: 4,
  },
  lineDone: { backgroundColor: colors.night },
  body: { flex: 1, paddingBottom: 18 },
  single: { paddingVertical: 8 },
});
