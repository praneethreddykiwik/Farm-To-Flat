import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from 'react-native-reanimated';
import { ArrowRight, ShoppingBag } from 'lucide-react-native';
import { Glass, Money, Pressy, Small, Text } from '../ui';
import { colors, radius } from '../theme';
import { useCart } from '../hooks/useCart';

/**
 * Floating "view basket" bar that slides up above the tab bar the moment the basket has anything in it.
 * Total rolls digit by digit as quantities change.
 */
export function CartBar({ bottom = 96 }) {
  const router = useRouter();
  const { cart, count } = useCart();
  if (!cart || count === 0) return null;
  const short = Number(cart.minOrderValuePaise) - Number(cart.subtotalPaise);
  return (
    <Animated.View
      entering={FadeInDown.duration(320).springify().damping(18)}
      exiting={FadeOutDown.duration(200)}
      layout={LinearTransition.springify().damping(18)}
      pointerEvents="box-none"
      style={[styles.host, { bottom }]}
    >
      <Pressy
        onPress={() => router.push('/cart')}
        haptics="soft"
        scale={0.98}
        accessibilityLabel="View basket"
      >
        <Glass tone="dark" radius={radius.lg} innerStyle={styles.inner}>
          <View style={styles.iconWrap}>
            <ShoppingBag size={20} color={colors.ink} strokeWidth={2.3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" color={colors.inkOnDark}>
              {count} {count === 1 ? 'item' : 'items'} in your basket
            </Text>
            <Small color={short > 0 ? '#F6D5C8' : 'rgba(243,245,239,0.7)'}>
              {short > 0
                ? `Add ₹${Math.ceil(short / 100)} more to reach ₹500`
                : 'Ready to check out'}
            </Small>
          </View>
          <Money paise={cart.subtotalPaise} animated color={colors.sprout} variant="price" />
          <ArrowRight size={18} color={colors.sprout} />
        </Glass>
      </Pressy>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16 },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.sprout,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
