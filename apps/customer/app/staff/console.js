import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSelector } from 'react-redux';
import { StaffHeader } from '../../src/components/StaffHeader';
import { colors, fonts } from '../../src/theme';
import { adminApi } from '../../src/lib/adminApi';
import { selectEffectiveRole } from '../../src/features/role/roleSlice';

const inr = (paise) => `₹${(Number(paise) / 100).toLocaleString('en-IN')}`;

const SECTIONS = [
  {
    key: 'procurement',
    title: 'Procurement',
    sub: 'What to buy · buy-list + download',
    icon: '🧺',
    href: '/staff/procurement',
  },
  {
    key: 'fulfilment',
    title: 'Fulfilment',
    sub: 'Packing & delivery details',
    icon: '🚚',
    href: '/staff/fulfilment',
  },
];

export default function StaffConsole() {
  const role = useSelector(selectEffectiveRole);
  const router = useRouter();
  const [m, setM] = useState(null);

  const load = useCallback(() => {
    adminApi
      .metrics()
      .then(setM)
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const canShop = role.role === 'SUPER_ADMIN';
  const cards = SECTIONS.filter((s) => role.sections?.includes(s.key));

  return (
    <View style={styles.root}>
      <StaffHeader
        title="Operations console"
        subtitle="Everything from the web panel, in your pocket"
        roleLabel={role.label || 'Admin'}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {m ? (
          <View style={styles.kpis}>
            <Kpi value={String(m.today.orders)} label="Orders today" />
            <Kpi big value={inr(m.today.revenuePaise)} label="Revenue today" />
            <Kpi value={`${m.catalog.active}`} label="Products live" />
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Your tools</Text>
        {cards.map((s) => (
          <Pressable key={s.key} style={styles.card} onPress={() => router.push(s.href)}>
            <Text style={styles.cardIcon}>{s.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{s.title}</Text>
              <Text style={styles.cardSub}>{s.sub}</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        ))}

        {canShop ? (
          <>
            <Text style={styles.sectionLabel}>Super admin</Text>
            <Pressable
              style={[styles.card, styles.cardAccent]}
              onPress={() => router.replace('/(tabs)')}
            >
              <Text style={styles.cardIcon}>🛒</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Open the shopping app</Text>
                <Text style={styles.cardSub}>Home, basket, orders, wallet + the AI planner</Text>
              </View>
              <Text style={styles.chev}>›</Text>
            </Pressable>
          </>
        ) : null}

        <View style={styles.noteBox}>
          <Text style={styles.note}>
            Signed in as a {role.label?.toLowerCase()} number. You only see the tools for your role
            {role.aiAccess ? ' · AI planner enabled' : ''}.
          </Text>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function Kpi({ value, label, big }) {
  return (
    <View style={[styles.kpi, big && { flex: 1.3 }]}>
      <Text style={[styles.kpiValue, big && { color: colors.leafDeep }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: 20, paddingTop: 8 },
  kpis: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  kpi: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  kpiValue: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, letterSpacing: -0.5 },
  kpiLabel: { fontFamily: fonts.body, fontSize: 11.5, color: colors.ink3, marginTop: 4 },
  sectionLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: 10,
    marginTop: 6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: 12,
  },
  cardAccent: { borderColor: colors.leafSoft, backgroundColor: '#f6fbf6' },
  cardIcon: { fontSize: 26 },
  cardTitle: { fontFamily: fonts.bodySemi, fontSize: 15.5, color: colors.ink },
  cardSub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.ink3, marginTop: 2 },
  chev: { fontFamily: fonts.display, fontSize: 24, color: colors.ink3 },
  noteBox: { backgroundColor: 'rgba(14,27,20,0.04)', borderRadius: 14, padding: 14, marginTop: 8 },
  note: { fontFamily: fonts.body, fontSize: 12.5, color: colors.ink2, lineHeight: 18 },
});
