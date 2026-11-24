import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  useQuoteItemsQuery,
  useSetCartItemMutation,
  useVerifyPaymentMutation,
} from '../../src/api/api';
import { dayOrdered, daySkipped, selectScheduled } from '../../src/features/plan/planSlice';
import { selectCustomer } from '../../src/features/auth/authSlice';
import { showToast } from '../../src/features/ui/uiSlice';
import { mayAct } from '../../src/lib/orderIsland';
import { askForIsland, claimIslandLink, orderIsland } from '../../src/lib/orderIslandNative';
import { orderForMeals, quoteLines } from '../../src/lib/planOrder';
import { selectAiVisible } from '../../src/features/role/roleSlice';
import { formatPaise } from '../../src/lib/money';
import {
  formatDateShort,
  relativeDayLabel,
  todayISO,
  windowHours,
  windowLabel,
} from '../../src/lib/dates';
import { idempotencyKey } from '../../src/lib/ids';
import { classifyGatewayError, openRazorpay, paymentPathFor } from '../../src/lib/razorpay';
import { haptic } from '../../src/lib/haptics';
import { notifyLocal } from '../../src/lib/notifications';
import { colors, radius } from '../../src/theme';

/**
 * "Confirm tomorrow's order". Reached from the evening reminder or the in-app banner.
 * One tap fills the basket from the plan, picks the delivery window for that date and places the
 * order, so the customer never has to rebuild the basket by hand.
 */
