import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

// Flats read like "402" (floor 4) or "1503" (floor 15) — the floor is the flat number without its
// last two digits. The delivery person asked for floor, so derive it rather than guess.
const floorOf = (flat) => {
  const n = parseInt(String(flat ?? '').replace(/\D/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  const f = Math.floor(n / 100);
  return f > 0 ? f : null;
};

// Per-status look + the next step in the delivery flow. Keyed by status so a card knows its badge
// colour and its one advance action wherever it sits in the grouped list.
const STAGE = {
  CONFIRMED: {
    title: 'Confirmed',
    next: 'PACKING',
    label: 'Start packing',
    tint: colors.leafSoft,
    fg: colors.leafDeep,
    order: 0,
  },
  PACKING: {
    title: 'Packing',
    next: 'OUT_FOR_DELIVERY',
    label: 'Out for delivery',
    tint: '#d9ecfb',
    fg: '#1c5a8a',
    order: 1,
  },
  OUT_FOR_DELIVERY: {
    title: 'On the road',
    next: 'DELIVERED',
    label: 'Mark delivered',
    tint: '#ece4fb',
    fg: '#6a3fb0',
    order: 2,
  },
  DELIVERED: {
    title: 'Delivered',
    next: null,
    label: null,
    tint: 'rgba(14,27,20,0.06)',
    fg: colors.ink2,
    order: 3,
  },
};

export default function StaffFulfilment() {
  const role = useSelector(selectEffectiveRole);
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [community, setCommunity] = useState('all');

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

  function call(mobile) {
    if (mobile) Linking.openURL(`tel:${mobile}`).catch(() => {});
  }
  function navigate(addr) {
    const q = encodeURIComponent(
      [addr?.communityName, addr?.area, 'Hyderabad'].filter(Boolean).join(', '),
    );
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${q}`,
      android: `geo:0,0?q=${q}`,
      default: `https://www.google.com/maps/search/?api=1&query=${q}`,
    });
    Linking.openURL(url).catch(() => {});
  }

  // Community filter chips — one per community that actually has orders, with live counts.
  const communities = useMemo(() => {
    const map = new Map();
    (orders || []).forEach((o) => {
      const id = o.address?.communityId || 'unknown';
      if (!map.has(id)) map.set(id, { id, name: o.address?.communityName || 'Unknown', count: 0 });
      map.get(id).count += 1;
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  // Group the (filtered) orders by community → block, so a runner delivers building by building.
  // Within a block, active deliveries sort ahead of delivered ones, then by flat.
  const groups = useMemo(() => {
    const vis = (orders || []).filter(
      (o) => community === 'all' || (o.address?.communityId || 'unknown') === community,
    );
    const byComm = new Map();
    vis.forEach((o) => {
      const cid = o.address?.communityId || 'unknown';
      if (!byComm.has(cid))
        byComm.set(cid, {
          id: cid,
          name: o.address?.communityName || 'Unknown',
          area: o.address?.area,
          blocks: new Map(),
        });
      const c = byComm.get(cid);
      const b = o.address?.block || '—';
      if (!c.blocks.has(b)) c.blocks.set(b, []);
      c.blocks.get(b).push(o);
    });
    return [...byComm.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        ...c,
        total: [...c.blocks.values()].reduce((n, l) => n + l.length, 0),
        blocks: [...c.blocks.entries()]
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }))
          .map(([block, list]) => ({
            block,
            orders: list.sort(
              (a, b) =>
                (STAGE[a.status]?.order ?? 9) - (STAGE[b.status]?.order ?? 9) ||
                String(a.address?.flat).localeCompare(String(b.address?.flat), undefined, {
                  numeric: true,
                }),
            ),
          })),
      }));
  }, [orders, community]);

  const totalVisible = groups.reduce((n, g) => n + g.total, 0);

  return (
    <View style={styles.root}>
      <StaffHeader
        title="Fulfilment"
        subtitle="Deliver by community — call, navigate, advance"
        roleLabel={role.label || 'Fulfilment'}
      />

      {orders && communities.length > 0 ? (
        <View style={styles.chips}>
          <Chip
            label="All"
            count={orders.length}
            active={community === 'all'}
            onPress={() => setCommunity('all')}
          />
          {communities.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              count={c.count}
              active={community === c.id}
              onPress={() => setCommunity(c.id)}
            />
          ))}
        </View>
      ) : null}

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
        ) : totalVisible === 0 ? (
          <Text style={styles.muted}>No orders in this community right now.</Text>
        ) : (
          groups.map((c) => (
            <View key={c.id} style={{ marginBottom: 22 }}>
              <View style={styles.commHead}>
                <Text style={styles.commName}>{c.name}</Text>
                <Text style={styles.commMeta}>
                  {c.area ? `${c.area} · ` : ''}
                  {c.total} order{c.total > 1 ? 's' : ''}
                </Text>
              </View>

              {c.blocks.map((b) => (
                <View key={b.block} style={styles.block}>
                  <Text style={styles.blockLabel}>
                    Block {b.block} · {b.orders.length}
                  </Text>
                  {b.orders.map((o) => {
                    const st = STAGE[o.status] || STAGE.CONFIRMED;
                    const fl = floorOf(o.address?.flat);
                    return (
                      <View key={o.id} style={styles.card}>
                        <View style={styles.cardTop}>
                          <Text style={styles.orderNo}>{o.orderNumber}</Text>
                          <View style={[styles.badge, { backgroundColor: st.tint }]}>
                            <Text style={[styles.badgeText, { color: st.fg }]}>{st.title}</Text>
                          </View>
                        </View>

                        <Text style={styles.name}>{o.customerName}</Text>

                        <View style={styles.addr}>
                          <Text style={styles.addrLine}>
                            🏠 Flat {o.address?.flat}
                            {fl ? ` · Floor ${fl}` : ''}
                          </Text>
                          <Text style={styles.addrMeta}>
                            {title(o.window)} · {o.itemCount} items · {inr(o.totalPaise)}
                          </Text>
                        </View>

                        <View style={styles.actions}>
                          <Pressable style={styles.ghostBtn} onPress={() => call(o.mobile)}>
                            <Text style={styles.ghostText}>📞 Call</Text>
                          </Pressable>
                          <Pressable style={styles.ghostBtn} onPress={() => navigate(o.address)}>
                            <Text style={styles.ghostText}>🧭 Navigate</Text>
                          </Pressable>
                          {st.next ? (
                            <Pressable
                              style={[styles.advance, busy === o.id && { opacity: 0.5 }]}
                              disabled={busy === o.id}
                              onPress={() => advance(o, st.next)}
                            >
                              <Text style={styles.advanceText}>
                                {busy === o.id ? '…' : st.label}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          ))
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

  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingTop: 6,
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

  commHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  commName: { fontFamily: fonts.display, fontSize: 19, color: colors.ink, letterSpacing: -0.3 },
  commMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.ink3 },

  block: { marginBottom: 14 },
  blockLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: 8,
    marginLeft: 2,
  },

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
  name: {
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    color: colors.ink,
    marginTop: 6,
    marginBottom: 8,
  },

  addr: {
    backgroundColor: colors.canvas,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addrLine: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.ink },
  addrMeta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.ink3, marginTop: 2 },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11 },
  ghostBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  ghostText: { fontFamily: fonts.bodySemi, fontSize: 12.5, color: colors.ink },
  advance: {
    flex: 1,
    backgroundColor: colors.leaf,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  advanceText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.white },

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
