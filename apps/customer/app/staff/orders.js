import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSelector } from 'react-redux';
import { StaffHeader } from '../../src/components/StaffHeader';
import { colors, fonts } from '../../src/theme';
import { adminApi } from '../../src/lib/adminApi';
import { useStaffRefresh } from '../../src/hooks/useStaffRefresh';
import { selectEffectiveRole } from '../../src/features/role/roleSlice';

const inr = (paise) => `₹${(Number(paise) / 100).toLocaleString('en-IN')}`;
const cap = (s) =>
  String(s)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

// Delivery date "2026-09-15" → "Mon 15 Sep" (dates come as plain ISO day strings).
const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

// Badge look per order status — mirrors the web Orders panel.
const STATUS = {
  CONFIRMED: { label: 'Confirmed', tint: colors.leafSoft, fg: colors.leafDeep },
  PACKING: { label: 'Packing', tint: '#d9ecfb', fg: '#1c5a8a' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tint: '#ece4fb', fg: '#6a3fb0' },
  DELIVERED: { label: 'Delivered', tint: 'rgba(14,27,20,0.06)', fg: colors.ink2 },
  CANCELLED: { label: 'Cancelled', tint: '#fbe4e4', fg: '#b0322f' },
  PENDING_PAYMENT: { label: 'Pending payment', tint: '#fdf1d6', fg: '#8a6a1c' },
  PAYMENT_FAILED: { label: 'Payment failed', tint: '#fbe4e4', fg: '#b0322f' },
};

// The filter chips, in the same order as the web panel.
const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'CONFIRMED', label: 'Confirmed', match: (o) => o.status === 'CONFIRMED' },
  { key: 'PACKING', label: 'Packing', match: (o) => o.status === 'PACKING' },
  {
    key: 'OUT_FOR_DELIVERY',
    label: 'Out for delivery',
    match: (o) => o.status === 'OUT_FOR_DELIVERY',
  },
  { key: 'PENDING_PAYMENT', label: 'Pending', match: (o) => o.status === 'PENDING_PAYMENT' },
  { key: 'DELIVERED', label: 'Delivered', match: (o) => o.status === 'DELIVERED' },
  { key: 'CANCELLED', label: 'Cancelled', match: (o) => o.status === 'CANCELLED' },
];

export default function StaffOrders() {
  const role = useSelector(selectEffectiveRole);
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setError(null);
    return adminApi
      .orders()
      .then((d) => setOrders(d.orders || []))
      .catch((e) => setError(e.message || 'Could not load orders'));
  }, []);
  const { refreshing, onRefresh } = useStaffRefresh(load);

  const counts = useMemo(() => {
    const c = {};
    FILTERS.forEach((f) => (c[f.key] = 0));
    (orders || []).forEach((o) => {
      c.all += 1;
      FILTERS.forEach((f) => {
        if (f.key !== 'all' && f.match(o)) c[f.key] += 1;
      });
    });
    return c;
  }, [orders]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = FILTERS.find((x) => x.key === filter) || FILTERS[0];
    return (orders || []).filter(f.match).filter((o) => {
      if (!q) return true;
      return [o.orderNumber, o.customerName, o.mobile, o.address?.flat, o.address?.communityName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [orders, filter, query]);

  return (
    <View style={styles.root}>
      <StaffHeader
        title="Orders"
        subtitle="Every order, live — search and filter by status"
        roleLabel={role.label || 'Admin'}
      />

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search order, name, mobile, flat…"
          placeholderTextColor={colors.ink3}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {orders ? (
        <View style={styles.chips}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              count={counts[f.key] || 0}
              active={filter === f.key}
              onPress={() => setFilter(f.key)}
            />
          ))}
        </View>
      ) : null}

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.leaf} />
        }
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={styles.emptyBox}>
            <Text style={styles.muted}>{error}</Text>
            <Pressable onPress={load} style={styles.retry}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : !orders ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : visible.length === 0 ? (
          <Text style={styles.muted}>No orders match.</Text>
        ) : (
          visible.map((o) => {
            const st = STATUS[o.status] || STATUS.CONFIRMED;
            const where = [
              o.address?.communityName,
              o.address?.block && `Blk ${o.address.block}`,
              o.address?.flat,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <View key={o.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.orderNo}>{o.orderNumber}</Text>
                  <View style={[styles.badge, { backgroundColor: st.tint }]}>
                    <Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text>
                  </View>
                </View>
                <Text style={styles.name}>{o.customerName}</Text>
                {where ? <Text style={styles.where}>{where}</Text> : null}
                <View style={styles.metaRow}>
                  <Text style={[styles.meta, { flex: 1 }]} numberOfLines={1}>
                    {fmtDate(o.deliveryDate) || '—'}
                    {o.window ? ` · ${cap(o.window)}` : ''}
                  </Text>
                  <Text style={styles.meta}>
                    {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                  </Text>
                  <Text style={styles.total}>{inr(o.totalPaise)}</Text>
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function Chip({ label, count, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
      <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.chipCount, active && styles.chipCountOn]}>
        <Text style={[styles.chipCountText, active && styles.chipCountTextOn]}>{count}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: 20, paddingTop: 4 },
  muted: { fontFamily: fonts.body, color: colors.ink3, fontSize: 14, paddingVertical: 20 },

  searchWrap: { paddingHorizontal: 20, paddingTop: 6 },
  search: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 14.5,
    color: colors.ink,
  },

  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chipOn: { backgroundColor: colors.leafDeep, borderColor: colors.leafDeep },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink2, maxWidth: 160 },
  chipTextOn: { color: colors.white },
  chipCount: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: colors.canvas,
    alignItems: 'center',
  },
  chipCountOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  chipCountText: { fontFamily: fonts.bodySemi, fontSize: 11.5, color: colors.ink2 },
  chipCountTextOn: { color: colors.white },

  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNo: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink3 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontFamily: fonts.bodySemi, fontSize: 11.5 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15.5, color: colors.ink, marginTop: 6 },
  where: { fontFamily: fonts.body, fontSize: 12.5, color: colors.ink3, marginTop: 2 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.ink2 },
  total: {
    fontFamily: fonts.bodySemi,
    fontSize: 14.5,
    color: colors.ink,
    marginLeft: 'auto',
    flexShrink: 0,
  },

  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  retry: {
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  retryText: { fontFamily: fonts.bodyMedium, color: colors.ink, fontSize: 13 },
});
