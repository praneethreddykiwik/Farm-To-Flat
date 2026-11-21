/**
 * Keep two phones on one account in step (21 Nov 2026).
 *
 * The basket, orders, wallet and profile live on the server, but a phone only asked for them again
 * when it restarted or changed something itself. RTK Query's "refetch on focus" listens for browser
 * window events, which React Native never sends — so a second phone signed in to the same account
 * kept showing its old copy (owner: "I placed orders on one phone and nothing is synced").
 *
 * Now, when the app comes back to the screen after being away for a few seconds, the account's
 * live data is marked stale and re-fetched. The product catalogue is left alone (large, and has its
 * own refresh rules).
 */
export const LIVE_TAGS = [
  'Cart',
  'Orders',
  'Wallet',
  'Me',
  'Addresses',
  'Notifications',
  'Windows',
];
export const MIN_AWAY_MS = 5000;

/**
 * Decide whether a foreground should refresh. Pure, so it can be tested.
 * @param {number|null} wentAwayAt  when the app left the screen (ms), or null
 * @param {number} now
 */
export function shouldRefresh(wentAwayAt, now) {
  return wentAwayAt != null && now - wentAwayAt >= MIN_AWAY_MS;
}

/**
 * @param {{ addEventListener: (type: 'change', fn: (s: string) => void) => { remove: () => void } }} appState
 * @param {() => void} refresh
 * @param {() => number} [clock]
 */
export function watchForeground(appState, refresh, clock = Date.now) {
  let awayAt = /** @type {number|null} */ (null);
  const sub = appState.addEventListener('change', (state) => {
    if (state === 'active') {
      if (shouldRefresh(awayAt, clock())) refresh();
      awayAt = null;
    } else if (awayAt == null) awayAt = clock();
  });
  return () => sub.remove();
}
