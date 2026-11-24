/**
 * Get published updates onto customers' phones promptly (24 Nov 2026).
 *
 * expo-updates only downloads a new update in the background when the app is opened, and only
 * switches to it on the NEXT full restart. Most people never close the app: they switch away and
 * come back, so a phone could run an old version for days. The owner saw this as "the family size
 * and the kitchen guide only work for super admin": both had shipped to everyone, but customers'
 * phones were still on an older version.
 *
 * Now:
 *  - The app checks for an update when it starts, and again whenever it comes back after a minute
 *    or more away, and downloads it in the background.
 *  - Once an update is downloaded, it is switched on the next time the app comes back after
 *    being away for APPLY_AFTER_AWAY_MS. Coming back after a long break feels like opening the app,
 *    so a restart then goes unnoticed.
 *  - Never on a screen where a restart would lose something: paying, checkout, an order, a form,
 *    signing in. The update then waits for the next safe return, or the next full restart.
 *
 * The decisions are pure functions with injected dependencies, so they can be tested.
 */

export const CHECK_AFTER_AWAY_MS = 60 * 1000;
export const APPLY_AFTER_AWAY_MS = 5 * 60 * 1000;

/**
 * First path segment of screens where a restart could lose work or money. Expo Router paths drop
 * route groups, so the sign-in screens are /welcome, /phone, /otp and /address.
 */
const UNSAFE = new Set([
  'checkout',
  'confirm',
  'order',
  'coupon',
  'wallet',
  'address',
  'change-mobile',
  'delete-account',
  'support',
  'staff',
  'meal-checkin',
  'welcome',
  'phone',
  'otp',
]);

/** @param {string|null|undefined} path */
export function isSafeToRestart(path) {
  const first = String(path || '/')
    .split('?')[0]
    .split('/')
    .filter(Boolean)[0];
  return !first || !UNSAFE.has(first);
}

/**
 * @param {{ ready: boolean, awayMs: number, path: string }} s
 * @returns {'apply'|'check'|'none'}
 */
export function decideOnReturn({ ready, awayMs, path }) {
  if (ready && awayMs >= APPLY_AFTER_AWAY_MS && isSafeToRestart(path)) return 'apply';
  if (!ready && awayMs >= CHECK_AFTER_AWAY_MS) return 'check';
  return 'none';
}

/**
 * Start watching. Returns a stop function.
 *
 * @param {{
 *   updates: any,                       // the expo-updates module (or a fake)
 *   appState: { addEventListener: (t: 'change', fn: (s: string) => void) => { remove: () => void } },
 *   getPath: () => string,
 *   clock?: () => number,
 *   onError?: (e: unknown) => void,
 * }} deps
 */
export function watchAppUpdates({ updates, appState, getPath, clock = Date.now, onError }) {
  if (!updates?.isEnabled || typeof updates.checkForUpdateAsync !== 'function') return () => {};

  let ready = false;
  let checking = /** @type {Promise<void>|null} */ (null);
  let awayAt = /** @type {number|null} */ (null);

  const check = () => {
    if (ready || checking) return checking || Promise.resolve();
    checking = (async () => {
      try {
        const found = await updates.checkForUpdateAsync();
        if (found?.isAvailable) {
          const got = await updates.fetchUpdateAsync();
          if (got?.isNew) ready = true;
        }
      } catch (e) {
        // Offline, or the update server is slow: try again on the next return. Never surfaced.
        onError?.(e);
      } finally {
        checking = null;
      }
    })();
    return checking;
  };

  check();

  const sub = appState.addEventListener('change', (state) => {
    if (state !== 'active') {
      if (awayAt == null) awayAt = clock();
      return;
    }
    const awayMs = awayAt == null ? 0 : clock() - awayAt;
    awayAt = null;
    const what = decideOnReturn({ ready, awayMs, path: getPath() });
    if (what === 'apply') {
      Promise.resolve(updates.reloadAsync()).catch((e) => onError?.(e));
    } else if (what === 'check') {
      check();
    }
  });

  return () => sub.remove();
}

/**
 * One line for Profile → About, so anyone can tell which version a phone is running.
 * e.g. "update 21 Nov · 3d445bda" or "built-in version".
 *
 * @param {any} updates  the expo-updates module (or a fake)
 */
export function describeRunningUpdate(updates) {
  if (!updates?.isEnabled || updates.isEmbeddedLaunch || !updates.updateId)
    return 'built-in version';
  const id = String(updates.updateId).slice(0, 8);
  const at = updates.createdAt instanceof Date ? updates.createdAt : null;
  if (!at || Number.isNaN(at.getTime())) return `update ${id}`;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `update ${at.getDate()} ${months[at.getMonth()]} · ${id}`;
}
