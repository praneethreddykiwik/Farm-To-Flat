/**
 * Token storage contract (agreed with Adnan, Day 2):
 *   access token  → memory only (Redux), 15 min lifetime
 *   refresh token → expo-secure-store, 30 days, rotating
 * Never AsyncStorage. Deleting the local token is not logout; POST /auth/logout revokes server-side.
 */
import * as SecureStore from 'expo-secure-store';

const REFRESH_KEY = 'f2f.refreshToken';

export async function saveRefreshToken(token) {
  await SecureStore.setItemAsync(REFRESH_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function readRefreshToken() {
  try {
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    return null;
  }
}

export async function clearRefreshToken() {
  try {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  } catch {}
}
