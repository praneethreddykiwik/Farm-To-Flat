/**
 * One transport for RTK Query. Handles:
 *  - Bearer access token, X-Request-Id on every call, Idempotency-Key on every mutation
 *  - a single in-flight refresh on 401, with rotation persisted to SecureStore
 *  - the stable error shape { code, message, details?, status }
 *  - the in-app mock server when EXPO_PUBLIC_USE_MOCKS=1
 */
import { API_BASE, env } from '../lib/env';
import { idempotencyKey, requestId } from '../lib/ids';
import { accessRefreshed, signedOut } from '../features/auth/authSlice';
import { clearRefreshToken, readRefreshToken, saveRefreshToken } from '../features/auth/secure';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** @returns {{ code: string, message: string, details?: any, status: number }} */
function normaliseError(status, body) {
  if (body && body.error && typeof body.error === 'object') {
    return {
      status,
      code: body.error.code || 'UNKNOWN',
      message: body.error.message || 'Something went wrong',
      details: body.error.details,
    };
  }
  if (status === 0)
    return { status, code: 'NETWORK', message: 'No connection. Check your network and try again.' };
  return { status, code: 'UNKNOWN', message: 'Something went wrong. Please try again.' };
}

async function rawRequest({ url, method = 'GET', body, headers }) {
  if (env.useMocks) {
    const { handle } = require('./mock/server');
    const res = await handle(method, url, body, headers);
    return { status: res.status, data: res.body };
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { status: 0, data: null };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

/**
 * How long to keep trying a refresh before giving up, in milliseconds between attempts.
 * Sums to ~70s, which is what it takes to outlast a free-tier cold start.
 */
const BACKOFF_MS = [1000, 2000, 4000, 8000, 12000, 16000, 20000];

let refreshPromise = null;

async function refreshSession(api) {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await readRefreshToken();
      if (!refreshToken) return null;
      // Render's free tier cold-starts (~50s). Retry the refresh through it, and ONLY sign the user
      // out on a DEFINITIVE 401 (the refresh token is genuinely invalid/expired) — never on a transient
      // network failure (status 0), timeout, or 5xx. Signing out on a cold-start blip is what dumped
      // users back to the login screen when they opened the shopping app.
      //
      // THE BUDGET HAS TO OUTLAST THE COLD START. It was three attempts 1.8s apart — 5.4 seconds
      // against a wake that takes fifty. All three hit a sleeping server, every one returned status
      // 0, and the function gave up with the refresh token still safely stored but no access token
      // to show for it, so the app rendered its logged-out self: "What's your number?" again, then
      // community selection again, for a customer who had signed in days ago and never left.
      // Backing off to roughly seventy seconds covers a cold start with room to spare, and costs
      // nothing when the server is awake because the first attempt succeeds.
      for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
        const res = await rawRequest({
          url: '/auth/refresh',
          method: 'POST',
          body: { refreshToken },
          headers: { 'X-Request-Id': requestId() },
        });
        if (res.status >= 200 && res.status < 300 && res.data?.accessToken) {
          await saveRefreshToken(res.data.refreshToken);
          api.dispatch(accessRefreshed(res.data.accessToken));
          return res.data.accessToken;
        }
        if (res.status === 401) {
          await clearRefreshToken();
          api.dispatch(signedOut());
          return null;
        }
        // transient (0 / 5xx / cold start) — wait, then retry; keep the session either way
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
      }
      return null; // gave up, but the session is preserved (no sign-out on a transient failure)
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** @type {import('@reduxjs/toolkit/query').BaseQueryFn} */
export const baseQuery = async (args, api) => {
  const req = typeof args === 'string' ? { url: args } : args;
  const method = (req.method || 'GET').toUpperCase();
  const build = (token) => ({
    'X-Request-Id': requestId(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(MUTATING.has(method) ? { 'Idempotency-Key': req.idempotencyKey || idempotencyKey() } : {}),
    ...(req.headers || {}),
  });

  let token = /** @type {any} */ (api.getState()).auth.accessToken;
  let res = await rawRequest({ url: req.url, method, body: req.body, headers: build(token) });

  if (res.status === 401 && !req.url.startsWith('/auth/')) {
    token = await refreshSession(api);
    if (token)
      res = await rawRequest({ url: req.url, method, body: req.body, headers: build(token) });
  }

  if (res.status >= 200 && res.status < 300) return { data: res.data };
  return { error: normaliseError(res.status, res.data) };
};
