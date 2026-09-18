import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Calendar, MapPin, Ticket, Wallet } from 'lucide-react-native';
import {
  Ambient,
  Button,
  Display,
  Glass,
  Input,
  Label,
  Money,
  Pressy,
  Sheet,
  Small,
  Text,
} from '../src/ui';
import { WindowPicker } from '../src/components/WindowPicker';
import { PaymentSimulator } from '../src/components/PaymentSimulator';
import { useCart } from '../src/hooks/useCart';
import {
  useGetAddressesQuery,
  useGetWalletQuery,
  useGetWindowsQuery,
  usePlaceOrderMutation,
  useRemoveCouponMutation,
  useVerifyPaymentMutation,
} from '../src/api/api';
import { selectCustomer } from '../src/features/auth/authSlice';
import { showToast } from '../src/features/ui/uiSlice';
import { colors, radius } from '../src/theme';
import { env } from '../src/lib/env';
import { formatDateShort, WINDOWS } from '../src/lib/dates';
import { idempotencyKey } from '../src/lib/ids';
import { openRazorpay, razorpayAvailable } from '../src/lib/razorpay';
import { haptic } from '../src/lib/haptics';
import { notifyLocal } from '../src/lib/notifications';

/** @param {any} props */
function Card({
  icon,
  title,
  subtitle,
  onPress = undefined,
  right = null,
  children = null,
  delay = 0,
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(360).springify().damping(18)}
      style={{ marginTop: 12 }}
    >
      <Pressy onPress={onPress} haptics="soft" scale={0.99} disabled={!onPress}>
        <Glass radius={radius.lg} innerStyle={{ padding: 16 }}>
          <View style={styles.cardRow}>
            <View style={styles.cardIcon}>{icon}</View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium">{title}</Text>
              {subtitle ? <Small muted>{subtitle}</Small> : null}
            </View>
            {right}
          </View>
          {children}
        </Glass>
      </Pressy>
    </Animated.View>
  );
}

