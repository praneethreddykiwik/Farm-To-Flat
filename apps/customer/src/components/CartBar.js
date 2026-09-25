import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from 'react-native-reanimated';
import { ArrowRight, ShoppingBag } from 'lucide-react-native';
import { Glass, Money, Pressy, Small, Text } from '../ui';
import { colors, radius } from '../theme';
import { useCart } from '../hooks/useCart';
import { useGetCouponsQuery } from '../api/api';
import { useSelector } from 'react-redux';
import { selectLanguage } from '../features/ui/uiSlice';
import { t } from '../lib/i18n';

/**
 * Floating "view basket" bar that slides up above the tab bar the moment the basket has anything in it.
 * Total rolls digit by digit as quantities change. The subline tracks LIVE toward the next reward as
 * items are added — the ₹500 minimum first, then each coupon tier (unlock 10% → 15% → 20% off).
 */
export function CartBar({ bottom }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cart, count } = useCart();
  const lang = useSelector(selectLanguage);
  const subtotal = Number(cart?.subtotalPaise || 0);
  // Coupons + their live "meetsMinimum" for THIS subtotal, so we know the next tier to nudge toward.
  const { data: couponData } = useGetCouponsQuery(subtotal, { skip: !cart || count === 0 });
  const nextCoupon = useMemo(() => {
    const locked = (couponData?.coupons || [])
      .filter((c) => !c.meetsMinimum && Number(c.minOrderPaise) > subtotal)
      .sort((a, b) => Number(a.minOrderPaise) - Number(b.minOrderPaise));
    return locked[0] || null;
  }, [couponData, subtotal]);
  // Qualifying for an offer is NOT the same as having it. Coupons are opt-in — the shopper still has
  // to apply one in the basket — so the bar has to say "available", never imply a discount that is
  // not in the total. The richest tier the basket already clears (tiers rise with their threshold).
  const availableCoupon = useMemo(() => {
    const eligible = (couponData?.coupons || [])
      .filter((c) => c.meetsMinimum)
      .sort((a, b) => Number(b.minOrderPaise) - Number(a.minOrderPaise));
    return eligible[0] || null;
  }, [couponData]);

  if (!cart || count === 0) return null;
  // Sit clearly ABOVE the floating tab bar (its pill is ~68 tall on top of the safe-area padding),
  // with a real gap so the two glass bars never touch/merge.
  const barBottom = bottom ?? Math.max(insets.bottom, 12) + 68 + 16;

  const min = Number(cart.minOrderValuePaise);
  const short = min - subtotal;
  // Same note as the basket's MinimumBar: the coupon nudges interpolate the server's English-only
  // `discountText`, so they stay English rather than reading half-translated.
  const rupeesTo = (n) => Math.ceil((n - subtotal) / 100);
  // Live nudge: reach ₹500 (and the first offer it qualifies for), then each higher coupon tier.
  const applied = cart.coupon;
  let nudge;
  let chasing = true;
  if (short > 0) {
    const firstReward = nextCoupon && Number(nextCoupon.minOrderPaise) <= min ? nextCoupon : null;
    nudge = firstReward
      ? `Add ₹${rupeesTo(min)} more to qualify for ${firstReward.discountText}`
      : `Add ₹${rupeesTo(min)} more to reach ₹500`;
  } else if (nextCoupon) {
    nudge = `Add ₹${rupeesTo(Number(nextCoupon.minOrderPaise))} more to qualify for ${nextCoupon.discountText}`;
  } else if (applied) {
    nudge = `${applied.label || 'Coupon'} applied`;
    chasing = false;
  } else if (availableCoupon) {
    // Eligible but not applied: tell them it is theirs to take, and where to take it.
    nudge = `${availableCoupon.discountText} available — add it in your basket`;
  } else {
    nudge = t('readyToCheckout', lang);
    chasing = false;
  }
  return (
    <Animated.View
      entering={FadeInDown.duration(320).springify().damping(18)}
      exiting={FadeOutDown.duration(200)}
      layout={LinearTransition.springify().damping(18)}
      pointerEvents="box-none"
      style={[styles.host, { bottom: barBottom }]}
    >
      <Pressy
        onPress={() => router.push('/cart')}
        haptics="soft"
        scale={0.98}
        accessibilityLabel={t('viewBasket', lang)}
      >
        <Glass tone="dark" radius={radius.lg} innerStyle={styles.inner}>
          <View style={styles.iconWrap}>
            <ShoppingBag size={20} color={colors.ink} strokeWidth={2.3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" color={colors.inkOnDark}>
              {count} {count === 1 ? t('item', lang) : t('items', lang)} {t('inYourBasket', lang)}
            </Text>
            <Small color={chasing ? '#F6D5C8' : 'rgba(243,245,239,0.7)'}>{nudge}</Small>
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
