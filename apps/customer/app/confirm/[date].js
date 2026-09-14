import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, CalendarCheck, MapPin, Sunrise } from 'lucide-react-native';
import { Ambient, Button, Display, Glass, Label, Money, Pressy, Small, Text } from '../../src/ui';
import { MealCard } from '../../src/components/MealCard';
import { PlanShoppingList } from '../../src/components/PlanShoppingList';
import { PaymentSimulator } from '../../src/components/PaymentSimulator';
import {
  useGetAddressesQuery,
  useGetCartQuery,
  useGetCatalogQuery,
  useGetWalletQuery,
  useGetWindowsQuery,
  usePlaceOrderMutation,
  useSetCartItemMutation,
  useVerifyPaymentMutation,
} from '../../src/api/api';
import { dayOrdered, selectScheduled } from '../../src/features/plan/planSlice';
import { selectCustomer } from '../../src/features/auth/authSlice';
import { showToast } from '../../src/features/ui/uiSlice';
import { orderQuantityFor } from '../../src/lib/nutrition';
import { formatDateShort, WINDOWS } from '../../src/lib/dates';
import { idempotencyKey } from '../../src/lib/ids';
import { openRazorpay, razorpayAvailable } from '../../src/lib/razorpay';
import { haptic } from '../../src/lib/haptics';
import { notifyLocal } from '../../src/lib/notifications';
import { colors, radius } from '../../src/theme';

/**
 * "Confirm tomorrow's order". Reached from the evening reminder or the in-app banner.
 * One tap fills the basket from the plan, picks the delivery window for that date and places the
 * order, so the customer never has to rebuild the basket by hand.
 */