export default function ConfirmDay() {
  const { date, do: doParam, k: linkToken } = useLocalSearchParams();
  const dateISO = String(date);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const customer = useSelector(selectCustomer);
  const canShowIsland = useSelector(selectAiVisible) && orderIsland.supported();
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
  const skipped = !!plan?.skipped?.includes(dateISO);

  const { shopping, lines } = useMemo(
    () => orderForMeals(meals, productsById),
    [meals, productsById],
  );
  const subtotal = lines.reduce((s, l) => s + l.paise, 0);

  // The real bill, fees and tax included. Until it answers (or if it cannot), the items alone are
  // shown, and the server still decides what is charged.
  const quoteArgs = useMemo(() => quoteLines(lines), [lines]);
  const quoteQuery = useQuoteItemsQuery(quoteArgs, { skip: quoteArgs.length === 0 });
  const quote = quoteQuery.currentData?.quote || null;
  const total = quote ? Number(quote.totalPaise) : subtotal;

  const address =
    (addresses.data?.addresses || []).find((a) => a.isDefault) ||
    (addresses.data?.addresses || [])[0];
  const windows = useGetWindowsQuery(
    { addressId: address?.id },
    { skip: !address, refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );
  // Prefer a window on the planned day; if the community does not deliver that day (or it is full),
  // fall back to the nearest open window and say so rather than dead-ending the customer.
  const slot = useMemo(() => {
    const open = (windows.data?.windows || []).filter((w) => w.isOpen);
    return open.find((w) => w.date === dateISO) || open.find((w) => w.date >= dateISO) || open[0];
  }, [windows.data, dateISO]);
  const slotIsOnDay = slot?.date === dateISO;
  const balance = Number(wallet.data?.balancePaise || 0);
  const walletApplied = Math.min(balance, total);
  const gateway = Math.max(0, total - walletApplied);
  // Nothing to confirm: no plan covers this date, or the plan's day has no produce in it. Decided
  // only once the catalogue is in — before that every line is "unknown product" and the day would
  // flash as empty.
  // A reminder can be opened days late. A day that has gone cannot be harvested for; offering the
  // "nearest window" instead would quietly turn last week's plan into an order for this week.
  const past = dateISO < todayISO();
  const empty = past || (!!catalog.data && (!plan || lines.length === 0));
  const dayWord = relativeDayLabel(dateISO);
  const isNear = dayWord === 'Today' || dayWord === 'Tomorrow';
  // The server refuses an order under the minimum. Say so here, with the gap, rather than let the
  // customer press Confirm and learn it from an error.
  const minOrder = Number(cart.data?.cart?.minOrderValuePaise || 0);
  const belowMin = !empty && minOrder > 0 && subtotal > 0 && subtotal < minOrder;
  const rupees = (paise) => Math.round(paise / 100).toLocaleString('en-IN');

  /**
   * "Skip this day": order nothing for it, and stop asking. Skipping is exactly as easy as
   * confirming — one tap, from here or straight from the reminder's own button — because a plan the
   * customer cannot step out of for a day is a subscription trap, not a convenience.
   */
  const skip = () => {
    if (!plan) return;
    haptic.soft();
    dispatch(daySkipped({ id: plan.id, date: dateISO }));
    dispatch(
      showToast({
        title: `Skipped ${formatDateShort(dateISO)}`,
        message: 'Nothing was ordered and nothing was charged.',
        tone: 'neutral',
      }),
    );
    if (router.canGoBack()) router.back();
    else router.replace('/calendar');
  };

  // Arrived from the reminder's "Skip this day" button: do it, once. ("Confirm & pay" needs no
  // special handling — it lands here with the amount in view and one button to press. The order is
  // never placed from the notification itself.)
  const acted = useRef(false);
  useEffect(() => {
    if (acted.current || doParam !== 'skip' || !plan) return;
    acted.current = true;
    skip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doParam, plan]);

  // Arrived from the Dynamic Island's "Pay ₹620" or "Cash on delivery". The customer has already
  // answered twice (Confirm order, then how to pay) with the amount in front of them, so the order
  // goes straight through, but only for a link from our own card, and only if the total is still
  // the one it showed. Otherwise this is the ordinary screen, with the reason in a message.
  const actedOn = useRef(null);
  const quoteSettled = !!quote || quoteQuery.isError;
  useEffect(() => {
    if (doParam !== 'pay' && doParam !== 'cod') return;
    if (!linkToken || actedOn.current === linkToken || busy) return;
    if (!plan || !lines.length || !address || !windows.data || !wallet.data || !quoteSettled)
      return;
    actedOn.current = linkToken;
    const card = claimIslandLink({ date: dateISO, token: String(linkToken) });
    if (!card) return;
    const verdict = mayAct({
      action: doParam,
      card,
      quote,
      slotOnDay: slotIsOnDay && !past,
      ordered: alreadyOrdered,
    });
    if (verdict.go) confirm({ cash: doParam === 'cod' });
    else dispatch(showToast({ title: verdict.title, message: verdict.message, tone: 'neutral' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doParam, linkToken, plan, lines, address, windows.data, wallet.data, quoteSettled, busy]);

  const finish = (order) => {
    haptic.success();
    if (plan) dispatch(dayOrdered({ id: plan.id, date: dateISO, orderId: order.id }));
    notifyLocal(
      'Order confirmed',
      `${order.orderNumber} arrives ${formatDateShort(order.deliveryDate)}, ${windowLabel(order.window).toLowerCase()}.`,
    );
    router.replace({ pathname: '/order/success', params: { id: order.id } });
  };

  const settle = async (pi, result) => {
    try {
      const res = await verifyPayment({
        paymentId: pi.paymentId,
        razorpayPaymentId: result.paymentId,
        // Same proof the checkout screen sends — without it the server rejects a payment the
        // customer has already made.
        razorpayOrderId: result.razorpayOrderId,
        razorpaySignature: result.signature,
        success: result.success,
      }).unwrap();
      if (result.success) finish(res.order || pendingOrder);
      else {
        haptic.error();
        dispatch(
          showToast({
            title: result.declined ? 'Payment declined' : 'Payment not completed',
            message: result.declined
              ? 'Your bank or UPI app declined it. Nothing was charged.'
              : 'Nothing was charged.',
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

  /** Make the server basket exactly this day's produce — nothing left over from earlier shopping. */
  const fillBasket = async () => {
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
  };

  /** Under the minimum: put the day's produce in the basket and let the customer add to it there. */
  const toBasket = async () => {
    setBusy(true);
    try {
      await fillBasket();
      router.push('/cart');
    } catch (e) {
      dispatch(showToast({ title: e?.message || 'Could not open the basket', tone: 'error' }));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async ({ cash = false } = {}) => {
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
      await fillBasket();
      const res = await placeOrder({
        idempotencyKey: idem.current,
        addressId: address.id,
        deliveryDate: slot.date,
        window: slot.window,
        useWallet: !cash,
        paymentMethod: cash ? 'COD' : 'PREPAID',
        // The total on this screen (or on the island card). A different one is refused, not charged.
        expectedTotalPaise: quote ? String(quote.totalPaise) : undefined,
      }).unwrap();
      setPendingOrder(res.order);
      if (!res.paymentIntent) {
        finish(res.order);
        setBusy(false);
        return;
      }
      setIntent(res.paymentIntent);
      // Review #46 (21 Nov 2026): this fell through to the simulated sheet in a production build
      // whenever the SDK was missing. Shared rule: lib/paymentPath.js.
      const path = paymentPathFor(res.paymentIntent);
      if (path === 'native') {
        try {
          const r = await openRazorpay({
            ...res.paymentIntent,
            contact: customer?.mobile,
            name: customer?.name,
          });
          await settle(res.paymentIntent, {
            success: true,
            paymentId: r.razorpay_payment_id,
            razorpayOrderId: r.razorpay_order_id,
            signature: r.razorpay_signature,
          });
        } catch (gatewayError) {
          const kind = classifyGatewayError(gatewayError);
          if (kind === 'unknown') {
            // Connection dropped mid-payment — the money may have gone; let the server settle it
            // instead of marking the order failed from here (review #3).
            haptic.warning();
            dispatch(
              showToast({
                title: 'Checking your payment',
                message: 'If money left your account, this order confirms in a few minutes.',
                tone: 'neutral',
              }),
            );
            setIntent(null);
            setBusy(false);
            orderIsland.endAll(); // do not ask again while this payment is being checked
            if (res.order?.id)
              router.replace({ pathname: '/order/[id]', params: { id: res.order.id } });
            return;
          }
          await settle(res.paymentIntent, { success: false, declined: kind === 'failed' });
        }
      } else if (path === 'simulated') {
        setTimeout(() => simSheet.current?.present(), 200);
      } else {
        haptic.error();
        setIntent(null);
        setBusy(false);
        dispatch(
          showToast({
            title: 'Couldn’t start the payment',
            message: 'Nothing was charged. Please try again shortly.',
            tone: 'error',
          }),
        );
      }
    } catch (e) {
      haptic.error();
      idem.current = idempotencyKey();
      if (e?.code === 'PRICE_CHANGED') quoteQuery.refetch();
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
          <Label>{isNear ? `${dayWord}’s plan` : 'Plan for'}</Label>
          <Display style={{ marginTop: 2 }}>{formatDateShort(dateISO)}</Display>
          {empty ? null : (
            <Small muted style={{ marginTop: 4 }}>
              {plan?.title || 'Your plan'} · {(meals || []).length}{' '}
              {(meals || []).length === 1 ? 'meal' : 'meals'} · harvested for you once you confirm
            </Small>
          )}
        </Animated.View>

        {/* Reached from an old reminder, or for a day the plan no longer covers. It used to show
            "0 meals · 0 products" over a live "Confirm order ₹0" button. */}
        {empty ? (
          <Animated.View entering={FadeInDown.delay(60).duration(320)} style={{ marginTop: 20 }}>
            <Glass radius={radius.lg} innerStyle={{ padding: 20 }}>
              <Text variant="bodyMedium">
                {past ? 'This day has passed' : 'Nothing is planned for this day'}
              </Text>
              <Small muted style={{ marginTop: 4 }}>
                There is no order to confirm and nothing will be charged. Plan the day, or pick what
                you want from today’s harvest.
              </Small>
              <Button
                title="Open the planner"
                onPress={() => router.replace('/(tabs)/plan')}
                style={{ marginTop: 16 }}
              />
              <Button
                title="Shop instead"
                variant="ghost"
                onPress={() => router.replace('/(tabs)')}
                style={{ marginTop: 6 }}
              />
            </Glass>
          </Animated.View>
        ) : null}

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

        {empty ? null : (
          <>
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
                      ? `${slotIsOnDay ? '' : `${formatDateShort(slot.date)} · `}${windowLabel(slot.window, slot)}`
                      : 'No window available'}
                  </Text>
                  <Small muted={slotIsOnDay} color={slotIsOnDay ? undefined : colors.amber}>
                    {!slot
                      ? 'No delivery window is open right now'
                      : slotIsOnDay
                        ? windowHours(slot.window, slot)
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

            {/* Cash, when the shop takes it for an order this size. The same answer the card gives. */}
            {plan && !alreadyOrdered && !belowMin && slot && quote?.codAllowed ? (
              <Button
                title={`Cash on delivery · ${formatPaise(total)}`}
                variant="ghost"
                disabled={busy}
                onPress={() => confirm({ cash: true })}
                style={{ marginTop: 18 }}
              />
            ) : null}
            {plan && !alreadyOrdered && !skipped && canShowIsland && dayWord === 'Tomorrow' ? (
              <Button
                title="Show on Dynamic Island"
                variant="ghost"
                onPress={askForIsland}
                style={{ marginTop: 6 }}
              />
            ) : null}
            {plan && !alreadyOrdered ? (
              <Button
                title="Skip this day — order nothing"
                variant="ghost"
                onPress={skip}
                style={{ marginTop: 18 }}
              />
            ) : null}
            {belowMin ? (
              <Glass radius={radius.lg} innerStyle={{ padding: 14 }} style={{ marginTop: 14 }}>
                <Text variant="smallMedium">
                  Orders start at ₹{rupees(minOrder)}. This day comes to ₹{rupees(subtotal)}.
                </Text>
                <Small muted style={{ marginTop: 2 }}>
                  Add ₹{rupees(minOrder - subtotal)} more in the basket and order from there.
                </Small>
              </Glass>
            ) : null}
            <Small muted center style={{ marginTop: 10, fontSize: 11.5 }}>
              You pay only when you press the button below. Prices are the ones shown; anything sold
              by weight is billed on what is actually packed.
            </Small>
          </>
        )}
      </ScrollView>

      {/* One bar, one button. The big number is what the order COSTS; the line above it says where
          the money comes from; the button says exactly what pressing it will charge. The old bar
          showed only the part left after the wallet, so an order the wallet covered read "₹0". */}
      {empty ? null : (
        <View
          pointerEvents="box-none"
          style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}
        >
          <Glass tone="dark" radius={radius.xl} liquid innerStyle={styles.footerInner}>
            <View style={{ flex: 1 }}>
              <Small color="rgba(243,245,239,0.65)" numberOfLines={1}>
                {gateway === 0
                  ? 'Paid from your wallet'
                  : walletApplied > 0
                    ? `Wallet ₹${rupees(walletApplied)} + ₹${rupees(gateway)} to pay`
                    : 'UPI, card or netbanking'}
              </Small>
              <Money paise={total} animated color={colors.inkOnDark} variant="h2" />
            </View>
            <Button
              title={
                belowMin
                  ? 'Open basket'
                  : gateway > 0
                    ? `Pay ₹${rupees(gateway)}`
                    : alreadyOrdered
                      ? 'Order again'
                      : 'Confirm order'
              }
              variant="accent"
              size="md"
              full={false}
              loading={busy}
              onPress={belowMin ? toBasket : () => confirm()}
            />
          </Glass>
        </View>
      )}

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
