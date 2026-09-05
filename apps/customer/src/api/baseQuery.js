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

let refreshPromise = null;

async function refreshSession(api) {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await readRefreshToken();
      if (!refreshToken) return null;
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
      await clearRefreshToken();
      api.dispatch(signedOut());
      return null;
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
