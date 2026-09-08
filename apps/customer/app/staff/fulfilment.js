import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { StaffHeader } from '../../src/components/StaffHeader';
import { colors, fonts } from '../../src/theme';
import { adminApi } from '../../src/lib/adminApi';
import { selectEffectiveRole } from '../../src/features/role/roleSlice';

const inr = (paise) => `₹${(Number(paise) / 100).toLocaleString('en-IN')}`;
const title = (s) =>
  String(s)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
const STAGES = [
  {
    status: 'CONFIRMED',
    title: 'Confirmed',
    next: 'PACKING',
    label: 'Start packing',
    tint: colors.leafSoft,
    fg: colors.leafDeep,
  },
  {
    status: 'PACKING',
    title: 'Packing',
    next: 'OUT_FOR_DELIVERY',
    label: 'Out for delivery',
    tint: '#d9ecfb',
    fg: '#1c5a8a',
  },
  {
    status: 'OUT_FOR_DELIVERY',
    title: 'On the road',
    next: 'DELIVERED',
    label: 'Mark delivered',
    tint: '#ece4fb',
    fg: '#6a3fb0',
  },
  {
    status: 'DELIVERED',
    title: 'Delivered',
    next: null,
    tint: 'rgba(14,27,20,0.06)',
    fg: colors.ink2,
  },
];

export default function StaffFulfilment() {
  const role = useSelector(selectEffectiveRole);
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setError(null);
    adminApi
      .orders()
      .then((d) => setOrders(d.orders))
      .catch((e) => setError(e.message || 'Could not load'));
  }, []);
  useEffect(load, [load]);

  async function advance(o, next) {
    setBusy(o.id);
    try {
      await adminApi.setStatus(o.id, next);
      load();
    } catch {
      setBusy(null);
    }
  }

  const byStatus = (s) => (orders || []).filter((o) => o.status === s);

  return (
    <View style={styles.root}>
      <StaffHeader
        title="Fulfilment"
        subtitle="Packing & delivery — flat, floor, window"
        roleLabel={role.label || 'Fulfilment'}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {error ? (
          <View style={styles.emptyBox}>
            <Text style={styles.muted}>{error}</Text>
            <Pressable onPress={load} style={styles.retry}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : !orders ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : (
          STAGES.map((st) => {
            const list = byStatus(st.status);
            return (
              <View key={st.status} style={{ marginBottom: 18 }}>
                <View style={styles.stageHead}>
                  <View style={[styles.badge, { backgroundColor: st.tint }]}>
                    <Text style={[styles.badgeText, { color: st.fg }]}>{st.title}</Text>
                  </View>
                  <Text style={styles.count}>{list.length}</Text>
                </View>
                {list.length === 0 ? (
                  <Text style={styles.none}>Nothing here.</Text>
                ) : (
                  list.map((o) => (
                    <View key={o.id} style={styles.card}>
                      <View style={styles.cardTop}>
                        <Text style={styles.orderNo}>{o.orderNumber}</Text>
                        <Text style={styles.total}>{inr(o.totalPaise)}</Text>
                      </View>
                      <Text style={styles.name}>{o.customerName}</Text>
                      <View style={styles.addr}>
                        <Text style={styles.addrLine}>
                          📍 {o.address?.communityName} · {o.address?.block}, {o.address?.flat}
                        </Text>
                        {o.address?.area ? (
                          <Text style={styles.addrArea}>{o.address.area}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.meta}>
                        {o.itemCount} items · {title(o.window)} · {o.mobile}
                      </Text>
                      {st.next ? (
                        <Pressable
                          style={[styles.advance, busy === o.id && { opacity: 0.5 }]}
                          disabled={busy === o.id}
                          onPress={() => advance(o, st.next)}
                        >
                          <Text style={styles.advanceText}>{busy === o.id ? '…' : st.label}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: 20, paddingTop: 8 },
  muted: { fontFamily: fonts.body, color: colors.ink3, fontSize: 14, paddingVertical: 20 },
  stageHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontFamily: fonts.bodySemi, fontSize: 12.5 },
  count: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  none: { fontFamily: fonts.body, fontSize: 12.5, color: colors.ink3, paddingVertical: 4 },
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
  total: { fontFamily: fonts.display, fontSize: 14, color: colors.ink },
  name: {
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    color: colors.ink,
    marginTop: 2,
    marginBottom: 8,
  },
  addr: {
    backgroundColor: colors.canvas,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addrLine: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink },
  addrArea: { fontFamily: fonts.body, fontSize: 11.5, color: colors.ink3, marginTop: 1 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.ink2, marginTop: 8 },
  advance: {
    backgroundColor: colors.leaf,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 11,
  },
  advanceText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.white },
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
