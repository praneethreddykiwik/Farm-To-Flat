import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { NotebookPen, ShoppingBasket, Ticket, Trash2, X } from 'lucide-react-native';
import {
  Ambient,
  Button,
  Display,
  EmptyState,
  Glass,
  Money,
  Pressy,
  ProductImage,
  Skeleton,
  Small,
  Stepper,
  Text,
  VariableWeightNote,
} from '../src/ui';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useCart, useCartLine } from '../src/hooks/useCart';
import {
  useGetCouponsQuery,
  useRemoveCartItemMutation,
  useRemoveCouponMutation,
  useSetCartItemMutation,
} from '../src/api/api';
import { showToast } from '../src/features/ui/uiSlice';
import { colors, fonts, motion, radius } from '../src/theme';
import { haptic } from '../src/lib/haptics';

function Line({ item }) {
  const { quantity, setQuantity } = useCartLine({ id: item.productId, name: item.name });
  const [remove] = useRemoveCartItemMutation();
  const [setCartItem] = useSetCartItemMutation();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(item.note || '');
  const saveNote = () => {
    const v = note.trim();
    setCartItem({ productId: item.productId, quantity: String(quantity), note: v || null });
    setNoteOpen(false);
  };
  return (
    <Animated.View
      layout={LinearTransition.springify().damping(18)}
      exiting={FadeOut.duration(180)}
      style={styles.line}
    >
      <ProductImage
        uri={item.image}
        blurhash={item.blurhash}
        tint={item.tint}
        name={item.name}
        size={64}
        radius={radius.md}
        recyclingKey={item.productId}
      />
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {item.name}
        </Text>
        <Small muted>
          ₹{Math.round(Number(item.unitPricePaise) / 100)}{' '}
          {item.unit === 'KG' ? '/kg' : `/${item.unit.toLowerCase()}`}
        </Small>
        {item.variableWeight ? <VariableWeightNote /> : null}
        <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
          <Stepper
            value={quantity}
            increment={item.increment}
            unit={item.unit}
            onChange={setQuantity}
            size="sm"
          />
        </View>
        {noteOpen ? (
          <TextInput
            value={note}
            onChangeText={setNote}
            onBlur={saveNote}
            onSubmitEditing={saveNote}
            autoFocus
            placeholder="e.g. clean and cut into curry pieces"
            placeholderTextColor={colors.ink3}
            returnKeyType="done"
            style={styles.noteInput}
          />
        ) : (
          <Pressy
            onPress={() => setNoteOpen(true)}
            haptics="soft"
            style={styles.noteBtn}
            accessibilityLabel={item.note ? 'Edit note' : 'Add a note'}
          >
            <NotebookPen size={13} color={colors.leafDeep} />
            <Small color={item.note ? colors.ink2 : colors.leafDeep} numberOfLines={1}>
              {item.note ? `“${item.note}”` : 'Add a note'}
            </Small>
          </Pressy>
        )}
      </View>
      <View
        style={{ alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch' }}
      >
        <Money paise={item.lineTotalPaise} variant="bodyMedium" />
        <Pressy
          onPress={() => remove(item.id)}
          haptics="select"
          accessibilityLabel={`Remove ${item.name}`}
          style={styles.trash}
        >
          <Trash2 size={16} color={colors.ink3} />
        </Pressy>
      </View>
    </Animated.View>
  );
}

/**
 * Progress toward the ₹500 minimum first, then — once that's met — toward the next coupon the basket
 * hasn't unlocked yet (e.g. "Spend ₹150 more to unlock 15% off"). Tracks live as the total grows.
 */
function MinimumBar({ subtotal, minimum, nextCoupon }) {
  const sub = Number(subtotal);
  const min = Number(minimum);
  const belowMin = sub < min;
  // The current goal: the ₹500 minimum, else the next locked coupon's threshold.
  const target = belowMin ? min : nextCoupon ? Number(nextCoupon.minOrderPaise) : min;
  const pct = target > 0 ? Math.min(1, sub / target) : 1;
  // Animate a numeric pixel width, not a percentage string: reanimated cannot animate a `%` width on
  // Android (the fill renders at 0 and the coloured bar is invisible), so we measure the track once
  // with onLayout and drive px instead. Mirrors NutritionBars.
  const [trackW, setTrackW] = useState(0);
  const w = useSharedValue(0);
  useEffect(() => {
    if (!trackW) return;
    w.value = withSpring(pct * trackW, motion.springSoft);
  }, [pct, trackW, w]);
  const style = useAnimatedStyle(() => ({ width: w.value }));

  // Progressive, tier-by-tier nudge:
  //  • below ₹500  → how much more to reach the minimum, and the first offer it unlocks
  //  • past ₹500   → how much more to reach the NEXT offer (10% → 15% → 20% …)
  //  • all unlocked→ celebrate
  const rupeesTo = (t) => Math.ceil((t - sub) / 100);
  const built = Math.floor(sub / 100);
  let message;
  if (belowMin) {
    // A coupon whose threshold is at/below the ₹500 minimum is the first reward you get at ₹500.
    const firstReward = nextCoupon && Number(nextCoupon.minOrderPaise) <= min ? nextCoupon : null;
    message = firstReward
      ? `You're at ₹${built} — add ₹${rupeesTo(min)} more to reach ₹500 and unlock ${firstReward.discountText}`
      : `You're at ₹${built} — add ₹${rupeesTo(min)} more to reach the ₹500 minimum`;
  } else if (nextCoupon) {
    message = `Add ₹${rupeesTo(Number(nextCoupon.minOrderPaise))} more to avail ${nextCoupon.discountText}`;
  } else {
    message = "You've unlocked every offer 🎉";
  }
  const fillColor = belowMin ? colors.amber : colors.leaf;

  return (
    <View style={{ marginTop: 14 }}>
      <View style={styles.track} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
        <Animated.View style={[styles.fill, { backgroundColor: fillColor }, style]} />
      </View>
      <Small muted style={{ marginTop: 6 }}>
        {message}
      </Small>
    </View>
  );
}

export default function Cart() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const { cart, isLoading } = useCart();
  const [removeCoupon] = useRemoveCouponMutation();
  // The next coupon the basket hasn't unlocked yet — drives the progressive "spend ₹X more" nudge.
  const { data: couponData } = useGetCouponsQuery(Number(cart?.subtotalPaise || 0), {
    skip: !cart,
  });
  const nextCoupon = useMemo(() => {
    const locked = (couponData?.coupons || []).filter((c) => !c.meetsMinimum);
    return locked.sort((a, b) => Number(a.minOrderPaise) - Number(b.minOrderPaise))[0] || null;
  }, [couponData]);
  const items = cart?.items || [];
  const isSheet = Platform.OS === 'ios';

  const navigating = useRef(false);
  // The basket is a native form sheet pushed from the tab bar; dismiss() is the reliable way out.
  const close = () => {
    if (router.canDismiss()) router.dismiss();
    else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };
  const browse = () => {
    close();
    setTimeout(() => router.navigate('/(tabs)'), 50);
  };
  const checkout = () => {
    if (navigating.current) return;
    if (!cart?.meetsMinimum) {
      haptic.warning();
      dispatch(
        showToast({
          title: 'Minimum basket is ₹500',
          message: 'Add a little more and you’re there.',
          tone: 'neutral',
        }),
      );
      return;
    }
    // Replace the sheet with the checkout screen so the native form sheet dismisses cleanly.
    navigating.current = true;
    router.replace('/checkout');
  };

  // A native form sheet is its own UIViewController: it needs its own gesture root AND portal host,
  // otherwise sheets presented from inside it (the coupon sheet) never appear.
  return (
    <GestureHandlerRootView style={styles.root}>
      <BottomSheetModalProvider>
        <View style={[styles.root, isSheet && styles.sheetRoot]}>
          <Ambient intensity={0.7} />
          <View style={[styles.header, { paddingTop: isSheet ? 18 : insets.top + 12 }]}>
            <View style={{ flex: 1 }}>
              <Display>Your basket</Display>
              <Small muted style={{ marginTop: 2 }}>
                {items.length
                  ? `${items.length} ${items.length === 1 ? 'item' : 'items'} · prices lock at checkout`
                  : 'Nothing here yet'}
              </Small>
            </View>
            <Pressy onPress={close} haptics="select" accessibilityLabel="Close">
              <Glass radius={radius.pill} innerStyle={styles.close}>
                <X size={20} color={colors.ink} />
              </Glass>
            </Pressy>
          </View>

          {isLoading && !cart ? (
            <View style={{ paddingHorizontal: 20, gap: 12 }}>
              <Skeleton height={88} />
              <Skeleton height={88} />
            </View>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<ShoppingBasket size={30} color={colors.ink2} />}
              title="An empty basket"
              message="Add anything from the catalog. Minimum order is ₹500 and delivery is free."
              action={{ title: 'Browse', onPress: browse }}
            />
          ) : (
            <>
              <ScrollView
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 220 }}
                showsVerticalScrollIndicator={false}
              >
                <Animated.View entering={FadeInDown.duration(360).springify().damping(18)}>
                  <Glass radius={radius.lg} innerStyle={{ paddingHorizontal: 14 }}>
                    {items.map((it) => (
                      <Line key={it.id} item={it} />
                    ))}
                  </Glass>
                </Animated.View>

                <Animated.View
                  entering={FadeInDown.delay(80).duration(360).springify().damping(18)}
                  style={{ marginTop: 14 }}
                >
                  <Pressy
                    onPress={() => (cart.coupon ? removeCoupon() : router.push('/coupon'))}
                    haptics="soft"
                    scale={0.985}
                  >
                    <Glass radius={radius.lg} innerStyle={styles.coupon}>
                      <View
                        style={[
                          styles.couponIcon,
                          { backgroundColor: cart.coupon ? colors.leafSoft : colors.butter },
                        ]}
                      >
                        <Ticket size={18} color={cart.coupon ? colors.leafDeep : '#7A5A00'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium">
                          {cart.coupon ? cart.coupon.code : 'Add a coupon'}
                        </Text>
                        <Small muted>
                          {cart.coupon
                            ? `${cart.coupon.label} · tap to remove`
                            : 'From the brochure or the packet sticker'}
                        </Small>
                      </View>
                      {cart.coupon ? (
                        <Money
                          paise={-Number(cart.coupon.discountPaise)}
                          variant="bodyMedium"
                          color={colors.leafDeep}
                        />
                      ) : null}
                    </Glass>
                  </Pressy>
                </Animated.View>

                <Animated.View
                  entering={FadeInDown.delay(140).duration(360).springify().damping(18)}
                  style={{ marginTop: 14 }}
                >
                  <Glass radius={radius.lg} innerStyle={{ padding: 16 }}>
                    <Row label="Subtotal" paise={cart.subtotalPaise} />
                    {Number(cart.couponDiscountPaise) > 0 ? (
                      <Row
                        label="Coupon"
                        paise={-Number(cart.couponDiscountPaise)}
                        color={colors.leafDeep}
                      />
                    ) : null}
                    <Row label="Delivery" paise={cart.deliveryChargePaise} free />
                    <MinimumBar
                      subtotal={cart.subtotalPaise}
                      minimum={cart.minOrderValuePaise}
                      nextCoupon={nextCoupon}
                    />
                  </Glass>
                </Animated.View>
              </ScrollView>

              <View
                pointerEvents="box-none"
                style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}
              >
                <Glass tone="dark" radius={radius.xl} liquid innerStyle={styles.footerInner}>
                  <View style={{ flex: 1 }}>
                    <Small color="rgba(243,245,239,0.65)">Total</Small>
                    <Money paise={cart.totalPaise} animated color={colors.inkOnDark} variant="h2" />
                  </View>
                  <Button
                    title="Checkout"
                    variant="accent"
                    size="md"
                    full={false}
                    onPress={checkout}
                  />
                </Glass>
              </View>
            </>
          )}
        </View>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

/** @param {any} props */
function Row({ label, paise, color = undefined, free = false }) {
  return (
    <View style={styles.row}>
      <Small muted>{label}</Small>
      {free && Number(paise) === 0 ? (
        <Text variant="smallMedium" color={colors.leafDeep}>
          Free
        </Text>
      ) : (
        <Money paise={paise} variant="bodyMedium" color={color} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  sheetRoot: { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  line: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  trash: { padding: 6, marginRight: -6, marginBottom: -4 },
  noteBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, maxWidth: 180 },
  noteInput: {
    marginTop: 8,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 200,
  },
  coupon: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  couponIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(14,27,20,0.08)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  footer: { position: 'absolute', left: 16, right: 16, bottom: 0 },
  footerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
});
