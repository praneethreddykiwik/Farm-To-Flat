import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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

// How each cost-approval state looks. null = the buyer hasn't entered a price yet.
const STATUS = {
  AUTO_APPROVED: { label: '✓ Auto-approved', bg: colors.leafSoft, fg: colors.leafDeep },
  NEEDS_APPROVAL: { label: '⏳ Awaiting admin', bg: '#f6ecd4', fg: '#8a5a12' },
  APPROVED: { label: '✓ Approved', bg: colors.leafSoft, fg: colors.leafDeep },
  REJECTED: { label: '✕ Rejected', bg: '#f7dcd6', fg: '#8a2f22' },
};

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

  // Update one line in place after its price is submitted, so the list doesn't flash a full reload.
  const patchLine = useCallback((productId, record) => {
    setData((d) => {
      if (!d) return d;
      const byCategory = d.byCategory.map((g) => ({
        ...g,
        items: g.items.map((it) =>
          it.productId === productId
            ? {
                ...it,
                actualCostPaise: String(record.actualCostPaise),
                variancePct: record.variancePct,
                approvalStatus: record.status,
              }
            : it,
        ),
      }));
      const needsApprovalCount = byCategory
        .flatMap((g) => g.items)
        .filter((it) => it.approvalStatus === 'NEEDS_APPROVAL').length;
      return { ...d, byCategory, needsApprovalCount };
    });
  }, []);

  const buffer = data?.settings?.costBufferPct;
  const autoOn = data?.settings?.autoApprove;

  return (
    <View style={styles.root}>
      <StaffHeader
        title="Procurement"
        subtitle="Buy the list, enter what you paid"
        roleLabel={role.label || 'Procurement'}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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

            {buffer != null ? (
              <View style={styles.bufferNote}>
                <Text style={styles.bufferNoteText}>
                  {autoOn
                    ? `Prices within ±${buffer}% of the estimate approve automatically. Beyond that, the admin is asked.`
                    : 'Every price you enter goes to the admin for approval.'}
                </Text>
                {data.needsApprovalCount > 0 ? (
                  <Text style={styles.bufferPending}>
                    {data.needsApprovalCount} waiting on admin approval
                  </Text>
                ) : null}
              </View>
            ) : null}

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
                  <ProcureItem key={it.productId} item={it} onSubmitted={patchLine} />
                ))}
              </View>
            ))}
            <View style={{ height: 60 }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ProcureItem({ item, onSubmitted }) {
  const [paid, setPaid] = useState(
    item.actualCostPaise != null ? String(Number(item.actualCostPaise) / 100) : '',
  );
  const [busy, setBusy] = useState(false);
  const st = STATUS[item.approvalStatus];

  async function save() {
    const rupees = parseFloat(paid);
    if (!Number.isFinite(rupees) || rupees < 0) return;
    setBusy(true);
    try {
      const { record } = await adminApi.submitProcurementCost(
        item.productId,
        Math.round(rupees * 100),
      );
      onSubmitted(item.productId, record);
    } catch {
      // leave the input as-is so they can retry
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.item}>
      <View style={styles.itemTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemSub}>
            {item.farm} · {item.orders} order{item.orders > 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.qtyCol}>
          <Text style={styles.procure}>Buy {qty(item.procureQty, item.unit)}</Text>
          <Text style={styles.estCost}>est {inr(item.procureCostPaise)}</Text>
        </View>
      </View>

      <View style={styles.payRow}>
        <View style={styles.inputWrap}>
          <Text style={styles.rupee}>₹</Text>
          <TextInput
            style={styles.input}
            value={paid}
            onChangeText={setPaid}
            placeholder="what you paid"
            placeholderTextColor={colors.ink3}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={save}
          />
        </View>
        <Pressable
          style={[styles.saveBtn, busy && { opacity: 0.5 }]}
          disabled={busy}
          onPress={save}
        >
          <Text style={styles.saveText}>{busy ? '…' : 'Save'}</Text>
        </Pressable>
      </View>

      {st ? (
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
            <Text style={[styles.statusText, { color: st.fg }]}>{st.label}</Text>
          </View>
          {item.variancePct != null ? (
            <Text style={styles.variance}>
              {item.variancePct > 0 ? '+' : ''}
              {item.variancePct}% vs estimate
            </Text>
          ) : null}
        </View>
      ) : null}
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
  bufferNote: {
    backgroundColor: 'rgba(14,27,20,0.04)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  bufferNoteText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
  bufferPending: { fontFamily: fonts.bodySemi, fontSize: 12.5, color: '#8a5a12', marginTop: 6 },
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
  item: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  itemSub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.ink3, marginTop: 1 },
  qtyCol: { alignItems: 'flex-end' },
  procure: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  estCost: { fontFamily: fonts.body, fontSize: 11.5, color: colors.ink3, marginTop: 1 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvas,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: 12,
  },
  rupee: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink3 },
  input: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 10,
    paddingLeft: 6,
  },
  saveBtn: {
    backgroundColor: colors.leaf,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  saveText: { fontFamily: fonts.bodySemi, fontSize: 13.5, color: colors.white },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontFamily: fonts.bodySemi, fontSize: 11.5 },
  variance: { fontFamily: fonts.body, fontSize: 11.5, color: colors.ink3 },
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
