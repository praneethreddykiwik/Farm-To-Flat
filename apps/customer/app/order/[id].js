import React, { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, MapPin, RotateCcw, Share2 } from 'lucide-react-native';
import {
  Ambient,
  Button,
  Glass,
  Label,
  Money,
  Mono,
  Pressy,
  ProductImage,
  Skeleton,
  Small,
  StatusPill,
  Text,
  Title,
} from '../../src/ui';
import { OrderStatusTimeline } from '../../src/components/OrderStatusTimeline';
import {
  useCancelOrderMutation,
  useGetOrderQuery,
  useSetCartItemMutation,
} from '../../src/api/api';
import { showToast } from '../../src/features/ui/uiSlice';
import { colors, radius } from '../../src/theme';
import { formatDateShort, WINDOWS } from '../../src/lib/dates';
import { formatQty } from '../../src/ui/Stepper';

export default function OrderDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  // Poll while this screen is open so an admin status change (Confirmed → Packing → …) shows up
  // within a few seconds and the timeline animates forward on its own.
  const { data, isLoading, refetch } = useGetOrderQuery(id, {
    pollingInterval: 10000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const [cancel, { isLoading: cancelling }] = useCancelOrderMutation();
  const [setCartItem] = useSetCartItemMutation();
  const [reordering, setReordering] = useState(false);
  const order = data?.order;
  // Finished orders (cancelled, delivered, or failed) can be re-ordered: refill the basket with the
  // same items at today's prices, then drop the customer into the basket to review and check out.
  const canReorder = !!order && ['CANCELLED', 'DELIVERED', 'PAYMENT_FAILED'].includes(order.status);

  const rupees = (p) => `₹${(Number(p) / 100).toFixed(2)}`;
  const shareInvoice = async () => {
    if (!order) return;
    const lines = order.items
      .map(
        (it) => `• ${it.name} — ${formatQty(it.quantity, it.unit)}   ${rupees(it.lineTotalPaise)}`,
      )
      .join('\n');
    const msg = [
      `Farm to Flat — invoice`,
      `${order.orderNumber} · ${formatDateShort(order.deliveryDate)} · ${WINDOWS[order.window]?.label}`,
      `${order.address.block} · ${order.address.flat}, ${order.address.communityName}`,
      '',
      lines,
      '',
      `Subtotal   ${rupees(order.subtotalPaise)}`,
      Number(order.couponDiscountPaise) > 0
        ? `Coupon ${order.couponCode}   −${rupees(order.couponDiscountPaise)}`
        : null,
      Number(order.walletAppliedPaise) > 0
        ? `Paid from wallet   −${rupees(order.walletAppliedPaise)}`
        : null,
      `Total   ${rupees(order.totalPaise)}`,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await Share.share({ message: msg });
    } catch {
      /* user dismissed the share sheet */
    }
  };

  const reorder = async () => {
    if (!order) return;
    setReordering(true);
    try {
      for (const it of order.items) {
        await setCartItem({ productId: it.productId, quantity: String(it.quantity) }).unwrap();
      }
      dispatch(showToast({ title: 'Added to your basket', tone: 'success' }));
      router.push('/cart');
    } catch (e) {
      dispatch(showToast({ title: e?.message || 'Could not add all items', tone: 'error' }));
    } finally {
      setReordering(false);
    }
  };

  const confirmCancel = () => {
    Alert.alert(
      'Cancel this order?',
      'Anything paid from your wallet is returned instantly. Gateway payments are refunded to the original method.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel order',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancel(id).unwrap();
              dispatch(showToast({ title: 'Order cancelled', tone: 'success' }));
              refetch();
            } catch (e) {
              dispatch(showToast({ title: e?.message || 'Could not cancel', tone: 'error' }));
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <Ambient />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressy
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/orders'))}
            haptics="select"
            accessibilityLabel="Back"
          >
            <Glass radius={radius.pill} innerStyle={styles.iconBtn}>
              <ArrowLeft size={20} color={colors.ink} />
            </Glass>
          </Pressy>
          {order ? (
            <View style={styles.headerRight}>
              <Mono muted>{order.orderNumber}</Mono>
              <Pressy onPress={shareInvoice} haptics="select" accessibilityLabel="Share invoice">
                <Glass radius={radius.pill} innerStyle={styles.iconBtn}>
                  <Share2 size={18} color={colors.ink} />
                </Glass>
              </Pressy>
            </View>
          ) : null}
        </View>

        {isLoading || !order ? (
          <View style={{ gap: 12, marginTop: 12 }}>
            <Skeleton height={120} radius={radius.lg} />
            <Skeleton height={200} radius={radius.lg} />
          </View>
        ) : (
          <>
            <Animated.View
              entering={FadeInDown.duration(360).springify().damping(18)}
              style={{ marginTop: 8 }}
            >
              <StatusPill status={order.status} />
              <Title style={{ marginTop: 10 }}>
                {formatDateShort(order.deliveryDate)} · {WINDOWS[order.window]?.label}
              </Title>
              <Small muted>{WINDOWS[order.window]?.hours}</Small>
              <View style={styles.addr}>
                <MapPin size={14} color={colors.leaf} />
                <Small color={colors.ink2}>
                  {order.address.block} · {order.address.flat}, {order.address.communityName}
                </Small>
              </View>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(60).duration(360).springify().damping(18)}
              style={{ marginTop: 20 }}
            >
              <Label style={{ marginBottom: 8 }}>Status</Label>
              <Glass radius={radius.lg} innerStyle={{ padding: 18, paddingBottom: 4 }}>
                <OrderStatusTimeline status={order.status} timeline={order.timeline} />
              </Glass>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(120).duration(360).springify().damping(18)}
              style={{ marginTop: 20 }}
            >
              <Label style={{ marginBottom: 8 }}>Items</Label>
              <Glass radius={radius.lg} innerStyle={{ paddingHorizontal: 14 }}>
                {order.items.map((it) => (
                  <View key={it.id} style={styles.item}>
                    <ProductImage
                      uri={it.image}
                      blurhash={it.blurhash}
                      tint={it.tint}
                      name={it.name}
                      size={44}
                      radius={12}
                    />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium">{it.name}</Text>
                      <Small muted>
                        {formatQty(it.quantity, it.unit)}
                        {it.variableWeight ? ' · billed on packed weight' : ''}
                      </Small>
                    </View>
                    <Money paise={it.lineTotalPaise} variant="bodyMedium" />
                  </View>
                ))}
                <View style={{ paddingVertical: 12, gap: 6 }}>
                  <Row label="Subtotal" paise={order.subtotalPaise} />
                  {Number(order.couponDiscountPaise) > 0 ? (
                    <Row
                      label={`Coupon ${order.couponCode}`}
                      paise={-Number(order.couponDiscountPaise)}
                      color={colors.leafDeep}
                    />
                  ) : null}
                  {Number(order.walletAppliedPaise) > 0 ? (
                    <Row
                      label="Paid from wallet"
                      paise={-Number(order.walletAppliedPaise)}
                      color={colors.leafDeep}
                    />
                  ) : null}
                  <Row label="Paid via Razorpay" paise={order.gatewayAmountPaise} />
                  <View style={[styles.row, { marginTop: 4 }]}>
                    <Text variant="bodyMedium">Total</Text>
                    <Money paise={order.totalPaise} variant="h3" />
                  </View>
                </View>
              </Glass>
            </Animated.View>

            {order.canCancel ? (
              <Animated.View
                entering={FadeInDown.delay(180).duration(360)}
                style={{ marginTop: 24 }}
              >
                <Button
                  title="Cancel order"
                  variant="danger"
                  onPress={confirmCancel}
                  loading={cancelling}
                />
                <Small muted center style={{ marginTop: 8 }}>
                  Free until the evening before your window.
                </Small>
              </Animated.View>
            ) : null}

            {canReorder ? (
              <Animated.View
                entering={FadeInDown.delay(180).duration(360)}
                style={{ marginTop: 24 }}
              >
                <Button
                  title="Reorder these items"
                  variant="accent"
                  onPress={reorder}
                  loading={reordering}
                  icon={<RotateCcw size={18} color={colors.ink} />}
                />
                <Small muted center style={{ marginTop: 8 }}>
                  Adds the same items to your basket at today&apos;s prices.
                </Small>
              </Animated.View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** @param {any} props */
function Row({ label, paise, color = undefined }) {
  return (
    <View style={styles.row}>
      <Small muted>{label}</Small>
      <Money paise={paise} variant="small" color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addr: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
