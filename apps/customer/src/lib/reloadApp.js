/**
 * Restart the app from the crash screen (review #43, 21 Nov 2026).
 *
 * In order of preference: expo-updates' reloadAsync in a release build (a real restart of the JS,
 * picking up a downloaded update if there is one), React Native's DevSettings.reload in
 * development (reloadAsync refuses to run there), and last the caller's own reset — clearing the
 * boundary and rendering the tree again, which is all a binary without expo-updates can do.
 *
 * Kept free of React Native imports so the choice can be tested; the modules are passed in.
 *
 * @param {{ updates?: any, devSettings?: any, isDev?: boolean, reset: () => void }} deps
 * @returns {Promise<'updates'|'dev'|'reset'>}
 */
export async function reloadApp({ updates, devSettings, isDev, reset }) {
  if (!isDev && typeof updates?.reloadAsync === 'function') {
    try {
      await updates.reloadAsync();
      return 'updates';
    } catch {
      // fall through: a reset is better than a dead button
    }
  }
  if (isDev && typeof devSettings?.reload === 'function') {
    try {
      devSettings.reload();
      return 'dev';
    } catch {}
  }
  reset();
  return 'reset';
}
