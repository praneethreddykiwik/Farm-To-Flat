import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { StaffHeader } from '../../src/components/StaffHeader';
import { colors, fonts } from '../../src/theme';
import { adminApi } from '../../src/lib/adminApi';
import { showToast } from '../../src/features/ui/uiSlice';
import { selectEffectiveRole } from '../../src/features/role/roleSlice';

const inr = (paise) => `₹${(Number(paise) / 100).toLocaleString('en-IN')}`;

// The ± tolerances an admin can pick for the cost buffer. "n percent, configurable" — these are the
// presets; the server clamps anything to 0..100.
const PRESETS = [1, 2, 5, 10];

export default function StaffApprovals() {
  const role = useSelector(selectEffectiveRole);
  const dispatch = useDispatch();
  const [approvals, setApprovals] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // productId being decided
  const [savingBuffer, setSavingBuffer] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, s] = await Promise.all([
        adminApi.procurementApprovals(),
        adminApi.procurementSettings(),
      ]);
      setApprovals(a.approvals || []);
      setSettings(s.settings || null);
    } catch (e) {
      setError(e.message || 'Could not load approvals');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function decide(item, decision) {
    setBusy(item.productId);
    try {
      await adminApi.procurementApprove(
        item.productId,
        decision,
        item.dateKey && item.dateKey !== 'all' ? item.dateKey : undefined,
      );
      dispatch(showToast({ title: decision === 'APPROVE' ? 'Cost accepted' : 'Cost rejected' }));
      await load();
    } catch {
      dispatch(showToast({ title: 'Could not update — try again', tone: 'error' }));
    } finally {
      setBusy(null);
    }
  }

  async function setBuffer(pct) {
    setSavingBuffer(true);
    try {
      const res = await adminApi.updateProcurementSettings({ costBufferPct: pct });
      setSettings(res.settings);
      dispatch(showToast({ title: `Buffer set to ±${pct}%` }));
    } catch {
      dispatch(showToast({ title: 'Could not save buffer', tone: 'error' }));
    } finally {
      setSavingBuffer(false);
    }
  }

  async function toggleAuto() {
    if (!settings) return;
    setSavingBuffer(true);
    try {
      const res = await adminApi.updateProcurementSettings({ autoApprove: !settings.autoApprove });
      setSettings(res.settings);
    } catch {
      dispatch(showToast({ title: 'Could not save', tone: 'error' }));
    } finally {
      setSavingBuffer(false);
    }
  }

  const loading = approvals === null && !error;

  return (
    <View style={styles.root}>
      <StaffHeader
        title="Cost approvals"
        subtitle="Buys that broke the buffer — accept or reject"
        roleLabel={role.label || 'Admin'}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={load} tintColor={colors.leaf} />
        }
      >
        {/* Buffer tolerance control */}
        {settings ? (
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Cost buffer</Text>
            <Text style={styles.settingsSub}>
              A buy within ±{settings.costBufferPct}% of the estimate
              {settings.autoApprove ? ' clears automatically' : ' still asks you'}. Beyond that, it
              lands here for a decision.
            </Text>
            <View style={styles.presets}>
              {PRESETS.map((p) => {
                const on = Number(settings.costBufferPct) === p;
                return (
                  <Pressable
                    key={p}
                    disabled={savingBuffer}
                    onPress={() => setBuffer(p)}
                    style={[styles.preset, on && styles.presetOn]}
                  >
                    <Text style={[styles.presetText, on && styles.presetTextOn]}>±{p}%</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              disabled={savingBuffer}
              onPress={toggleAuto}
              style={styles.autoRow}
              hitSlop={8}
            >
              <View style={[styles.check, settings.autoApprove && styles.checkOn]}>
                {settings.autoApprove ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <Text style={styles.autoText}>
                Auto-approve buys inside the buffer (no notification)
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>
          Waiting on you{approvals?.length ? ` · ${approvals.length}` : ''}
        </Text>

        {error ? (
          <View style={styles.emptyBox}>
            <Text style={styles.muted}>{error}</Text>
            <Pressable onPress={load} style={styles.retry}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator color={colors.leaf} />
          </View>
        ) : approvals.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.muted}>Nothing to approve. Every buy is within the buffer.</Text>
          </View>
        ) : (
          approvals.map((item) => {
            const v = item.variancePct;
            const over = v != null && v >= 0;
            const pct = v == null ? '—' : `${Math.abs(v).toFixed(1)}%`;
            return (
              <View key={`${item.dateKey}|${item.productId}`} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={[styles.varBadge, over ? styles.varOver : styles.varUnder]}>
                    <Text style={[styles.varText, over ? styles.varTextOver : styles.varTextUnder]}>
                      {over ? '▲' : '▼'} {pct} {over ? 'over' : 'under'}
                    </Text>
                  </View>
                </View>

                <View style={styles.jump}>
                  <View style={styles.jumpCol}>
                    <Text style={styles.jumpLabel}>Estimated</Text>
                    <Text style={styles.jumpFrom}>{inr(item.estCostPaise)}</Text>
                  </View>
                  <Text style={styles.jumpArrow}>→</Text>
                  <View style={styles.jumpCol}>
                    <Text style={styles.jumpLabel}>Paid</Text>
                    <Text style={[styles.jumpTo, over ? styles.jumpToOver : styles.jumpToUnder]}>
                      {inr(item.actualCostPaise)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.explain}>
                  Buffer exceeded {pct} {over ? 'over' : 'under'} the ±{item.bufferPctAtSubmit}%
                  tolerance
                  {item.dateKey && item.dateKey !== 'all' ? ` · ${item.dateKey}` : ''}.
                </Text>

                <View style={styles.actions}>
                  <Pressable
                    style={[styles.reject, busy === item.productId && styles.dim]}
                    disabled={busy === item.productId}
                    onPress={() => decide(item, 'REJECT')}
                  >
                    <Text style={styles.rejectText}>Reject</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.accept, busy === item.productId && styles.dim]}
                    disabled={busy === item.productId}
                    onPress={() => decide(item, 'APPROVE')}
                  >
                    <Text style={styles.acceptText}>
                      {busy === item.productId ? '…' : 'Accept'}
                    </Text>
                  </Pressable>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: 20, paddingTop: 6 },
  muted: {
    fontFamily: fonts.body,
    color: colors.ink3,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  settingsCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 16,
    marginBottom: 20,
  },
  settingsTitle: { fontFamily: fonts.bodySemi, fontSize: 15.5, color: colors.ink },
  settingsSub: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.ink3,
    marginTop: 4,
    lineHeight: 18,
  },
  presets: { flexDirection: 'row', gap: 8, marginTop: 14 },
  preset: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  presetOn: { backgroundColor: colors.leafDeep, borderColor: colors.leafDeep },
  presetText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink2 },
  presetTextOn: { color: colors.white },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.leaf, borderColor: colors.leaf },
  checkMark: { color: colors.white, fontSize: 13, fontFamily: fonts.bodySemi },
  autoText: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.ink2, lineHeight: 17 },

  sectionLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: 12,
  },

  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 15.5, color: colors.ink },
  varBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  varOver: { backgroundColor: '#f7dcd6' },
  varUnder: { backgroundColor: '#d9ecfb' },
  varText: { fontFamily: fonts.bodySemi, fontSize: 11.5 },
  varTextOver: { color: '#8a2f22' },
  varTextUnder: { color: '#1c5a8a' },

  jump: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    backgroundColor: colors.canvas,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  jumpCol: { flex: 1 },
  jumpLabel: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  jumpFrom: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 24,
    color: colors.ink2,
    marginTop: 2,
  },
  jumpArrow: { fontFamily: fonts.display, fontSize: 20, color: colors.ink3 },
  jumpTo: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, marginTop: 2 },
  jumpToOver: { color: '#8a2f22' },
  jumpToUnder: { color: '#1c5a8a' },
  explain: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.ink3,
    marginTop: 10,
    lineHeight: 17,
  },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  reject: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: '#e3b7ae',
  },
  rejectText: { fontFamily: fonts.bodySemi, fontSize: 14, color: '#8a2f22' },
  accept: {
    flex: 1.4,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.leaf,
  },
  acceptText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.white },
  dim: { opacity: 0.5 },

  emptyBox: { alignItems: 'center', paddingVertical: 44, gap: 12 },
  emptyIcon: { fontSize: 34, color: colors.leaf },
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
