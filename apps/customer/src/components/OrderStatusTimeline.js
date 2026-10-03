import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInLeft } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { Small, Text } from '../ui';
import { colors, motion } from '../theme';
import { useSelector } from 'react-redux';
import { formatDateTime } from '../lib/dates';
import { t } from '../lib/i18n';
import { selectLanguage } from '../features/ui/uiSlice';

// Labels resolve per render against the chosen language — the strings used to be baked into this
// array, so the whole track order screen stayed English even with the app set to Telugu.
const STEPS = [
  { key: 'CONFIRMED', label: 'stepConfirmed', hint: 'stepConfirmedHint' },
  { key: 'PACKING', label: 'stepPacked', hint: 'stepPackedHint' },
  { key: 'OUT_FOR_DELIVERY', label: 'stepOnItsWay', hint: 'stepOnItsWayHint' },
  { key: 'DELIVERED', label: 'stepDelivered', hint: 'stepDeliveredHint' },
];

/** @param {{ status: string, timeline?: {status:string, at:string}[] }} props */
export function OrderStatusTimeline({ status, timeline = [] }) {
  const lang = useSelector(selectLanguage);
  if (status === 'CANCELLED' || status === 'PAYMENT_FAILED' || status === 'PENDING_PAYMENT') {
    const at = timeline.find((t) => t.status === status)?.at;
    return (
      <View style={styles.single}>
        <Text variant="bodyMedium">
          {status === 'CANCELLED'
            ? t('orderCancelled', lang)
            : status === 'PAYMENT_FAILED'
              ? t('paymentDidNotGoThrough', lang)
              : t('waitingForPayment', lang)}
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
                {t(s.label, lang)}
              </Text>
              <Small muted>{at ? formatDateTime(at) : t(s.hint, lang)}</Small>
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
