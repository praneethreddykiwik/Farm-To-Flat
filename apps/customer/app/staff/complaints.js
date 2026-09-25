/**
 * Complaints, in the operator's pocket.
 *
 * A customer photographs what was wrong with the bag at their door — a bruised tomato, a short
 * weight, a missing bunch — and that photograph is the only evidence either side will ever have.
 * Until now it only existed inside the web panel's order drawer, which meant it could only be found
 * by someone who already knew which order it was on. This is the same queue on the phone, so
 * whoever is nearest can look at the picture and decide.
 *
 * Deciding is deliberately two plain buttons. "Put right" and "Decline" are the only two answers
 * that exist, and both are recorded against the report rather than replacing it — what the customer
 * wrote is never edited.
 */
import React, { useCallback, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
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
import { useStaffRefresh } from '../../src/hooks/useStaffRefresh';
import { showToast } from '../../src/features/ui/uiSlice';
import { selectEffectiveRole } from '../../src/features/role/roleSlice';

const inr = (paise) => `₹${(Number(paise) / 100).toLocaleString('en-IN')}`;
const title = (s) =>
  String(s || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

/** "3 Oct, 4:05 pm" — a complaint is read against when the delivery actually happened. */
const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

const TABS = [
  { key: 'OPEN', label: 'Waiting' },
  { key: 'RESOLVED', label: 'Put right' },
  { key: 'DECLINED', label: 'Declined' },
];

export default function StaffComplaints() {
  const role = useSelector(selectEffectiveRole);
  const dispatch = useDispatch();
  const [tab, setTab] = useState('OPEN');
  const [issues, setIssues] = useState(null);
  const [openCount, setOpenCount] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // issue id being decided
  const [zoom, setZoom] = useState(null); // photo opened full-screen

  const load = useCallback(async () => {
    try {
      const d = await adminApi.issues(`?status=${tab}`);
      setIssues(d.issues || []);
      setOpenCount(d.openCount || 0);
      setError(null);
    } catch (e) {
      setError(e.message || 'Could not load complaints');
    }
  }, [tab]);
  const { refreshing, onRefresh } = useStaffRefresh(load);

  async function decide(iss, status) {
    setBusy(iss.id);
    try {
      await adminApi.answerIssue(iss.order.id, iss.id, { status });
      dispatch(
        showToast({ title: status === 'RESOLVED' ? 'Marked as put right' : 'Report declined' }),
      );
      await load();
    } catch {
      dispatch(showToast({ title: 'Could not update — try again', tone: 'error' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.root}>
      <StaffHeader
        title="Complaints"
        subtitle={
          openCount > 0 ? `${openCount} waiting on a decision` : 'Nothing waiting on a decision'
        }
        roleLabel={role.label || 'Admin'}
      />

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>
              {t.label}
              {t.key === 'OPEN' && openCount > 0 ? ` · ${openCount}` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.leaf} />
        }
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{error}</Text>
          </View>
        ) : issues === null ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Loading…</Text>
          </View>
        ) : issues.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.emptyText}>
              {tab === 'OPEN' ? 'Every complaint has been answered.' : 'Nothing here.'}
            </Text>
          </View>
        ) : (
          issues.map((iss) => {
            const o = iss.order || {};
            const open = iss.status === 'OPEN';
            return (
              <View key={iss.id} style={[styles.card, open && styles.cardOpen]}>
                <View style={styles.cardHead}>
                  <Text style={styles.reason}>{title(iss.reason)}</Text>
                  <Text style={[styles.status, open && styles.statusOpen]}>
                    {open ? 'Waiting' : title(iss.status)}
                  </Text>
                </View>

                {/* Enough of the delivery to act without opening the order first. */}
                <Text style={styles.meta}>
                  {[o.orderNumber, o.customerName].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.meta}>
                  {[o.community, o.block, o.flat && `Flat ${o.flat}`].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.metaDim}>
                  {[
                    o.deliveredAt ? `Delivered ${when(o.deliveredAt)}` : null,
                    `Reported ${when(iss.createdAt)}`,
                    o.totalPaise != null ? inr(o.totalPaise) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>

                {iss.note ? <Text style={styles.note}>{iss.note}</Text> : null}

                {iss.photos?.length ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.strip}
                  >
                    {iss.photos.map((u) => (
                      // Tap to fill the screen: a bruise is rarely visible in a 96px thumbnail.
                      <Pressable key={u} onPress={() => setZoom(u)}>
                        <Image source={{ uri: u }} style={styles.thumb} />
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}

                {iss.resolution ? <Text style={styles.resolution}>{iss.resolution}</Text> : null}

                {o.mobile ? (
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${o.mobile}`)}
                    style={styles.callBtn}
                  >
                    <Text style={styles.callText}>Call {o.mobile}</Text>
                  </Pressable>
                ) : null}

                {open ? (
                  <View style={styles.actions}>
                    <Pressable
                      disabled={busy === iss.id}
                      onPress={() => decide(iss, 'RESOLVED')}
                      style={[styles.btn, styles.btnPrimary, busy === iss.id && styles.btnOff]}
                    >
                      <Text style={styles.btnPrimaryText}>Put right</Text>
                    </Pressable>
                    <Pressable
                      disabled={busy === iss.id}
                      onPress={() => decide(iss, 'DECLINED')}
                      style={[styles.btn, styles.btnGhost, busy === iss.id && styles.btnOff]}
                    >
                      <Text style={styles.btnGhostText}>Decline</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Full-screen photo. Tap anywhere to dismiss — nothing else to do here. */}
      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <Pressable style={styles.zoomWrap} onPress={() => setZoom(null)}>
          {zoom ? (
            <Image source={{ uri: zoom }} style={styles.zoomImg} resizeMode="contain" />
          ) : null}
          <Text style={styles.zoomHint}>Tap to close</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  tab: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(14,27,20,0.05)',
  },
  tabOn: { backgroundColor: colors.leaf },
  tabText: { fontFamily: fonts.body, fontSize: 13, color: colors.ink3 },
  tabTextOn: { color: '#fff', fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(14,27,20,0.08)',
  },
  cardOpen: { borderLeftWidth: 3, borderLeftColor: colors.tomato },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reason: { fontFamily: fonts.display, fontSize: 17, color: colors.ink },
  status: { fontFamily: fonts.body, fontSize: 12, color: colors.ink3 },
  statusOpen: { color: colors.tomato, fontWeight: '700' },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.ink2, marginTop: 3 },
  metaDim: { fontFamily: fonts.body, fontSize: 12, color: colors.ink3, marginTop: 3 },
  note: { fontFamily: fonts.body, fontSize: 14.5, color: colors.ink, marginTop: 10 },
  strip: { marginTop: 12 },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: 'rgba(14,27,20,0.06)',
  },
  resolution: { fontFamily: fonts.body, fontSize: 13, color: colors.ink3, marginTop: 10 },
  callBtn: { marginTop: 12 },
  callText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.leafDeep, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 11, borderRadius: 999, alignItems: 'center' },
  btnPrimary: { backgroundColor: colors.leaf },
  btnPrimaryText: { fontFamily: fonts.body, fontWeight: '700', color: '#fff', fontSize: 14 },
  btnGhost: { backgroundColor: 'rgba(14,27,20,0.06)' },
  btnGhostText: { fontFamily: fonts.body, fontWeight: '600', color: colors.ink2, fontSize: 14 },
  btnOff: { opacity: 0.5 },
  emptyBox: { alignItems: 'center', paddingVertical: 44, gap: 12 },
  emptyIcon: { fontSize: 30, color: colors.leafDeep },
  emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.ink3, textAlign: 'center' },
  zoomWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  zoomImg: { width: '92%', height: '78%' },
  zoomHint: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.65)' },
});
