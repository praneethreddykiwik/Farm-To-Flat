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
  Money,
  Mono,
  Pressy,
  Skeleton,
  Small,
  StatusPill,
  Text,
} from '../../src/ui';
import { CartBar } from '../../src/components/CartBar';
import { useGetOrdersQuery } from '../../src/api/api';
import { colors, motion, radius } from '../../src/theme';
import { formatDateShort, windowLabel } from '../../src/lib/dates';

export default function Orders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Keep the list live so status changes from the ops board appear without a manual pull-to-refresh.
  const { data, isLoading, isFetching, refetch } = useGetOrdersQuery(undefined, {
    pollingInterval: 15000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const orders = data?.orders || [];

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
          <View style={{ gap: 12 }}>
            {orders.map((o, i) => (
              <Animated.View
                key={o.id}
                entering={FadeInDown.delay(i * motion.stagger)
                  .duration(360)
                  .springify()
                  .damping(18)}
              >
                <Pressy
                  onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
                  haptics="soft"
                  scale={0.985}
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
                          {formatDateShort(o.deliveryDate)} · {windowLabel(o.window)}
                        </Text>
                        <Small muted numberOfLines={1} style={{ marginTop: 2 }}>
                          {o.items.map((it) => it.name).join(', ')}
                        </Small>
                      </View>
                      <ChevronRight size={20} color={colors.ink3} />
                    </View>
                    <View style={styles.bottom}>
                      <Small muted numberOfLines={1} style={{ flex: 1, marginRight: 10 }}>
                        {o.items.length} {o.items.length === 1 ? 'item' : 'items'}
                        {o.couponCode ? ` · ${o.couponCode}` : ''}
                      </Small>
                      <Money paise={o.totalPaise} variant="bodyMedium" style={{ flexShrink: 0 }} />
                    </View>
                  </Glass>
                </Pressy>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
      <CartBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  card: { padding: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mid: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
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
