import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';
import { roleCleared } from '../features/role/roleSlice';
import { useSignOut } from '../hooks/useSession';

/** Header for every staff screen: title, role chip, and sign-out (returns to the login). */
export function StaffHeader({ title, subtitle, roleLabel }) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const signOut = useSignOut();
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
