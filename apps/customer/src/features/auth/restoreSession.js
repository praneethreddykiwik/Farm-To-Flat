/**
 * Cold-start session restore, kept free of React so it can be tested on its own.
 *
 * Review #41 (21 Nov 2026): a slow launch showed the login screen to a signed-in user. The old
 * bootstrap raced one refresh against a 22-second timer and, when the timer won, finished booting
 * as signed out — the stored session was still there, but the app asked for the phone number again.
 * Worse, the abandoned refresh could still land on the server and rotate the single-use refresh
 * token, so the copy kept on the phone was already spent by the next launch.
 *
 * So now: never abandon an attempt in flight, never give up on a transient failure, and say
 * "reconnecting" while it takes long. The only thing that signs the user out is the server
 * answering 401 to the refresh — the token is genuinely invalid.
 */

/** How long a first attempt may take before we show the reconnecting screen. */
export const SLOW_AFTER_MS = 6000;
/** Waits between attempts after a transient failure; the last one repeats. */
export const RETRY_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 20000];

/**
 * @typedef {{ data?: any, error?: { status?: any } }} RefreshResult
 * @param {{
 *   readToken: () => Promise<string|null>,
 *   refresh: (token: string) => Promise<RefreshResult>,
 *   saveToken: (token: string) => Promise<void>,
 *   clearToken: () => Promise<void>,
 *   onSignedIn: (data: any) => void,
 *   onSignedOut: () => void,
 *   onReconnecting: () => void,
 *   isAlive: () => boolean,
 *   wait: (ms: number) => Promise<void>,
 *   setTimer?: (fn: () => void, ms: number) => any,
 *   clearTimer?: (t: any) => void,
 *   slowAfterMs?: number,
 * }} deps
 * @returns {Promise<'signedIn'|'signedOut'|'stopped'>}
 */
export async function restoreSession(deps) {
  const {
    readToken,
    refresh,
    saveToken,
    clearToken,
    onSignedIn,
    onSignedOut,
    onReconnecting,
    isAlive,
    wait,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    slowAfterMs = SLOW_AFTER_MS,
  } = deps;

  let token;
  try {
    token = await readToken();
  } catch {
    token = null;
  }
  if (!isAlive()) return 'stopped';
  if (!token) {
    onSignedOut(); // nothing stored: a genuine first launch or a past sign-out
    return 'signedOut';
  }

  let saidReconnecting = false;
  const sayReconnecting = () => {
    if (saidReconnecting || !isAlive()) return;
    saidReconnecting = true;
    onReconnecting();
  };

  for (let attempt = 0; isAlive(); attempt++) {
    const slow = setTimer(sayReconnecting, slowAfterMs);
    /** @type {RefreshResult} */
    let out;
    try {
      // Awaited to the end, never raced: a reply we stopped listening for may still have rotated
      // the token on the server.
      out = (await refresh(token)) || {};
    } catch {
      out = { error: { status: 0 } };
    } finally {
      clearTimer(slow);
    }
    if (!isAlive()) return 'stopped';

    if (out.data?.accessToken) {
      if (out.data.refreshToken) await saveToken(out.data.refreshToken);
      onSignedIn(out.data);
      return 'signedIn';
    }
    if (out.error?.status === 401) {
      await clearToken();
      onSignedOut();
      return 'signedOut';
    }
    // Transient (no network, timeout, 5xx, a cold server): keep the token, keep the user, retry.
    sayReconnecting();
    await wait(RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]);
  }
  return 'stopped';
}