export default function Checkout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const customer = useSelector(selectCustomer);
  const { cart } = useCart();
  const addresses = useGetAddressesQuery();
  const wallet = useGetWalletQuery();
  const [placeOrder, { isLoading: placing }] = usePlaceOrderMutation();
  const [verifyPayment] = useVerifyPaymentMutation();
  const [removeCoupon] = useRemoveCouponMutation();
  const [addressId, setAddressId] = useState(null);
  const [slot, setSlot] = useState(null);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [useWallet, setUseWallet] = useState(true);
  const [intent, setIntent] = useState(null);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const idem = useRef(idempotencyKey());
  const windowSheet = useRef(null);
  const addressSheet = useRef(null);
  const simSheet = useRef(null);

  const list = useMemo(() => addresses.data?.addresses || [], [addresses.data]);
  const address = useMemo(
    () => list.find((a) => a.id === addressId) || list.find((a) => a.isDefault) || list[0],
    [list, addressId],
  );
  const windows = useGetWindowsQuery(
    { addressId: address?.id, communityId: address?.communityId },
    { skip: !address },
  );
  // After the chosen window fills up we must NOT quietly pick another day for the customer — they
  // choose again themselves. While this is set, there is no default slot.
  const [mustPick, setMustPick] = useState(false);
  // Default to the earliest open window until the customer picks one (derived, not synced state).
  const chosenSlot = useMemo(() => {
    if (slot) return slot;
    if (mustPick) return null;
    const first = windows.data?.windows?.find((w) => w.isOpen);
    return first ? { date: first.date, window: first.window } : null;
  }, [slot, mustPick, windows.data]);
  // How many days a week this community actually delivers (distinct weekdays in the 14-day schedule)
  // — the sheet used to hard-code "three days a week", which was wrong for 4-day communities.
  const deliveryDayCount = useMemo(() => {
    const set = new Set(
      (windows.data?.windows || []).map((w) => new Date(`${w.date}T00:00:00Z`).getUTCDay()),
    );
    return set.size;
  }, [windows.data]);

  const balance = Number(wallet.data?.balancePaise || 0);
  const total = Number(cart?.totalPaise || 0);
  const walletApplied = useWallet ? Math.min(balance, total) : 0;
  const gateway = total - walletApplied;

  const finish = (order) => {
    haptic.success();
    notifyLocal(
      'Order confirmed',
      `${order.orderNumber} arrives ${formatDateShort(order.deliveryDate)}, ${WINDOWS[order.window]?.label.toLowerCase()}.`,
    );
    router.replace({ pathname: '/order/success', params: { id: order.id } });
  };

  const settle = async (pi, result, order = pendingOrder) => {
    try {
      const res = await verifyPayment({
        paymentId: pi.paymentId,
        razorpayPaymentId: result.paymentId,
        success: result.success,
      }).unwrap();
      if (result.success) finish(res.order || order);
      else {
        haptic.error();
        dispatch(
          showToast({
            title: 'Payment not completed',
            message: 'Your basket is safe. Try again when ready.',
            tone: 'error',
          }),
        );
        idem.current = idempotencyKey();
        if (order?.id) router.replace({ pathname: '/order/[id]', params: { id: order.id } });
        else router.replace('/(tabs)/orders');
      }
    } catch (e) {
      dispatch(showToast({ title: e?.message || 'Could not confirm payment', tone: 'error' }));
    } finally {
      simSheet.current?.dismiss();
      setIntent(null);
      setSubmitting(false);
    }
  };

  const place = async () => {
    if (!address || !chosenSlot) {
      haptic.warning();
      dispatch(
        showToast({
          title: !address ? 'Add a delivery address' : 'Choose a delivery window',
          tone: 'neutral',
        }),
      );
      if (address) windowSheet.current?.present(); // take them straight to the picker
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await placeOrder({
        idempotencyKey: idem.current,
        addressId: address.id,
        deliveryDate: chosenSlot.date,
        window: chosenSlot.window,
        couponCode: cart?.coupon?.code,
        useWallet,
        deliveryNote: deliveryNote.trim() || undefined,
      }).unwrap();
      setPendingOrder(res.order);
      if (!res.paymentIntent) {
        finish(res.order);
        setSubmitting(false);
        return;
      }
      setIntent(res.paymentIntent);
      // Having the native SDK linked is not enough — the gateway also has to have actually issued an
      // order. A dev/staging API with no Razorpay credentials returns a paymentIntent with no
      // razorpayOrderId, and opening the SDK with that fails with Razorpay's own "Something went
      // wrong" sheet, which made it impossible to complete a checkout locally. Require both; the
      // simulated sheet below then covers dev, and production without a gateway still refuses
      // outright rather than faking a success.
      if (razorpayAvailable && res.paymentIntent.razorpayOrderId) {
        try {
          const r = await openRazorpay({
            ...res.paymentIntent,
            contact: customer?.mobile,
            name: customer?.name,
          });
          await settle(
            res.paymentIntent,
            { success: true, paymentId: r.razorpay_payment_id },
            res.order,
          );
        } catch {
          await settle(res.paymentIntent, { success: false }, res.order);
        }
      } else if (__DEV__ || env.useMocks || env.isExpoGo) {
        setTimeout(() => simSheet.current?.present(), 200);
      } else {
        // Real production build with no Razorpay module — never fake a success sheet.
        haptic.error();
        dispatch(
          showToast({
            title: 'Payment unavailable',
            message: 'We couldn’t start the payment. Your basket is safe — try again shortly.',
            tone: 'error',
          }),
        );
        setIntent(null);
        setSubmitting(false);
      }
    } catch (e) {
      haptic.error();
      setSubmitting(false);
      if (e?.code === 'ORDER_CUTOFF_PASSED') {
        // The window's cut-off time passed while they were checking out (it can be minutes away —
        // that's the whole point of the countdown). Do NOT move them to another day on their
        // behalf — clear the selection, refresh the schedule and open the picker so they choose.
        setSlot(null);
        setMustPick(true);
        windows.refetch();
        dispatch(
          showToast({
            title: 'That window just closed',
            message: 'Please pick another delivery window.',
            tone: 'neutral',
          }),
        );
        setTimeout(() => windowSheet.current?.present(), 250);
      } else if (
        e?.code === 'COUPON_ALREADY_USED' ||
        e?.code === 'COUPON_EXPIRED' ||
        e?.code === 'COUPON_CAP_REACHED'
      ) {
        removeCoupon();
        dispatch(showToast({ title: 'Coupon removed', message: e.message, tone: 'error' }));
      } else {
        dispatch(showToast({ title: e?.message || 'Could not place order', tone: 'error' }));
      }
      idem.current = idempotencyKey();
    }
  };

  if (!cart)
    return (
      <View style={styles.root}>
        <Ambient />
        <View style={[styles.header, { paddingTop: insets.top + 8, paddingHorizontal: 20 }]}>
          <Pressy onPress={() => router.back()} haptics="select" accessibilityLabel="Back">
            <Glass radius={radius.pill} innerStyle={styles.iconBtn}>
              <ArrowLeft size={20} color={colors.ink} />
            </Glass>
          </Pressy>
          <Display>Checkout</Display>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Small muted>Loading your basket…</Small>
        </View>
      </View>
    );

  return (
    <View style={styles.root}>
      <Ambient />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: 220,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressy onPress={() => router.back()} haptics="select" accessibilityLabel="Back">
            <Glass radius={radius.pill} innerStyle={styles.iconBtn}>
              <ArrowLeft size={20} color={colors.ink} />
            </Glass>
          </Pressy>
          <Display>Checkout</Display>
        </View>

        <Card
          icon={<MapPin size={18} color={colors.ink} />}
          title={address ? `${address.block} · ${address.flat}` : 'Add a delivery address'}
          subtitle={
            address ? `${address.communityName}, ${address.area}` : 'Community, block and flat'
          }
          onPress={() =>
            list.length ? addressSheet.current?.present() : router.push('/address/new')
          }
          right={<Small color={colors.leafDeep}>Change</Small>}
        />

        <Card
          icon={<Calendar size={18} color={colors.ink} />}
          title={
            chosenSlot
              ? `${formatDateShort(chosenSlot.date)} · ${WINDOWS[chosenSlot.window]?.label}`
              : 'Choose a delivery window'
          }
          subtitle={chosenSlot ? WINDOWS[chosenSlot.window]?.hours : 'Morning 6–12 or evening 5–9'}
          onPress={() => windowSheet.current?.present()}
          right={<Small color={colors.leafDeep}>Change</Small>}
          delay={60}
        />

        <Card
          icon={<Ticket size={18} color={colors.ink} />}
          title={cart.coupon ? cart.coupon.code : 'Add a coupon'}
          subtitle={cart.coupon ? cart.coupon.label : 'One per order'}
          onPress={() => (cart.coupon ? removeCoupon() : router.push('/coupon'))}
          right={
            cart.coupon ? (
              <Money
                paise={-Number(cart.couponDiscountPaise)}
                variant="bodyMedium"
                color={colors.leafDeep}
              />
            ) : null
          }
          delay={120}
        />

        <Card
          icon={<Wallet size={18} color={colors.ink} />}
          title="Pay from wallet first"
          subtitle={
            balance > 0
              ? `Balance ₹${Math.round(balance / 100)} · remainder via Razorpay`
              : 'No balance yet. Everything goes via Razorpay.'
          }
          right={
            balance === 0 ? (
              // Wallet empty: tapping explains why it can't be turned on (instead of a dead toggle).
              <Pressy
                haptics="warning"
                onPress={() =>
                  dispatch(
                    showToast({
                      title: 'Your wallet is empty',
                      message: 'Add money to your wallet to pay with it.',
                      tone: 'neutral',
                    }),
                  )
                }
              >
                <View pointerEvents="none">
                  <Switch
                    value={false}
                    disabled
                    trackColor={{ true: colors.leaf, false: 'rgba(14,27,20,0.15)' }}
                    thumbColor={colors.white}
                  />
                </View>
              </Pressy>
            ) : (
              <Switch
                value={useWallet}
                onValueChange={setUseWallet}
                trackColor={{ true: colors.leaf, false: 'rgba(14,27,20,0.15)' }}
                thumbColor={colors.white}
              />
            )
          }
          delay={180}
        />

        <Animated.View
          entering={FadeInDown.delay(210).duration(360).springify().damping(18)}
          style={{ marginTop: 20 }}
        >
          <Label>Delivery instructions (optional)</Label>
          <Glass radius={radius.lg} innerStyle={{ padding: 12, marginTop: 8 }}>
            <Input
              value={deliveryNote}
              onChangeText={(t) => setDeliveryNote(t.slice(0, 200))}
              placeholder="Leave with the guard, gate code, call on arrival…"
              maxLength={200}
              autoCapitalize="sentences"
            />
          </Glass>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(240).duration(360).springify().damping(18)}
          style={{ marginTop: 20 }}
        >
          <Label>Summary</Label>
          <Glass radius={radius.lg} innerStyle={{ padding: 16, marginTop: 8 }}>
            {cart.items.map((it) => (
              <View key={it.id} style={styles.itemRow}>
                <Small muted style={{ flex: 1 }} numberOfLines={1}>
                  {it.name} × {Number(it.quantity)}
                  {it.unit === 'KG' ? ' kg' : ''}
                </Small>
                <Money paise={it.lineTotalPaise} variant="small" />
              </View>
            ))}
            <View style={styles.divider} />
            <SummaryRow label="Subtotal" paise={cart.subtotalPaise} />
            {Number(cart.couponDiscountPaise) > 0 ? (
              <SummaryRow
                label="Coupon"
                paise={-Number(cart.couponDiscountPaise)}
                color={colors.leafDeep}
              />
            ) : null}
            <SummaryRow label="Delivery" paise={cart.deliveryChargePaise} />
            {walletApplied > 0 ? (
              <SummaryRow label="Wallet" paise={-walletApplied} color={colors.leafDeep} />
            ) : null}
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text variant="bodyMedium">To pay now</Text>
              <Money paise={gateway} animated variant="h2" />
            </View>
          </Glass>
          <Small muted style={{ marginTop: 10 }}>
            Prices lock when you place the order. Variable-weight items are billed on packed weight,
            within ±10%. Cancel free until the evening before your window.
          </Small>
        </Animated.View>
      </ScrollView>

      <View
        pointerEvents="box-none"
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}
      >
        <Glass tone="dark" radius={radius.xl} liquid innerStyle={styles.footerInner}>
          <View style={{ flex: 1 }}>
            <Small color="rgba(243,245,239,0.65)">
              {gateway > 0 ? 'Pay via Razorpay' : 'Covered by wallet'}
            </Small>
            <Money paise={gateway} animated color={colors.inkOnDark} variant="h2" />
          </View>
          <Button
            title={gateway > 0 ? 'Pay & place order' : 'Place order'}
            variant="accent"
            size="md"
            full={false}
            onPress={place}
            loading={placing || submitting}
            disabled={submitting}
          />
        </Glass>
      </View>

      <Sheet
        ref={windowSheet}
        title="Delivery window"
        subtitle={
          address
            ? deliveryDayCount > 0
              ? `${address.communityName} delivers ${deliveryDayCount} day${deliveryDayCount > 1 ? 's' : ''} a week`
              : address.communityName
            : undefined
        }
        scroll
        snapPoints={['72%']}
      >
        <WindowPicker
          windows={windows.data?.windows}
          loading={windows.isLoading || windows.isFetching}
          value={chosenSlot}
          onChange={(v) => {
            setSlot(v);
            setMustPick(false);
          }}
        />
        <Button
          title="Use this window"
          onPress={() => windowSheet.current?.dismiss()}
          style={{ marginTop: 20 }}
        />
      </Sheet>

      <Sheet ref={addressSheet} title="Deliver to">
        <View style={{ gap: 10 }}>
          {list.map((a) => (
            <Pressy
              key={a.id}
              onPress={() => {
                setAddressId(a.id);
                setSlot(null);
                addressSheet.current?.dismiss();
              }}
              haptics="select"
            >
              <Glass
                radius={radius.md}
                elevated={false}
                innerStyle={[styles.addr, address?.id === a.id && styles.addrActive]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">
                    {a.block} · {a.flat}
                  </Text>
                  <Small muted>{a.communityName}</Small>
                </View>
                {a.isDefault ? <Small color={colors.leafDeep}>Default</Small> : null}
              </Glass>
            </Pressy>
          ))}
          <Button
            title="Add another address"
            variant="glass"
            size="md"
            onPress={() => {
              addressSheet.current?.dismiss();
              router.push('/address/new');
            }}
          />
        </View>
      </Sheet>

      <PaymentSimulator
        ref={simSheet}
        intent={intent}
        onResult={(r) => intent && settle(intent, r)}
      />
    </View>
  );
}

/** @param {any} props */
function SummaryRow({ label, paise, color = undefined }) {
  return (
    <View style={styles.summaryRow}>
      <Small muted>{label}</Small>
      <Money paise={paise} variant="bodyMedium" color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginVertical: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  footer: { position: 'absolute', left: 16, right: 16, bottom: 0 },
  footerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  addr: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  addrActive: { borderWidth: 1.5, borderColor: colors.leaf },
});
