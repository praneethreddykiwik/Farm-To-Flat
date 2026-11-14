import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChevronRight, PackageOpen } from 'lucide-react-native';
import {
  Ambient,
  Display,
  EmptyState,
  Glass,
  Label,
  Money,
  Mono,
  ProductImage,
  Pressy,
  Skeleton,
  Small,
  StatusPill,
  Text,
} from '../../src/ui';
import { CartBar } from '../../src/components/CartBar';
import { useGetOrdersQuery } from '../../src/api/api';
import { colors, motion, radius } from '../../src/theme';
import { arrivalPhrase, formatDateShort, windowLabel } from '../../src/lib/dates';
import { STEP_LABELS, isLiveStatus, liveStep } from '../../src/lib/liveOrder';
import { selectLanguage } from '../../src/features/ui/uiSlice';
import { productLabel } from '../../src/lib/i18n';
import { useSelector } from 'react-redux';

export default function Orders() {
  const lang = useSelector(selectLanguage);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Keep the list live so status changes from the ops board appear without a manual pull-to-refresh.
  const { data, isLoading, isFetching, refetch } = useGetOrdersQuery(undefined, {
    pollingInterval: 15000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const orders = data?.orders || [];
  // Whatever is still moving goes first, under its own heading; the rest is history.
  const live = orders.filter((o) => isLiveStatus(o.status));
  const earlier = orders.filter((o) => !isLiveStatus(o.status));

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
        <Display>Your orders</Display>
        <Small muted style={{ marginTop: 4, marginBottom: 20 }}>
          What’s coming, and what already came.
        </Small>

        {isLoading ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={112} radius={radius.lg} />
            <Skeleton height={112} radius={radius.lg} />
          </View>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<PackageOpen size={30} color={colors.ink2} />}
            title="No orders yet"
            message="Your first basket lands here with its delivery window and live status."
            action={{ title: 'Browse the catalog', onPress: () => router.push('/(tabs)') }}
          />
        ) : (
          <View style={{ gap: 26 }}>
            {live.length ? (
              <View style={{ gap: 12 }}>
                <Label>On its way</Label>
                {live.map((o, i) => (
                  <OrderCard key={o.id} order={o} index={i} lang={lang} />
                ))}
              </View>
            ) : null}
            {earlier.length ? (
              <View style={{ gap: 12 }}>
                {live.length ? <Label>Earlier</Label> : null}
                {earlier.map((o, i) => (
                  <OrderCard key={o.id} order={o} index={live.length + i} lang={lang} />
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
      <CartBar />
    </View>
  );
}

/**
 * One order. What is in it, as the photos of the first few things; when it comes; what it cost.
 * An order still moving also shows how far along it is, on the same four steps as the live card
 * on Home, and when it arrives in words.
 */
function OrderCard({ order: o, index, lang }) {
  const router = useRouter();
  const moving = isLiveStatus(o.status);
  const step = liveStep(o.status);
  const shown = o.items.slice(0, 4);
  const more = o.items.length - shown.length;
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 6) * motion.stagger)
        .duration(360)
        .springify()
        .damping(18)}
    >
      <Pressy
        onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
        haptics="soft"
        scale={0.985}
        accessibilityLabel={`Order ${o.orderNumber}, ${o.items.length} items, ${STATUS_WORD[o.status] || o.status}`}
      >
        <Glass radius={radius.lg} innerStyle={styles.card}>
          <View style={styles.top}>
            <StatusPill status={o.status} />
            <Mono muted style={{ fontSize: 12 }}>
              {o.orderNumber}
            </Mono>
          </View>
          <View style={styles.mid}>
            <View style={{ flex: 1 }}>
              <Text variant="h3">
                {formatDateShort(o.deliveryDate)} · {windowLabel(o.window, null, lang)}
              </Text>
              <Small muted numberOfLines={1} style={{ marginTop: 2 }}>
                {o.items.map((it) => productLabel(it, lang)).join(', ')}
              </Small>
            </View>
            <ChevronRight size={20} color={colors.ink3} />
          </View>

          {moving ? (
            <View style={styles.track}>
              <View style={styles.bars}>
                {STEP_LABELS.map((label, i) => (
                  <View key={label} style={[styles.bar, i < step && styles.barOn]} />
                ))}
              </View>
              <Small color={colors.leafDeep} style={{ marginTop: 6 }}>
                {STEP_LABELS[step - 1]} · arrives{' '}
                {arrivalPhrase(o.deliveryDate, windowLabel(o.window, null, lang))}
              </Small>
            </View>
          ) : null}

          <View style={styles.bottom}>
            <View style={styles.stack}>
              {shown.map((it, i) => (
                <View
                  key={it.id || i}
                  style={[styles.thumb, { marginLeft: i ? -10 : 0, zIndex: 10 - i }]}
                >
                  <ProductImage
                    uri={it.image}
                    tint={it.tint}
                    name={productLabel(it, lang)}
                    size={30}
                    radius={15}
                    recyclingKey={it.productId}
                  />
                </View>
              ))}
              {more > 0 ? (
                <View style={[styles.thumb, styles.more, { marginLeft: -10 }]}>
                  <Small style={{ fontSize: 10.5 }} color={colors.ink2}>
                    +{more}
                  </Small>
                </View>
              ) : null}
              <Small muted numberOfLines={1} style={{ marginLeft: 10, flexShrink: 1 }}>
                {o.items.length} {o.items.length === 1 ? 'item' : 'items'}
                {o.couponCode ? ` · ${o.couponCode}` : ''}
              </Small>
            </View>
            <Money paise={o.totalPaise} variant="bodyMedium" style={{ flexShrink: 0 }} />
          </View>
        </Glass>
      </Pressy>
    </Animated.View>
  );
}

const STATUS_WORD = {
  CONFIRMED: 'confirmed',
  PACKING: 'being packed',
  OUT_FOR_DELIVERY: 'on its way',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  PENDING_PAYMENT: 'awaiting payment',
  PAYMENT_FAILED: 'payment failed',
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  card: { padding: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mid: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  track: { marginTop: 14 },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.hairline },
  barOn: { backgroundColor: colors.leaf },
  stack: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  thumb: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.canvas,
    backgroundColor: colors.canvas,
    overflow: 'hidden',
  },
  more: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvasDeep },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
});
