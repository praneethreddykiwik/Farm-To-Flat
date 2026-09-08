import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { StaffHeader } from '../../src/components/StaffHeader';
import { colors, fonts } from '../../src/theme';
import { adminApi } from '../../src/lib/adminApi';
import { selectEffectiveRole } from '../../src/features/role/roleSlice';

const inr = (paise) => `₹${(Number(paise) / 100).toLocaleString('en-IN')}`;
const UNIT = { KG: 'kg', BUNCH: 'bunch', PIECE: 'pc', DOZEN: 'dz', PACK: 'pack' };
const qty = (q, u) =>
  `${Number(q).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${UNIT[u] || ''}`;
const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'te', label: 'తెలుగు' },
];

export default function StaffProcurement() {
  const role = useSelector(selectEffectiveRole);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    adminApi
      .procurement()
      .then(setData)
      .catch((e) => setError(e.message || 'Could not load'));
  }, []);
  useEffect(load, [load]);

  function download(lang) {
    const url = adminApi.procurementCsvUrl(lang === 'en' ? '' : `?lang=${lang}`);
    Linking.openURL(url).catch(() => {});
  }

  return (
    <View style={styles.root}>
      <StaffHeader
        title="Procurement"
        subtitle="What to buy for the open orders"
        roleLabel={role.label || 'Procurement'}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {error ? (
          <Empty text={error} onRetry={load} />
        ) : !data ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : (
          <>
            <View style={styles.kpis}>
              <Kpi big value={inr(data.totalProcureCostPaise)} label="To procure" />
              <Kpi value={String(data.skuCount)} label="Products" />
              <Kpi value={String(data.orderCount)} label="Open orders" />
            </View>

            <View style={styles.dlCard}>
              <Text style={styles.dlTitle}>Download purchase list</Text>
              <View style={styles.dlRow}>
                {LANGS.map((l) => (
                  <Pressable key={l.code} style={styles.dlBtn} onPress={() => download(l.code)}>
                    <Text style={styles.dlBtnText}>⬇ {l.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {data.byCategory.map((g) => (
              <View key={g.categoryId} style={styles.group}>
                <View style={styles.groupHead}>
                  <Text style={styles.groupName}>{g.name}</Text>
                  <Text style={styles.groupSub}>
                    {g.items.length} · {inr(g.subtotalPaise)}
                  </Text>
                </View>
                {g.items.map((it) => (
                  <View key={it.productId} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{it.name}</Text>
                      <Text style={styles.itemSub}>
                        {it.farm} · {it.orders} order{it.orders > 1 ? 's' : ''}
                      </Text>
                    </View>
                    <View style={styles.qtyCol}>
                      <Text style={styles.ordered}>{qty(it.requiredQty, it.unit)} ordered</Text>
                      <Text style={styles.procure}>Buy {qty(it.procureQty, it.unit)}</Text>
                      <Text style={styles.buffer}>+{it.bufferPct}% buffer</Text>
                    </View>
                    <Text style={styles.cost}>{inr(it.procureCostPaise)}</Text>
                  </View>
                ))}
              </View>
            ))}
            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Kpi({ value, label, big }) {
  return (
    <View style={[styles.kpi, big && styles.kpiBig]}>
      <Text style={[styles.kpiValue, big && { color: colors.leafDeep }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}
function Empty({ text, onRetry }) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.muted}>{text}</Text>
      <Pressable onPress={onRetry} style={styles.retry}>
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: 20, paddingTop: 8 },
  muted: { fontFamily: fonts.body, color: colors.ink3, fontSize: 14, paddingVertical: 20 },
  kpis: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  kpi: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  kpiBig: { flex: 1.3 },
  kpiValue: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, letterSpacing: -0.5 },
  kpiLabel: { fontFamily: fonts.body, fontSize: 11.5, color: colors.ink3, marginTop: 4 },
  dlCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: 18,
  },
  dlTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink, marginBottom: 12 },
  dlRow: { flexDirection: 'row', gap: 8 },
  dlBtn: {
    flex: 1,
    backgroundColor: colors.sprout,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
  },
  dlBtnText: { fontFamily: fonts.bodySemi, fontSize: 13.5, color: colors.night },
  group: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: 14,
    overflow: 'hidden',
  },
  groupHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  groupName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  groupSub: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.ink3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    gap: 10,
  },
  itemName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  itemSub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.ink3, marginTop: 1 },
  qtyCol: { alignItems: 'flex-end' },
  ordered: { fontFamily: fonts.body, fontSize: 11, color: colors.ink3 },
  procure: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  buffer: { fontFamily: fonts.body, fontSize: 10.5, color: colors.amber },
  cost: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.ink,
    minWidth: 62,
    textAlign: 'right',
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
