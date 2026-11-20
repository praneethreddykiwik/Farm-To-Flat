import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { API_BASE, env } from '../lib/env';
import { isBelow } from '../lib/version';
import { colors } from '../theme';

/**
 * A full-screen "Update Fooducia" stop, shown only when the server says this version is retired
 * (MIN_APP_VERSION on the API — review #45). Asked once per launch; offline or unset, nothing shows.
 */
export function UpdateRequired() {
  const [store, setStore] = useState(/** @type {string|null} */ (null));
  useEffect(() => {
    if (env.useMocks) return undefined;
    let alive = true;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    fetch(`${API_BASE}/app/version`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (alive && v?.minVersion && isBelow(env.appVersion, v.minVersion))
          setStore(Platform.OS === 'ios' ? v.storeUrl?.ios : v.storeUrl?.android);
      })
      .catch(() => {})
      .finally(() => clearTimeout(t));
    return () => {
      alive = false;
      ac.abort();
    };
  }, []);
  if (!store) return null;
  return (
    <View style={styles.cover} accessibilityViewIsModal>
      <Text style={styles.title}>Update Fooducia</Text>
      <Text style={styles.body}>
        This version of the app is no longer supported. Update to keep ordering — your basket,
        orders and wallet are safe.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => Linking.openURL(store).catch(() => {})}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Update now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    zIndex: 1000,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 12,
    textAlign: 'center',
  },
  body: { fontSize: 16, lineHeight: 23, color: colors.ink2, textAlign: 'center', marginBottom: 28 },
  button: {
    backgroundColor: colors.leafDeep,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 999,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '600' },
});
