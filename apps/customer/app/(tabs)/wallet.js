import React, { useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useDispatch } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Plus, Wallet as WalletIcon } from 'lucide-react-native';
import {
  Ambient,
  Button,
  Display,
  EmptyState,
  Glass,
  Label,
  Money,
  Pressy,
  Sheet,
  Skeleton,
  Small,
  Text,
} from '../../src/ui';
import { LedgerRow } from '../../src/components/LedgerRow';
import { PaymentSimulator } from '../../src/components/PaymentSimulator';
import { CartBar } from '../../src/components/CartBar';
import {
  useCreateTopupMutation,
  useGetWalletQuery,
  useVerifyPaymentMutation,
} from '../../src/api/api';
import { showToast } from '../../src/features/ui/uiSlice';
import { colors, fonts, radius } from '../../src/theme';
import { formatPaise } from '../../src/lib/money';
import { openRazorpay, razorpayAvailable } from '../../src/lib/razorpay';
import { haptic } from '../../src/lib/haptics';
import { notifyLocal } from '../../src/lib/notifications';

export default function Wallet() {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const { data, isLoading, isFetching, refetch } = useGetWalletQuery();
  const [createTopup, { isLoading: creating }] = useCreateTopupMutation();
  const [verifyPayment] = useVerifyPaymentMutation();
  const [amount, setAmount] = useState(null);
  const [intent, setIntent] = useState(null);
  const topupSheet = useRef(null);
  const simSheet = useRef(null);
  const denominations = data?.denominationsPaise || ['50000', '100000', '200000', '500000'];

  const settle = async (paymentId, result) => {
    try {
      const res = await verifyPayment({
        paymentId,
        razorpayPaymentId: result.paymentId,
        // The signature and gateway order id are what PROVE this payment. Sending only the payment
        // id makes the server verify a signature it was never given, which fails every real
        // top-up — the money leaves the customer's account and the wallet is never credited.
        razorpayOrderId: result.razorpayOrderId,
        razorpaySignature: result.signature,
        success: result.success,
      }).unwrap();
      if (result.success) {
        haptic.success();
        dispatch(
          showToast({
            title: 'Wallet topped up',
            message: `Balance ${formatPaise(res.walletBalancePaise)}`,
            tone: 'success',
          }),
        );
        notifyLocal(
          'Wallet credited',
          `Your balance is now ${formatPaise(res.walletBalancePaise)}.`,
        );
      } else {
        dispatch(
          showToast({
            title: 'Payment not completed',
            message: 'Nothing was charged.',
            tone: 'error',
          }),
        );
      }
    } catch (e) {
      dispatch(showToast({ title: e?.message || 'Could not confirm payment', tone: 'error' }));
    } finally {
      setIntent(null);
      simSheet.current?.dismiss();
      refetch();
    }
  };

  const startTopup = async () => {
    if (!amount) return;
    try {
      const res = await createTopup(amount).unwrap();
      topupSheet.current?.dismiss();
      const pi = res.paymentIntent;
      setIntent(pi);
      if (razorpayAvailable) {
        try {
          const r = await openRazorpay(pi);
          await settle(pi.paymentId, {
            success: true,
            paymentId: r.razorpay_payment_id,
            razorpayOrderId: r.razorpay_order_id,
            signature: r.razorpay_signature,
          });
        } catch {
          await settle(pi.paymentId, { success: false });
        }
      } else {
        setTimeout(() => simSheet.current?.present(), 250);
      }
    } catch (e) {
      dispatch(showToast({ title: e?.message || 'Could not start top-up', tone: 'error' }));
    }
  };

  return (
    <View style={styles.root}>
      <Ambient />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 200,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !!data}
            onRefresh={refetch}
            tintColor={colors.leaf}
          />
        }
      >
        <Display>Wallet</Display>
        <Small muted style={{ marginTop: 4, marginBottom: 20 }}>
          Prepaid, never expires, spends only here.
        </Small>

        <Animated.View entering={FadeInDown.duration(420).springify().damping(18)}>
          <View style={styles.card}>
            <LinearGradient
              colors={['#0B1510', '#14382A', '#1E7A4C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.orb} />
            <View style={{ padding: 22 }}>
              <View style={styles.cardTop}>
                <Label style={{ color: 'rgba(243,245,239,0.6)' }}>Balance</Label>
                <WalletIcon size={20} color={colors.sprout} />
              </View>
              {isLoading ? (
                <Skeleton
                  width={160}
                  height={40}
                  style={{ marginTop: 10, backgroundColor: 'rgba(255,255,255,0.15)' }}
                />
              ) : (
                <Money
                  paise={data?.balancePaise || 0}
                  animated
                  variant="hero"
                  color={colors.inkOnDark}
                  style={{ marginTop: 8 }}
                />
              )}
              <Small color="rgba(243,245,239,0.65)" style={{ marginTop: 8 }}>
                Applied automatically at checkout. Any remainder goes to Razorpay.
              </Small>
              <View style={{ marginTop: 18 }}>
                <Button
                  title="Add money"
                  variant="accent"
                  onPress={() => topupSheet.current?.present()}
                  icon={<Plus size={18} color={colors.ink} strokeWidth={2.5} />}
                  full={false}
                  size="md"
                />
              </View>
            </View>
          </View>
        </Animated.View>

        <Label style={{ marginTop: 28, marginBottom: 6 }}>Statement</Label>
        {isLoading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={64} />
            <Skeleton height={64} />
          </View>
        ) : (data?.ledger || []).length === 0 ? (
          <EmptyState
            title="No movements yet"
            message="Top-ups, order debits and refunds all show up here, every paisa accounted for."
          />
        ) : (
          <Glass radius={radius.lg} innerStyle={{ paddingHorizontal: 16 }}>
            {data.ledger.map((e) => (
              <LedgerRow key={e.id} entry={e} />
            ))}
          </Glass>
        )}
      </ScrollView>

      <Sheet
        ref={topupSheet}
        title="Add money"
        subtitle="Choose an amount. UPI, cards and net banking via Razorpay."
      >
        <View style={styles.denoms}>
          {denominations.map((d) => {
            const active = amount === d;
            return (
              <Pressy
                key={d}
                onPress={() => setAmount(d)}
                haptics="select"
                style={{ width: '48%' }}
              >
                <Glass
                  radius={radius.lg}
                  elevated={active}
                  innerStyle={[styles.denom, active && styles.denomActive]}
                >
                  <Text
                    style={{
                      fontFamily: fonts.display,
                      fontSize: 24,
                      lineHeight: 28,
                      color: active ? colors.sprout : colors.ink,
                    }}
                  >
                    {formatPaise(d)}
                  </Text>
                  <Small color={active ? 'rgba(243,245,239,0.7)' : colors.ink3}>
                    {Number(d) >= 200000
                      ? 'about a month'
                      : Number(d) >= 100000
                        ? 'two weeks'
                        : 'one basket'}
                  </Small>
                </Glass>
              </Pressy>
            );
          })}
        </View>
        <Button
          title={amount ? `Add ${formatPaise(amount)}` : 'Choose an amount'}
          onPress={startTopup}
          disabled={!amount}
          loading={creating}
          style={{ marginTop: 18 }}
        />
        <Small muted center style={{ marginTop: 10 }}>
          Balance is credited only once Razorpay confirms the payment.
        </Small>
      </Sheet>

      <PaymentSimulator
        ref={simSheet}
        intent={intent}
        onResult={(r) => intent && settle(intent.paymentId, r)}
      />
      <CartBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  card: { borderRadius: radius.xl, overflow: 'hidden' },
  orb: {
    position: 'absolute',
    right: -50,
    top: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(205,245,106,0.12)',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  denoms: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  denom: { padding: 16 },
  denomActive: { backgroundColor: colors.night },
});
