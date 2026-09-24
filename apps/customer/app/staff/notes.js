import React, { useCallback, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StaffHeader } from '../../src/components/StaffHeader';
import { colors, fonts } from '../../src/theme';
import { adminApi } from '../../src/lib/adminApi';
import { useStaffRefresh } from '../../src/hooks/useStaffRefresh';
import { useSelector } from 'react-redux';
import { selectEffectiveRole } from '../../src/features/role/roleSlice';

/**
 * Everything customers have written, on one screen.
 *
 * Both teams needed these and neither was seeing them. A per-item note changes what the buyer picks
 * up in the market — "small ones please" is useless once you are back with the big ones — and the
 * door instruction is what the delivery person acts on. Scattered across individual order cards
 * they were read only by whoever happened to open that order, which in practice was nobody.
 *
 * Grouped by delivery day because that is the unit of work: a buyer shops for a day, a rider
 * delivers a day.
 */
const title = (s) =>
  String(s ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const dayLabel = (iso) => {
  if (!iso) return 'No date';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

export default function StaffNotes() {
  // Which screen this person came from, so they have a way back. Without it the notes tab was a
  // dead end — you could get in and not out, which is worse than not having the tab.
  const role = useSelector(selectEffectiveRole);
  const home = useMemo(() => {
    if (role?.role === 'PROCUREMENT')
      return { key: 'procurement', label: 'Buy list', href: '/staff/procurement' };
    if (role?.role === 'FULFILMENT')
      return { key: 'fulfilment', label: 'Deliveries', href: '/staff/fulfilment' };
    // Admin and super admin come from the console and can go anywhere.
    return { key: 'console', label: 'Console', href: '/staff/console' };
  }, [role]);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [kind, setKind] = useState('ALL'); // ALL | ITEM | DELIVERY
  const [community, setCommunity] = useState('ALL');

  const load = useCallback(() => {
    setError(null);
    return adminApi
      .orderNotes()
      .then(setData)
      .catch((e) => setError(e?.message || 'Could not load the notes'));
  }, []);
  const { refreshing, onRefresh } = useStaffRefresh(load);

  const notes = useMemo(() => data?.notes ?? [], [data]);
  const communities = useMemo(
    () => [...new Set(notes.map((n) => n.community).filter(Boolean))].sort(),
    [notes],
  );
  const shown = useMemo(
    () =>
      notes
        .filter((n) => kind === 'ALL' || n.kind === kind)
        .filter((n) => community === 'ALL' || n.community === community),
    [notes, kind, community],
  );
  const byDay = useMemo(() => {
    const m = new Map();
    for (const n of shown) {
      const k = n.deliveryDate || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(n);
    }
    return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }, [shown]);

  return (
    <View style={styles.root}>
      <StaffHeader
        title="Customer notes"
        subtitle="What people asked for — buy and deliver accordingly"
        tabs={home ? [home, { key: 'notes', label: 'Customer notes', href: '/staff/notes' }] : null}
        active="notes"
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.filters}>
          {[
            ['ALL', `All ${notes.length}`],
            ['ITEM', `On products ${data?.counts?.item ?? 0}`],
            ['DELIVERY', `At the door ${data?.counts?.delivery ?? 0}`],
          ].map(([k, label]) => (
            <Chip key={k} label={label} active={kind === k} onPress={() => setKind(k)} />
          ))}
        </View>
        {communities.length > 1 ? (
          <View style={styles.filters}>
            <Chip
              label="Everywhere"
              active={community === 'ALL'}
              onPress={() => setCommunity('ALL')}
            />
            {communities.map((c) => (
              <Chip key={c} label={c} active={community === c} onPress={() => setCommunity(c)} />
            ))}
          </View>
        ) : null}

        {error ? (
          <Pressable style={styles.retry} onPress={load}>
            <Text style={styles.retryText}>{error} — tap to try again</Text>
          </Pressable>
        ) : !data ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : shown.length === 0 ? (
          <Text style={styles.empty}>
            Nothing written on the live orders. Notes appear here the moment a customer adds one.
          </Text>
        ) : (
          byDay.map(([day, rows]) => (
            <View key={day || 'none'} style={{ marginTop: 18 }}>
              <Text style={styles.day}>
                {dayLabel(day)} · {rows.length}
              </Text>
              {rows.map((n, i) => (
                <View key={`${n.orderId}-${i}`} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.orderNo}>{n.orderNumber}</Text>
                    <View style={[styles.tag, n.kind === 'DELIVERY' && styles.tagDoor]}>
                      <Text style={[styles.tagText, n.kind === 'DELIVERY' && styles.tagTextDoor]}>
                        {n.kind === 'ITEM' ? n.product : 'At the door'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.note}>{n.note}</Text>
                  <Text style={styles.meta}>
                    {[n.community, n.block, n.flat && `Flat ${n.flat}`, title(n.window)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {n.mobile ? (
                    <Pressable
                      onPress={() => Linking.openURL(`tel:+91${n.mobile}`).catch(() => {})}
                    >
                      <Text style={styles.call}>
                        📞 {n.customerName} · {n.mobile}
                      </Text>
                    </Pressable>
                  ) : null}
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

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
      <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: 16, paddingBottom: 20 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(14,27,20,0.08)',
  },
  chipOn: { backgroundColor: colors.leafDeep, borderColor: colors.leafDeep },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink },
  chipTextOn: { color: colors.white },
  day: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink3, marginBottom: 8 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  orderNo: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink3 },
  tag: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(122,168,62,0.14)',
    flexShrink: 1,
  },
  tagDoor: { backgroundColor: 'rgba(214,92,63,0.12)' },
  tagText: { fontFamily: fonts.bodySemi, fontSize: 11.5, color: colors.leafDeep },
  tagTextDoor: { color: colors.tomato },
  note: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    marginTop: 8,
  },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.ink3, marginTop: 6 },
  call: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.leafDeep, marginTop: 6 },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink3,
    marginTop: 34,
    textAlign: 'center',
  },
  retry: { marginTop: 30, alignItems: 'center' },
  retryText: { fontFamily: fonts.body, fontSize: 14, color: colors.tomato, textAlign: 'center' },
});
