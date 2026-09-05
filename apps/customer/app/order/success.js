import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { Button, Glass, Mono, Screen, Small, Text } from '../../src/ui';
import { useGetOrderQuery } from '../../src/api/api';
import { colors, fonts, radius } from '../../src/theme';
import { formatDateShort, WINDOWS } from '../../src/lib/dates';

function Burst() {
  const s = useSharedValue(0);
  const ring = useSharedValue(0);
  useEffect(() => {
    s.value = withDelay(120, withSpring(1, { damping: 12, stiffness: 160 }));
    ring.value = withDelay(
      200,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 0 }),
        ),
        3,
        false,
      ),
    );
  }, [s, ring]);
  const check = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const pulse = useAnimatedStyle(() => ({
    opacity: 1 - ring.value,
    transform: [{ scale: 1 + ring.value * 1.2 }],
  }));
  return (
    <View style={styles.burst}>
      <Animated.View style={[styles.ring, pulse]} />
      <Animated.View style={[styles.check, check]}>
        <Check size={44} color={colors.ink} strokeWidth={3} />
      </Animated.View>
    </View>
  );
}

export default function OrderSuccess() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { data } = useGetOrderQuery(id);
  const order = data?.order;

  return (
    <Screen variant="night" edges={['top', 'bottom']}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Burst />
        <Animated.View
          entering={FadeInDown.delay(300).duration(500).springify().damping(18)}
          style={{ alignItems: 'center', marginTop: 28 }}
        >
          <Text style={styles.title}>Locked in.</Text>
          <Small color="rgba(243,245,239,0.7)" center style={{ marginTop: 8, maxWidth: 280 }}>
            The field gets your list tonight. We’ll message you when it’s packed and again when it
            leaves.
          </Small>
        </Animated.View>
        {order ? (
          <Animated.View
            entering={FadeInDown.delay(480).duration(500).springify().damping(18)}
            style={{ width: '100%', marginTop: 28 }}
          >
            <Glass tone="dark" radius={radius.xl} innerStyle={styles.card}>
              <View style={styles.row}>
                <Small color="rgba(243,245,239,0.6)">Order</Small>
                <Mono color={colors.sprout}>{order.orderNumber}</Mono>
              </View>
              <View style={styles.row}>
                <Small color="rgba(243,245,239,0.6)">Arrives</Small>
                <Text variant="bodyMedium" color={colors.inkOnDark}>
                  {formatDateShort(order.deliveryDate)} · {WINDOWS[order.window]?.label}
                </Text>
              </View>
              <View style={styles.row}>
                <Small color="rgba(243,245,239,0.6)">To</Small>
                <Text variant="bodyMedium" color={colors.inkOnDark}>
                  {order.address.block} · {order.address.flat}
                </Text>
              </View>
            </Glass>
          </Animated.View>
        ) : null}
      </View>
      <Animated.View entering={FadeInDown.delay(640).duration(500)} style={{ paddingBottom: 8 }}>
        <Button
          title="Track this order"
          variant="accent"
          onPress={() => router.replace({ pathname: '/order/[id]', params: { id } })}
        />
        <Button
          title="Back to catalog"
          variant="glass"
          onPress={() => router.replace('/(tabs)')}
          style={{ marginTop: 6 }}
        />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  burst: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: colors.sprout,
  },
  check: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.sprout,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.sprout,
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 50,
    letterSpacing: -0.8,
    color: colors.inkOnDark,
  },
  card: { padding: 18, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
