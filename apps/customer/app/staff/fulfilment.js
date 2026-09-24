import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSelector } from 'react-redux';
import { StaffHeader } from '../../src/components/StaffHeader';
import { colors, fonts } from '../../src/theme';
import { adminApi } from '../../src/lib/adminApi';
import { dial, numberFor, prettyNumber } from '../../src/lib/dial';
import { useStaffRefresh } from '../../src/hooks/useStaffRefresh';
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

// Only these statuses belong on the delivery board. Everything else (CANCELLED, PENDING_PAYMENT,
// PAYMENT_FAILED, …) is not actionable and must never fall back to a CONFIRMED-looking card.
const DELIVERABLE = new Set(['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED']);

export default function StaffFulfilment() {
  const role = useSelector(selectEffectiveRole);
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [community, setCommunity] = useState('all');

  const load = useCallback(() => {
    setError(null);
    return adminApi
      .orders()
      .then((d) => setOrders(d.orders))
      .catch((e) => setError(e.message || 'Could not load'));
  }, []);
  const { refreshing, onRefresh } = useStaffRefresh(load);
  // The door panel for one order, and a non-destructive message line. Neither ever replaces the
  // round: a delivery person mid-round must not lose their list.
  const [door, setDoor] = useState(null);
  const [notice, setNotice] = useState(null);
  // The number pad covers the bottom of the screen, which is exactly where the amount to collect
  // and the confirm button sit — the delivery person could see neither. KeyboardAvoidingView does
  // not measure inside an absolutely-positioned overlay, so lift by the real keyboard height.
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKb(e.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKb(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  /**
   * Move an order on one step.
   *
   * DELIVERED is deliberately NOT a plain status change: the API refuses it while the customer's
   * door code or their cash is outstanding, because the whole point of the proof is that someone
   * stood at that door. Tapping it opens the panel below instead.
   */
  async function advance(o, next) {
    if (next === 'DELIVERED') {
      setDoor({ id: o.id, order: o, otp: '' });
      return;
    }
    setBusy(o.id);
    try {
      await adminApi.setStatus(o.id, next);
      await load();
    } catch (e) {
      // A failure here used to call setError, which replaced the WHOLE round with a "Could not
      // update / Try again" screen — the delivery person lost their list mid-round over one order.
      // Keep the list, say which order failed.
      setNotice(`${o.orderNumber}: ${e?.message || 'could not update'}`);
    } finally {
      setBusy(null);
    }
  }

  /** Hand-over at the door: the code the customer reads out, plus the cash if it is a cash order. */
  async function completeDelivery(otpOverride) {
    if (!door) return;
    const o = door.order;
    const otp = (otpOverride ?? door.otp ?? '').trim();
    const due = Number(o.codDuePaise || 0);
    setBusy(o.id);
    try {
      await adminApi.deliver(o.id, {
        ...(o.deliveryOtpPending ? { otp } : {}),
        ...(due > 0 ? { collectedPaise: due } : {}),
      });
      setDoor(null);
      setNotice(
        due > 0
          ? `${o.orderNumber} delivered · ${inr(due)} collected`
          : `${o.orderNumber} delivered`,
      );
      await load();
    } catch (e) {
      // The panel is on top of everything, so a message behind it is a message nobody sees — the
      // delivery person would type a wrong code and watch nothing happen. Keep it in the panel,
      // and clear the box so the next attempt starts from empty.
      setDoor((d) =>
        d ? { ...d, otp: '', error: e?.message || 'Could not complete the delivery' } : d,
      );
    } finally {
      setBusy(null);
    }
  }

  async function call(order) {
    const res = await dial(numberFor(order));
    if (!res.ok) setNotice(res.reason);
  }
  async function navigate(addr) {
    // The landmark is what actually gets a rider to the right gate — a community name alone can
    // match the wrong compound in a city this size.
    const q = encodeURIComponent(
      [addr?.landmark, addr?.communityName, addr?.area, 'Hyderabad'].filter(Boolean).join(', '),
    );
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${q}`,
      // `geo:` silently does nothing on an Android with no maps app; the https URL always resolves.
      android: `geo:0,0?q=${q}`,
      default: `https://www.google.com/maps/search/?api=1&query=${q}`,
    });
    try {
      await Linking.openURL(url);
    } catch {
      try {
        await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
      } catch {
        // Same rule as Call: say so rather than leaving them tapping a button that does nothing.
        setNotice('Could not open maps on this device.');
      }
    }
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
      (o) =>
        DELIVERABLE.has(o.status) &&
        (community === 'all' || (o.address?.communityId || 'unknown') === community),
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
        tabs={[
          { key: 'fulfilment', label: 'Deliveries', href: '/staff/fulfilment' },
          { key: 'notes', label: 'Customer notes', href: '/staff/notes' },
        ]}
        active="fulfilment"
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
        ) : totalVisible === 0 ? (
          <Text style={styles.muted}>No orders in this community right now.</Text>
        ) : (
          groups.map((c) => (
            <View key={c.id} style={{ marginBottom: 22 }}>
              <View style={styles.commHead}>
                <Text style={styles.commName} numberOfLines={1} ellipsizeMode="tail">
                  {c.name}
                </Text>
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
                          {/* On screen as well as behind the button: if the dialer will not open,
                              the delivery person can still read it out. Shows the door contact when
                              the customer named one, since that is who will actually answer. */}
                          {numberFor(o) ? (
                            <Text style={styles.addrPhone}>
                              📞 {prettyNumber(numberFor(o))}
                              {o.address?.recipientName
                                ? ` · ask for ${o.address.recipientName}`
                                : ''}
                              {o.address?.contactNumber && o.address.contactNumber !== o.mobile
                                ? ' (door contact)'
                                : ''}
                            </Text>
                          ) : null}
                          {o.address?.landmark ? (
                            <Text style={styles.addrMeta}>📍 {o.address.landmark}</Text>
                          ) : null}
                        </View>

                        {/* What to take at the door. Blank on a prepaid order and blank once
                            settled, so nobody collects twice. */}
                        {Number(o.codDuePaise) > 0 ? (
                          <View style={styles.cashRow}>
                            <Text style={styles.cashLabel}>COLLECT CASH</Text>
                            <Text style={styles.cashAmount}>{inr(o.codDuePaise)}</Text>
                          </View>
                        ) : null}

                        {/* Everything the customer asked for, where the person at the door can
                            actually read it: the order-level instruction and any per-item note.
                            These were captured and then shown to nobody. */}
                        {o.deliveryNote ? (
                          <View style={styles.noteBox}>
                            <Text style={styles.noteLabel}>DELIVERY INSTRUCTIONS</Text>
                            <Text style={styles.noteText}>{o.deliveryNote}</Text>
                          </View>
                        ) : null}
                        {(o.items || []).some((i) => i.note) ? (
                          <View style={styles.noteBox}>
                            <Text style={styles.noteLabel}>ITEM NOTES</Text>
                            {(o.items || [])
                              .filter((i) => i.note)
                              .map((i) => (
                                <Text key={i.id || i.productId} style={styles.noteText}>
                                  {i.name}: {i.note}
                                </Text>
                              ))}
                          </View>
                        ) : null}

                        <View style={styles.actions}>
                          <Pressable style={styles.ghostBtn} onPress={() => call(o)}>
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

      {/* A message, never a replacement for the round. One order failing must not cost the
          delivery person their list. */}
      {notice ? (
        <Pressable style={styles.notice} onPress={() => setNotice(null)}>
          <Text style={styles.noticeText}>{notice}</Text>
          <Text style={styles.noticeDismiss}>Dismiss</Text>
        </Pressable>
      ) : null}

      {/* The door. The code is the customer's to read out — this app never shows it, only asks. */}
      {door ? (
        <View style={styles.doorWrap}>
          <Pressable style={styles.doorScrim} onPress={() => setDoor(null)} />

          <View style={[styles.doorCard, { marginBottom: kb }]}>
            <Text style={styles.doorTitle}>{door.order.orderNumber}</Text>
            <Text style={styles.doorSub}>
              {door.order.customerName} · Flat {door.order.address?.flat}
            </Text>

            {Number(door.order.codDuePaise) > 0 ? (
              <View style={styles.doorCash}>
                <Text style={styles.cashLabel}>COLLECT IN CASH</Text>
                <Text style={styles.doorCashAmount}>{inr(door.order.codDuePaise)}</Text>
              </View>
            ) : null}

            {door.order.deliveryOtpPending ? (
              <>
                <Text style={styles.doorAsk}>Ask the customer for their four-digit code</Text>
                <TextInput
                  style={styles.otpInput}
                  value={door.otp}
                  onChangeText={(v) => {
                    const otp = v.replace(/\D/g, '').slice(0, 4);
                    setDoor((d) => ({ ...d, otp, error: null }));
                    // Submit on the fourth digit rather than making them find a button. This is
                    // done at a door, one-handed, holding a bag — and the number pad covers the
                    // bottom of the screen while they type, so the button is not even reachable.
                    if (otp.length === 4) {
                      Keyboard.dismiss();
                      setTimeout(() => completeDelivery(otp), 120);
                    }
                  }}
                  placeholder="0000"
                  placeholderTextColor="rgba(14,27,20,0.25)"
                  keyboardType="number-pad"
                  maxLength={4}
                  autoFocus
                  accessibilityLabel="Code the customer read out"
                />
              </>
            ) : (
              <Text style={styles.doorAsk}>No code needed for this order.</Text>
            )}

            <Pressable
              style={[
                styles.doorConfirm,
                (busy === door.id || (door.order.deliveryOtpPending && door.otp.length !== 4)) && {
                  opacity: 0.45,
                },
              ]}
              disabled={
                busy === door.id || (door.order.deliveryOtpPending && door.otp.length !== 4)
              }
              onPress={completeDelivery}
            >
              <Text style={styles.doorConfirmText}>
                {busy === door.id
                  ? '…'
                  : Number(door.order.codDuePaise) > 0
                    ? `Collected ${inr(door.order.codDuePaise)} · mark delivered`
                    : 'Mark delivered'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setDoor(null)} style={{ paddingVertical: 10 }}>
              <Text style={styles.doorCancel}>Not now</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
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
  commName: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 19,
    lineHeight: 23,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  commMeta: {
    flexShrink: 0,
    marginLeft: 8,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.ink3,
  },

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
  addrPhone: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.leafDeep,
    marginTop: 3,
  },
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
  cashRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 9,
    backgroundColor: 'rgba(214,92,63,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(214,92,63,0.28)',
  },
  cashLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.4, color: colors.ink2 },
  cashAmount: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.tomato },
  noteBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 9,
    backgroundColor: 'rgba(14,27,20,0.04)',
  },
  noteLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 10.5,
    letterSpacing: 0.5,
    color: colors.ink3,
    marginBottom: 3,
  },
  noteText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.ink },
  notice: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.night,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  noticeText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.inkOnDark },
  noticeDismiss: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.sprout, marginLeft: 12 },
  doorWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  doorScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,21,16,0.45)' },
  doorCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 22,
    paddingBottom: 34,
    alignItems: 'center',
  },
  doorTitle: { fontFamily: fonts.bodySemi, fontSize: 17, color: colors.ink },
  doorSub: { fontFamily: fonts.body, fontSize: 13, color: colors.ink3, marginTop: 2 },
  doorCash: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 11,
    backgroundColor: 'rgba(214,92,63,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(214,92,63,0.28)',
  },
  doorCashAmount: { fontFamily: fonts.bodySemi, fontSize: 21, color: colors.tomato },
  doorAsk: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink2,
    marginTop: 18,
    textAlign: 'center',
  },
  otpInput: {
    marginTop: 10,
    width: 190,
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 30,
    letterSpacing: 10,
    color: colors.ink,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(14,27,20,0.18)',
    backgroundColor: 'rgba(14,27,20,0.03)',
  },
  doorConfirm: {
    alignSelf: 'stretch',
    marginTop: 18,
    paddingVertical: 15,
    borderRadius: 13,
    backgroundColor: colors.leafDeep,
    alignItems: 'center',
  },
  doorConfirmText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.white },
  doorCancel: { fontFamily: fonts.body, fontSize: 13, color: colors.ink3 },
  doorError: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.tomato,
    textAlign: 'center',
    marginTop: 12,
  },
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
