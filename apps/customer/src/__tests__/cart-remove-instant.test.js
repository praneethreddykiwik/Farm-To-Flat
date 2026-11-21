/**
 * Removing a basket line is instant (21 Nov 2026): it used to wait for the DELETE and a fresh GET of
 * the basket — two round trips, about a second — before anything moved. Now the line leaves the
 * cached basket at once and comes back if the server refuses.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

vi.mock('../lib/env', () => ({ API_BASE: 'http://api.test/api/v1', env: { useMocks: false } }));
vi.mock('../lib/kv', () => ({
  KV_KEYS: {},
  kv: {
    getString: () => null,
    setString: () => {},
    getJSON: () => null,
    setJSON: () => {},
    delete: () => {},
  },
}));
vi.mock('../features/auth/secure', () => ({
  readRefreshToken: async () => null,
  saveRefreshToken: async () => {},
  clearRefreshToken: async () => {},
}));

const { api } = await import('../api/api.js');

const CART = {
  cart: {
    items: [
      { id: 'l1', productId: 'p_tomato', quantity: '0.500', lineTotalPaise: '2000' },
      { id: 'l2', productId: 'p_onion', quantity: '0.500', lineTotalPaise: '1500' },
    ],
    subtotalPaise: '3500',
    totalPaise: '3500',
  },
};

async function storeWithCart() {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer, auth: () => ({ accessToken: 'acc_1' }) },
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }).concat(api.middleware),
  });
  await store.dispatch(api.util.upsertQueryData('getCart', undefined, CART));
  return store;
}
const lines = (store) =>
  api.endpoints.getCart
    .select()(store.getState())
    .data.cart.items.map((i) => i.id);

afterEach(() => vi.unstubAllGlobals());

describe('removing a basket line', () => {
  it('takes it out at once, before the server answers', async () => {
    let answer;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((res) => (answer = res))),
    );
    const store = await storeWithCart();
    const p = store.dispatch(api.endpoints.removeCartItem.initiate('l1'));
    await Promise.resolve();
    expect(lines(store)).toEqual(['l2']); // gone while the request is still on its way
    answer({
      status: 200,
      ok: true,
      headers: new Headers(),
      json: async () => ({ ok: true }),
      text: async () => '{}',
    });
    await p;
  });

  it('puts it back if the server refuses', async () => {
    const ok = (body) => ({
      status: 200,
      ok: true,
      headers: new Headers(),
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opts) =>
        (opts?.method || 'GET') === 'DELETE'
          ? {
              status: 500,
              ok: false,
              headers: new Headers(),
              json: async () => ({ error: { code: 'INTERNAL' } }),
              text: async () => '{}',
            }
          : ok(CART),
      ),
    );
    const store = await storeWithCart();
    // The basket screen is open: it holds a subscription, so the cart stays cached and refreshes.
    const sub = store.dispatch(api.endpoints.getCart.initiate(undefined));
    await sub;
    await store.dispatch(api.endpoints.removeCartItem.initiate('l1'));
    await new Promise((r) => setTimeout(r, 0));
    expect(lines(store)).toEqual(['l1', 'l2']);
    sub.unsubscribe();
  });
});
