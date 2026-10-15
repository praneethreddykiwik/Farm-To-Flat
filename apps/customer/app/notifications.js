import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft,
  BellOff,
  CheckCircle2,
  MessageSquare,
  Package,
  PackageCheck,
  Sprout,
  Star,
  Truck,
  Wallet,
  XCircle,
} from 'lucide-react-native';
import { Ambient, Glass, Pressy, Skeleton, Small, Text, Title } from '../src/ui';
import {
  useGetNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '../src/api/api';
import { colors, fonts, motion, radius } from '../src/theme';

/** Icon + tint per notification type, so the feed scans at a glance. */
const LOOK = {
  ORDER_PLACED: { Icon: Sprout, tint: colors.leaf },
  ORDER_PACKED: { Icon: Package, tint: colors.leaf },
  ORDER_OUT: { Icon: Truck, tint: colors.amber || '#d89b1a' },
  ORDER_DELIVERED: { Icon: PackageCheck, tint: colors.leaf },
  ORDER_CANCELLED: { Icon: XCircle, tint: colors.tomato },
  CANCEL_REQUESTED: { Icon: XCircle, tint: colors.amber || '#d89b1a' },
  REFUND_INITIATED: { Icon: Wallet, tint: colors.leaf },
  FEEDBACK_INVITE: { Icon: Star, tint: colors.amber || '#d89b1a' },
  COMPLAINT_REPLY: { Icon: MessageSquare, tint: colors.leaf },
  INFO: { Icon: CheckCircle2, tint: colors.ink2 },
};

function timeAgo(iso) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(then).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function Notifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, isFetching, refetch } = useGetNotificationsQuery(undefined, {
    pollingInterval: 20000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll] = useMarkAllNotificationsReadMutation();
  const items = data?.notifications || [];
  const unread = data?.unread || 0;

  const open = (n) => {
    if (!n.readAt) markRead(n.id);
    const orderId = n.data?.orderId;
    if (orderId) router.push({ pathname: '/order/[id]', params: { id: orderId } });
  };

  return (
    <View style={styles.root}>
      <Ambient />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressy onPress={() => router.back()} haptics="select" accessibilityLabel="Back">
          <Glass radius={radius.pill} innerStyle={styles.iconBtn}>
            <ArrowLeft size={20} color={colors.ink} />
          </Glass>
        </Pressy>
        <Title style={{ flex: 1, marginLeft: 12 }}>Notifications</Title>
        {unread > 0 && (
          <Pressy onPress={() => markAll()} haptics="select" accessibilityLabel="Mark all as read">
            <Small style={{ color: colors.leaf, fontWeight: '600' }}>Mark all read</Small>
          </Pressy>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !!data}
            onRefresh={refetch}
            tintColor={colors.leaf}
          />
        }
      >
        {isLoading ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={82} radius={radius.lg} />
            <Skeleton height={82} radius={radius.lg} />
            <Skeleton height={82} radius={radius.lg} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <BellOff size={30} color={colors.ink3} />
            <Title style={{ marginTop: 14 }}>Nothing yet</Title>
            <Small muted style={{ marginTop: 6, textAlign: 'center', maxWidth: 260 }}>
              Order updates — placed, packed, out for delivery, delivered — show up here the moment
              they happen.
            </Small>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {items.map((n, i) => {
              const look = LOOK[n.type] || LOOK.INFO;
              const Icon = look.Icon;
              return (
                <Animated.View
                  key={n.id}
                  entering={FadeInDown.delay(i * motion.stagger)
                    .duration(320)
                    .springify()
                    .damping(18)}
                >
                  <Pressy onPress={() => open(n)} haptics="soft" scale={0.985}>
                    <Glass
                      radius={radius.lg}
                      innerStyle={[styles.card, !n.readAt && styles.cardUnread]}
                    >
                      <View style={[styles.iconWrap, { backgroundColor: `${look.tint}22` }]}>
                        <Icon size={19} color={look.tint} strokeWidth={2.2} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.titleRow}>
                          <Text
                            variant="body"
                            numberOfLines={1}
                            style={{ flex: 1, marginRight: 8, fontFamily: fonts.bodyMedium }}
                          >
                            {n.title}
                          </Text>
                          <Small muted style={{ flexShrink: 0 }}>
                            {timeAgo(n.createdAt)}
                          </Small>
                        </View>
                        <Small muted style={{ marginTop: 3 }}>
                          {n.body}
                        </Small>
                      </View>
                      {!n.readAt && <View style={styles.unreadDot} />}
                    </Glass>
                  </Pressy>
                </Animated.View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  cardUnread: { borderColor: colors.leaf, borderWidth: StyleSheet.hairlineWidth },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.tomato,
    marginTop: 6,
    flexShrink: 0,
  },
  empty: { alignItems: 'center', paddingTop: 80 },
});
