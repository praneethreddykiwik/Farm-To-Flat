import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDispatch } from 'react-redux';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';
import { roleCleared } from '../features/role/roleSlice';
import { useSignOut } from '../hooks/useSession';

/** Header for every staff screen: title, role chip, and sign-out (returns to the login). */
/**
 * @param {{ title: string, subtitle?: string, roleLabel?: string, tabs?: {key:string,label:string,href:string}[], active?: string }} props
 */
export function StaffHeader({ title, subtitle, roleLabel, tabs, active }) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const signOut = useSignOut();
  const router = useRouter();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 10 }]}>
      <View style={styles.rail}>
        <View style={styles.brandMark}>
          <Text style={styles.brandLeaf}>🌿</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>Farm to Flat</Text>
          {roleLabel ? <Text style={styles.role}>{roleLabel}</Text> : null}
        </View>
        <Pressable
          onPress={() => {
            dispatch(roleCleared());
            signOut();
          }}
          style={styles.signout}
          hitSlop={10}
        >
          <Text style={styles.signoutText}>Sign out</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {/* A role has more than one screen it needs — the buyer and the rider both read customer
          notes — so give them a way between them rather than pinning each to one page. */}
      {tabs?.length ? (
        <View style={styles.tabs}>
          {tabs.map((t) => {
            const on = t.key === active;
            return (
              <Pressable
                key={t.key}
                onPress={() => (on ? null : router.replace(t.href))}
                style={[styles.tab, on && styles.tabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingBottom: 8, backgroundColor: colors.canvas },
  rail: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.leaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLeaf: { fontSize: 20 },
  brand: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  role: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.leaf, marginTop: 1 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(14,27,20,0.08)',
  },
  tabOn: { backgroundColor: colors.leafDeep, borderColor: colors.leafDeep },
  tabText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.ink },
  tabTextOn: { color: colors.white },
  signout: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  signoutText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink2 },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
    color: colors.ink,
  },
  subtitle: { fontFamily: fonts.body, fontSize: 13.5, color: colors.ink3, marginTop: 3 },
});
