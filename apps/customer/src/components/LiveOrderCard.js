import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check, ChevronRight } from 'lucide-react-native';
import { Glass, Mono, Pressy, Small, Text } from '../ui';
import { useGetOrdersQuery } from '../api/api';
import { selectAuth } from '../features/auth/authSlice';
import { arrivalPhrase, windowLabel } from '../lib/dates';
import { LIVE_HEADLINE, STEP_LABELS, liveStep, pickLiveOrder } from '../lib/liveOrder';
import { colors, radius } from '../theme';

/**
 * The order that is on its way, on the first screen the customer sees.
 *
 * Until now an order went quiet the moment it was placed: the status lived three taps away under
 * Orders, and on an iPhone nothing outside the app showed it at all. This card is the in-app half
 * of "live tracking" — where it is, what happens next, when it arrives — and it is the same on
 * both phones, with no new build needed. (The lock-screen half, a real Live Activity, does need
 * one; see docs/phase-2.)
 *
 * It polls gently while an order is moving and not at all otherwise, and it draws nothing when
 * there is nothing to track.
 *
 * @param {{ style?: any }} props
 */
export function LiveOrderCard({ style }) {
  const router = useRouter();
  const signedIn = useSelector(selectAuth).status === 'signedIn';
  const { data } = useGetOrdersQuery(undefined, {
    skip: !signedIn,
    pollingInterval: 30000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const order = pickLiveOrder(data?.orders);
  if (!order) return null;

  const step = liveStep(order.status);
  const [headline, next] = LIVE_HEADLINE[order.status] || ['Your order', ''];
  // Reads as the end of a sentence: "Arrives this morning." / "Arrives Sat, 14 Nov, morning."
  const when = arrivalPhrase(order.deliveryDate, windowLabel(order.window, order));

  return (
    <Animated.View entering={FadeInDown.duration(320).springify().damping(18)} style={style}>
      <Pressy
        onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
        haptics="soft"
        scale={0.985}
        accessibilityRole="button"
        accessibilityLabel={`Order ${order.orderNumber}. ${headline}, step ${step} of 4. Arrives ${when}. Opens tracking.`}
      >
        <Glass tone="dark" radius={radius.lg} innerStyle={styles.card}>
          <View style={styles.top}>
            <View style={{ flex: 1 }}>
              <Mono style={styles.number}>{order.orderNumber}</Mono>
              <Text variant="bodyMedium" color={colors.inkOnDark} style={{ marginTop: 2 }}>
                {headline}
              </Text>
              <Small color="rgba(243,245,239,0.7)" style={{ marginTop: 1 }}>
                {next} Arrives {when}.
              </Small>
            </View>
            <ChevronRight size={20} color="rgba(243,245,239,0.6)" />
          </View>

          {/* The track: four stops, the reached ones filled. Decorative for a screen reader — the
              step is already in the label above — so it is hidden from it rather than read as
              four loose words. */}
          <View
            style={styles.track}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {STEP_LABELS.map((label, i) => {
              const reached = i < step;
              const current = i === step - 1;
              return (
                <View key={label} style={styles.stop}>
                  <View style={styles.rail}>
                    <View
                      style={[
                        styles.line,
                        i === 0 && { opacity: 0 },
                        reached && { backgroundColor: colors.sprout },
                      ]}
                    />
                    <View style={[styles.dot, reached && styles.dotOn, current && styles.dotNow]}>
                      {reached && !current ? <Check size={11} color={colors.night} /> : null}
                    </View>
                    <View
                      style={[
                        styles.line,
                        i === STEP_LABELS.length - 1 && { opacity: 0 },
                        i < step - 1 && { backgroundColor: colors.sprout },
                      ]}
                    />
                  </View>
                  <Small
                    color={reached ? colors.inkOnDark : 'rgba(243,245,239,0.5)'}
                    style={styles.stopLabel}
                    numberOfLines={1}
                  >
                    {label}
                  </Small>
                </View>
              );
            })}
          </View>
        </Glass>
      </Pressy>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  number: { color: colors.sprout, fontSize: 12, letterSpacing: 0.4 },
  track: { flexDirection: 'row', marginTop: 14 },
  stop: { flex: 1, alignItems: 'center' },
  rail: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  line: { flex: 1, height: 2, backgroundColor: 'rgba(243,245,239,0.18)' },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(243,245,239,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: colors.sprout, borderColor: colors.sprout },
  // the stop the order is AT: a ring, so "here" reads differently from "passed"
  dotNow: { backgroundColor: colors.night, borderColor: colors.sprout, borderWidth: 5 },
  stopLabel: { marginTop: 6, fontSize: 11 },
});
