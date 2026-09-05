/**
 * Local key-value cache for non-sensitive data (cached catalog, UI preferences).
 * Tokens NEVER go here; they live in src/features/auth/secure.js (expo-secure-store).
 *
 * Backed by expo-sqlite/kv-store so the app runs in Expo Go. When the team moves to a
 * development build, swap the adapter for react-native-mmkv (createMMKV) with the same shape.
 */
import Storage from 'expo-sqlite/kv-store';

export const kv = {
  /** @param {string} key */
  getString(key) {
    try {
      return Storage.getItemSync(key);
    } catch {
      return null;
    }
  },
  /** @param {string} key @param {string} value */
  setString(key, value) {
    try {
      Storage.setItemSync(key, value);
    } catch {}
  },
  /** @param {string} key */
  getJSON(key) {
    const raw = kv.getString(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  /** @param {string} key @param {unknown} value */
  setJSON(key, value) {
    kv.setString(key, JSON.stringify(value));
  },
  /** @param {string} key */
  remove(key) {
    try {
      Storage.removeItemSync(key);
    } catch {}
  },
};

export const KV_KEYS = {
  catalog: 'cache.catalog.v1',
  onboarded: 'ui.onboarded',
  reducedMotion: 'ui.reducedMotion',
  lastCommunity: 'ui.lastCommunity',
  plan: 'plan.v1',
};