export default function ConfirmDay() {
  const { date } = useLocalSearchParams();
  const dateISO = String(date);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const customer = useSelector(selectCustomer);
  const scheduled = useSelector(selectScheduled);
  const catalog = useGetCatalogQuery();
  const addresses = useGetAddressesQuery();
  const wallet = useGetWalletQuery();
  const cart = useGetCartQuery();
  const [setCartItem] = useSetCartItemMutation();
  const [placeOrder] = usePlaceOrderMutation();
  const [verifyPayment] = useVerifyPaymentMutation();
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState(null);
  const [pendingOrder, setPendingOrder] = useState(null);
  const idem = useRef(idempotencyKey());
  const simSheet = useRef(null);

  const productsById = useMemo(
    () => Object.fromEntries((catalog.data?.products || []).map((p) => [p.id, p])),
    [catalog.data],
  );
  const plan = scheduled.find((p) => p.days.some((d) => d.date === dateISO));
  const day = plan?.days.find((d) => d.date === dateISO);
  const meals = day?.meals;
  const alreadyOrdered = !!plan?.ordered?.includes(dateISO);

  const shopping = useMemo(() => {
    const agg = {};
    (meals || []).forEach((m) =>
      m.items.forEach((it) => (agg[it.productId] = (agg[it.productId] || 0) + it.grams)),
    );
    return Object.entries(agg).map(([productId, grams]) => ({ productId, grams }));
  }, [meals]);

  const lines = useMemo(
    () =>
      shopping
        .map((s) => {
          const p = productsById[s.productId];
          if (!p) return null;
          const qty = orderQuantityFor(p, s.productId, s.grams);
          return { p, qty, paise: Math.round(Number(p.pricePaise) * qty) };
        })
        .filter(Boolean),
    [shopping, productsById],
  );
  const subtotal = lines.reduce((s, l) => s + l.paise, 0);

  const address =
    (addresses.data?.addresses || []).find((a) => a.isDefault) ||
    (addresses.data?.addresses || [])[0];
  const windows = useGetWindowsQuery({ addressId: address?.id }, { skip: !address });
  // Prefer a window on the planned day; if the community does not deliver that day (or it is full),
  // fall back to the nearest open window and say so rather than dead-ending the customer.
  const slot = useMemo(() => {
    const open = (windows.data?.windows || []).filter((w) => w.isOpen);
    return open.find((w) => w.date === dateISO) || open.find((w) => w.date >= dateISO) || open[0];
  }, [windows.data, dateISO]);
  const slotIsOnDay = slot?.date === dateISO;
  const balance = Number(wallet.data?.balancePaise || 0);
  const walletApplied = Math.min(balance, subtotal);
  const gateway = Math.max(0, subtotal - walletApplied);

  const finish = (order) => {
    haptic.success();
    if (plan) dispatch(dayOrdered({ id: plan.id, date: dateISO, orderId: order.id }));
    notifyLocal(
      'Order confirmed',
      `${order.orderNumber} arrives ${formatDateShort(order.deliveryDate)}, ${WINDOWS[order.window]?.label.toLowerCase()}.`,
    );
    router.replace({ pathname: '/order/success', params: { id: order.id } });
  };

  const settle = async (pi, result) => {
    try {
      const res = await verifyPayment({
        paymentId: pi.paymentId,
        razorpayPaymentId: result.paymentId,
        success: result.success,
      }).unwrap();
      if (result.success) finish(res.order || pendingOrder);
      else {
        haptic.error();
        dispatch(
          showToast({
            title: 'Payment not completed',
            message: 'Nothing was charged.',
            tone: 'error',
          }),
        );
        idem.current = idempotencyKey();
      }
    } catch (e) {
      dispatch(showToast({ title: e?.message || 'Could not confirm payment', tone: 'error' }));
    } finally {
      simSheet.current?.dismiss();
      setIntent(null);
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!plan || lines.length === 0) {
      dispatch(showToast({ title: 'Nothing to order for that day', tone: 'neutral' }));
      return;
    }
    if (!address) {
      dispatch(showToast({ title: 'Add a delivery address first', tone: 'neutral' }));
      router.push('/address/new');
      return;
    }
    if (!slot) {
      dispatch(
        showToast({
          title: 'No delivery window left for that day',
          message: 'Pick another window from the basket.',
          tone: 'error',
        }),
      );
      return;
    }
    setBusy(true);
    haptic.soft();
    try {
      const planIds = new Set(lines.map((l) => l.p.id));
      for (const l of lines)
        await setCartItem({ productId: l.p.id, quantity: String(l.qty) }).unwrap();
      // Reconcile the server cart to exactly the plan lines so pre-existing basket
      // items are not charged silently alongside this order.
      const current = await cart.refetch().unwrap();
      for (const it of current?.cart?.items || []) {
        if (!planIds.has(it.productId))
          await setCartItem({ productId: it.productId, quantity: '0' }).unwrap();
      }
      const res = await placeOrder({
        idempotencyKey: idem.current,
        addressId: address.id,
        deliveryDate: slot.date,
        window: slot.window,
        useWallet: true,
      }).unwrap();
      setPendingOrder(res.order);
      if (!res.paymentIntent) {
        finish(res.order);
        setBusy(false);
        return;
      }
      setIntent(res.paymentIntent);
      if (razorpayAvailable) {
        try {
          const r = await openRazorpay({
            ...res.paymentIntent,
            contact: customer?.mobile,
            name: customer?.name,
          });
          await settle(res.paymentIntent, { success: true, paymentId: r.razorpay_payment_id });
        } catch {
          await settle(res.paymentIntent, { success: false });
        }
      } else {
        setTimeout(() => simSheet.current?.present(), 200);
      }
    } catch (e) {
      haptic.error();
      idem.current = idempotencyKey();
      dispatch(showToast({ title: e?.message || 'Could not place the order', tone: 'error' }));
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Ambient />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 140,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressy
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/calendar'))}
            haptics="select"
            accessibilityLabel="Back"
          >
            <Glass radius={radius.pill} innerStyle={styles.iconBtn}>
              <ArrowLeft size={20} color={colors.ink} />
            </Glass>
          </Pressy>
        </View>

        <Animated.View entering={FadeInDown.duration(360).springify().damping(18)}>
          <Label>Tomorrow’s plan</Label>
          <Display style={{ marginTop: 2 }}>{formatDateShort(dateISO)}</Display>
          <Small muted style={{ marginTop: 4 }}>
            {plan?.title || 'Your plan'} · {(meals || []).length} meals · harvested tonight if you
            confirm now
          </Small>
        </Animated.View>

        {alreadyOrdered ? (
          <Animated.View entering={FadeInDown.delay(60).duration(320)} style={{ marginTop: 16 }}>
            <Glass radius={radius.lg} innerStyle={styles.done}>
              <CalendarCheck size={20} color={colors.leafDeep} />
              <Text variant="bodyMedium" color={colors.leafDeep}>
                Already ordered for this day
              </Text>
            </Glass>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(80).duration(360)} style={{ marginTop: 16 }}>
          <Glass radius={radius.lg} innerStyle={styles.row}>
            <View style={styles.rowIcon}>
              <MapPin size={18} color={colors.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium">
                {address ? `${address.block} · ${address.flat}` : 'Add a delivery address'}
              </Text>
              <Small muted>{address?.communityName}</Small>
            </View>
          </Glass>
          <View style={{ height: 10 }} />
          <Glass radius={radius.lg} innerStyle={styles.row}>
            <View style={styles.rowIcon}>
              <Sunrise size={18} color={colors.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium">
                {slot
                  ? `${slotIsOnDay ? '' : `${formatDateShort(slot.date)} · `}${WINDOWS[slot.window]?.label}`
                  : 'No window available'}
              </Text>
              <Small muted={slotIsOnDay} color={slotIsOnDay ? undefined : colors.amber}>
                {!slot
                  ? 'No delivery window is open right now'
                  : slotIsOnDay
                    ? WINDOWS[slot.window]?.hours
                    : `We don’t deliver on ${formatDateShort(dateISO)} — nearest window shown`}
              </Small>
            </View>
          </Glass>
        </Animated.View>

        <Label style={{ marginTop: 24, marginBottom: 8 }}>What you’ll cook</Label>
        <View style={{ gap: 10 }}>
          {(meals || []).map((m, i) => (
            <MealCard key={i} meal={m} productsById={productsById} index={i} compact />
          ))}
        </View>

        <Label style={{ marginTop: 24, marginBottom: 8 }}>What we’ll harvest</Label>
        <PlanShoppingList shopping={shopping} productsById={productsById} compact />
      </ScrollView>

      <View
        pointerEvents="box-none"
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}
      >
        <Glass tone="dark" radius={radius.xl} liquid innerStyle={styles.footerInner}>
          <View style={{ flex: 1 }}>
            <Small color="rgba(243,245,239,0.65)">
              {gateway > 0
                ? `Wallet ₹${Math.round(walletApplied / 100)} + pay`
                : 'Covered by wallet'}
            </Small>
            <Money paise={gateway} animated color={colors.inkOnDark} variant="h2" />
          </View>
          <Button
            title={alreadyOrdered ? 'Order again' : 'Confirm order'}
            variant="accent"
            size="md"
            full={false}
            loading={busy}
            onPress={confirm}
          />
        </Glass>
      </View>

      <PaymentSimulator
        ref={simSheet}
        intent={intent}
        onResult={(r) => intent && settle(intent, r)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  footer: { position: 'absolute', left: 16, right: 16, bottom: 0 },
  footerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
});
