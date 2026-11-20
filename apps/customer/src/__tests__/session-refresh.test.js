/**
 * Review #39 / #40 (21 Nov 2026): a request that never answers ends as a network error instead of
 * spinning forever, and every refresh in the app shares ONE in-flight call so the single-use refresh
 * token is never spent twice.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/env', () => ({ API_BASE: 'http://api.test/api/v1', env: { useMocks: false } }));
let stored = 'rt_1';
vi.mock('../features/auth/secure', () => ({
  readRefreshToken: async () => stored,
  saveRefreshToken: async (t) => {
    stored = t;
  },
  clearRefreshToken: async () => {
    stored = null;
  },
}));

const { baseQuery, refreshSessionShared, REQUEST_TIMEOUT_MS } = await import('../api/baseQuery.js');

const json = (status, body) => ({ status, json: async () => body });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('one shared refresh', () => {
  it('two 401s and the launch-time restore at once make a single /auth/refresh call', async () => {
    let refreshCalls = 0;
    let token = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opts) => {
        if (url.endsWith('/auth/refresh')) {
          refreshCalls += 1;
          const sent = JSON.parse(opts.body).refreshToken;
          // the server rotates: a token works once
          if (sent !== 'rt_1') return json(401, { error: { code: 'UNAUTHENTICATED' } });
          await new Promise((r) => setTimeout(r, 20));
          return json(200, { accessToken: 'acc_2', refreshToken: 'rt_2', customer: { id: 'c1' } });
        }
        return opts.headers.Authorization === 'Bearer acc_2'
          ? json(200, { ok: true })
          : json(401, { error: { code: 'UNAUTHENTICATED' } });
      }),
    );
    const dispatched = [];
    const api = {
      getState: () => ({ auth: { accessToken: token } }),
      dispatch: (a) => {
        dispatched.push(a.type);
        if (a.type === 'auth/accessRefreshed') token = a.payload;
      },
    };
    const [a, b, boot] = await Promise.all([
      baseQuery('/cart', api),
      baseQuery('/orders', api),
      refreshSessionShared(api),
    ]);
    expect(refreshCalls).toBe(1);
    expect(a.data).toEqual({ ok: true });
    expect(b.data).toEqual({ ok: true });
    expect(boot.customer.id).toBe('c1');
    expect(dispatched).not.toContain('auth/signedOut');
    expect(stored).toBe('rt_2');
  });
});

describe('request timeout', () => {
  it('a server that never answers ends as a NETWORK error', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, opts) =>
          new Promise((_res, rej) => {
            opts.signal.addEventListener('abort', () => rej(new Error('aborted')));
          }),
      ),
    );
    const api = { getState: () => ({ auth: { accessToken: 'acc' } }), dispatch: () => {} };
    const p = baseQuery('/cart', api);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 10);
    const r = await p;
    expect(r.error.code).toBe('NETWORK');
  });
});
