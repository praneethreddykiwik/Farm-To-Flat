import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useKeyboardHeight } from '../src/hooks/useKeyboardHeight';
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
import { OrderTerms } from '../src/components/OrderTerms';
import { PaymentSimulator } from '../src/components/PaymentSimulator';
import { useCart } from '../src/hooks/useCart';
import {
  useGetAddressesQuery,
  useGetWalletQuery,
  useGetSupportQuery,
  useGetWindowsQuery,
  usePlaceOrderMutation,
  useRemoveCouponMutation,
  useVerifyPaymentMutation,
} from '../src/api/api';
import { selectCustomer } from '../src/features/auth/authSlice';
import { showToast } from '../src/features/ui/uiSlice';
import { colors, radius } from '../src/theme';
import { env } from '../src/lib/env';
import { formatDateShort, windowHours, windowLabel } from '../src/lib/dates';
import { selectLanguage } from '../src/features/ui/uiSlice';
import { t } from '../src/lib/i18n';
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
  const kb = useKeyboardHeight();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const customer = useSelector(selectCustomer);
  const lang = useSelector(selectLanguage);
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
  // Whether the operator is accepting cash right now, and up to what order value. Read live rather
  // than assumed: cash can be switched off between one checkout and the next.
  const support = useGetSupportQuery();
  const codOffered = !!support.data?.payment?.codEnabled;
  const codMax = Number(support.data?.payment?.codMaxOrderPaise || 0);
  const [payCash, setPayCash] = useState(false);
  // Not pre-ticked. A pre-ticked box is not consent, and on a fresh-produce order the replacement
  // rule is precisely the part people need to have actually read.
  const [termsAccepted, setTermsAccepted] = useState(false);
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
    // Always re-ask on arrival. The operator can change a community's delivery days while the app
    // sits open, and a cached schedule would keep offering days the farm no longer serves.
    { skip: !address, refetchOnMountOrArgChange: true, refetchOnFocus: true },
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
  // The full window object behind that choice — it carries the operator's own name and delivery
  // hours for the window, which the two-entry table in lib/dates cannot know for a custom one.
  const chosenWindow = useMemo(
    () =>
      (windows.data?.windows || []).find(
        (w) => w.date === chosenSlot?.date && w.window === chosenSlot?.window,
      ) || null,
    [windows.data, chosenSlot],
  );
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
  // A cash order is paid entirely in cash — the wallet is not split across it (the server enforces
  // the same rule), so the toggle is taken out of play while cash is chosen.
  const codTooBig = codOffered && codMax > 0 && total > codMax;
  const canPayCash = codOffered && !codTooBig;
  const cash = payCash && canPayCash;
  const walletApplied = useWallet && !cash ? Math.min(balance, total) : 0;
  const gateway = cash ? 0 : total - walletApplied;

  const finish = (order) => {
    haptic.success();
    notifyLocal(
      'Order confirmed',
      `${order.orderNumber} arrives ${formatDateShort(order.deliveryDate)}, ${windowLabel(order.window).toLowerCase()}.`,
    );
    router.replace({ pathname: '/order/success', params: { id: order.id } });
  };

  const settle = async (pi, result, order = pendingOrder) => {
    try {
      const res = await verifyPayment({
        paymentId: pi.paymentId,
        razorpayPaymentId: result.paymentId,
        // The signature is what PROVES this capture came from Razorpay, and the server refuses to
        // confirm the order without it once real gateway keys are configured. Forward everything
        // the SDK handed back — sending only the payment id makes every successful payment fail
        // verification and strands the order in PENDING_PAYMENT until the sweeper cancels it.
        razorpayOrderId: result.razorpayOrderId,
        razorpaySignature: result.signature,
        success: result.success,
      }).unwrap();
      if (result.success) finish(res.order || order);
      else {
        haptic.error();
        dispatch(
          showToast({
            title: 'Payment cancelled',
            message: 'Your basket is still here. Try again when ready.',
            tone: 'error',
          }),
        );
        idem.current = idempotencyKey();
        // The server hands the basket back when a payment is abandoned, so put the customer where
        // that basket is — the cart — not on a PAYMENT_FAILED order they cannot do anything with.
        // Backing out of the gateway used to strand them on a dead order screen with an empty bag.
        router.replace('/cart');
      }
    } catch (e) {
      // The gateway may already have taken the money. Never leave the customer staring at an empty
      // checkout with nothing but a toast — put them on the order so they can see its real state.
      dispatch(showToast({ title: e?.message || 'Could not confirm payment', tone: 'error' }));
      if (order?.id) router.replace({ pathname: '/order/[id]', params: { id: order.id } });
    } finally {
      simSheet.current?.dismiss();
      setIntent(null);
      setSubmitting(false);
    }
  };

  const place = async () => {
    if (!termsAccepted) {
      haptic.warning();
      dispatch(
        showToast({
          title: 'Please read and accept the terms',
          message: 'They cover cancellations, weighed items and what to do if something is wrong.',
          tone: 'neutral',
        }),
      );
      return;
    }
    if (!address || !chosenSlot) {
      haptic.warning();
      dispatch(
        showToast({
          title: !address ? t('addDeliveryAddress', lang) : 'Choose a delivery window',
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
        useWallet: cash ? false : useWallet,
        paymentMethod: cash ? 'COD' : 'PREPAID',
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
            {
              success: true,
              paymentId: r.razorpay_payment_id,
              razorpayOrderId: r.razorpay_order_id,
              signature: r.razorpay_signature,
            },
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
          <Display>{t('checkout', lang)}</Display>
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
          // 220 clears the sticky pay footer; the keyboard has to be added on top of it, or the
          // delivery-instructions field is typed into from behind the keyboard.
          paddingBottom: 220 + kb,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressy onPress={() => router.back()} haptics="select" accessibilityLabel="Back">
            <Glass radius={radius.pill} innerStyle={styles.iconBtn}>
              <ArrowLeft size={20} color={colors.ink} />
            </Glass>
          </Pressy>
          <Display>{t('checkout', lang)}</Display>
        </View>

        <Card
          icon={<MapPin size={18} color={colors.ink} />}
          title={address ? `${address.block} · ${address.flat}` : t('addDeliveryAddress', lang)}
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
              ? `${formatDateShort(chosenSlot.date)} · ${windowLabel(chosenSlot.window, chosenWindow)}`
              : 'Choose a delivery window'
          }
          subtitle={
            chosenSlot
              ? windowHours(chosenSlot.window, chosenWindow)
              : 'Pick the day and window that suit you'
          }
          onPress={() => windowSheet.current?.present()}
          right={<Small color={colors.leafDeep}>Change</Small>}
          delay={60}
        />

        <Card
          icon={<Ticket size={18} color={colors.ink} />}
          title={cart.coupon ? cart.coupon.code : t('addCoupon', lang)}
          subtitle={cart.coupon ? cart.coupon.label : t('onePerOrder', lang)}
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
          title={t('payFromWalletFirst', lang)}
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

        {codOffered ? (
          <Animated.View
            entering={FadeInDown.delay(195).duration(360).springify().damping(18)}
            style={{ marginTop: 20 }}
          >
            <Label>How you’ll pay</Label>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              {[
                { cash: false, title: 'Pay now', sub: 'UPI, card or wallet' },
                { cash: true, title: 'Cash on delivery', sub: 'Pay at your door' },
              ].map((opt) => {
                const active = cash === opt.cash;
                const blocked = opt.cash && codTooBig;
                return (
                  <Pressy
                    key={String(opt.cash)}
                    style={{ flex: 1 }}
                    haptics="select"
                    disabled={blocked}
                    onPress={() => setPayCash(opt.cash)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, disabled: blocked }}
                    accessibilityLabel={opt.title}
                  >
                    <Glass
                      radius={radius.lg}
                      innerStyle={{
                        padding: 14,
                        borderWidth: 1.5,
                        borderColor: active ? colors.leaf : 'rgba(14,27,20,0.10)',
                        opacity: blocked ? 0.45 : 1,
                      }}
                    >
                      <Label style={{ color: active ? colors.leafDeep : colors.ink }}>
                        {opt.title}
                      </Label>
                      <Small muted style={{ marginTop: 3 }}>
                        {opt.sub}
                      </Small>
                    </Glass>
                  </Pressy>
                );
              })}
            </View>
            {/* Say WHY the option is unavailable rather than silently hiding it — otherwise a
                customer who used cash last week thinks the app is broken. */}
            {codTooBig ? (
              <Small muted style={{ marginTop: 8 }}>
                Orders above ₹{Math.round(codMax / 100)} are paid online.
              </Small>
            ) : null}
          </Animated.View>
        ) : null}

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
          entering={FadeInDown.delay(225).duration(360).springify().damping(18)}
          style={{ marginTop: 20 }}
        >
          <Label style={{ marginBottom: 8 }}>Before you pay</Label>
          <OrderTerms accepted={termsAccepted} onToggle={() => setTermsAccepted((v) => !v)} />
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
            {/* A cash order collects nothing now, so `gateway` is 0 — but printing ₹0 above
                "pay cash" told the customer the opposite of what they owe at the door. Cash shows
                the amount to have ready; the wallet label belongs only to a wallet-covered order. */}
            <Small color="rgba(243,245,239,0.65)">
              {cash ? 'Pay at the door' : gateway > 0 ? 'Pay via Razorpay' : 'Covered by wallet'}
            </Small>
            <Money paise={cash ? total : gateway} animated color={colors.inkOnDark} variant="h2" />
          </View>
          <Button
            title={
              cash ? 'Place order · pay cash' : gateway > 0 ? 'Pay & place order' : 'Place order'
            }
            variant="accent"
            size="md"
            full={false}
            onPress={place}
            loading={placing || submitting}
            // NOT disabled on the terms: place() already answers an un-ticked box with a toast
            // saying what to do, and disabling the button here meant that press never fired — the
            // customer tapped a bright green "Place order" and got nothing at all.
            disabled={submitting}
          />
        </Glass>
      </View>

      <Sheet
        ref={windowSheet}
        title={t('deliveryWindow', lang)}
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
          title={t('useThisWindow', lang)}
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
