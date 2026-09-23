/**
 * The basket must outlive the server process.
 *
 * Carts used to live only in a Map, so every restart — and on Render's free plan every overnight
 * idle spin-down — silently emptied the basket of everyone who had not yet checked out. These pin
 * the write-through and the boot-time rehydration that fix it.
 */
import { describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';

describe('basket survives a restart', () => {
  it('writes the basket through on every mutation', async () => {
    vi.resetModules();
    const saves = [];
    vi.doMock('../src/persistence.js', async (orig) => {
      const real = await orig();
      return {
        ...real,
        persist: { ...real.persist, cartSave: (cid, c) => saves.push([cid, structuredClone(c)]) },
      };
    });
    const store = await import('../src/customer-store.js');
    const { listProducts } = await import('../src/store.js');
    const p = listProducts().find((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE');

    store.setCartItem('cus_persist_1', { productId: p.id, quantity: 2 });
    expect(saves.at(-1)[0]).toBe('cus_persist_1');
    expect(saves.at(-1)[1].items).toHaveLength(1);

    store.setCartCoupon('cus_persist_1', 'SAVE10');
    expect(saves.at(-1)[1].couponCode).toBe('SAVE10');

    store.clearCart('cus_persist_1');
    expect(saves.at(-1)[1].items).toHaveLength(0);
    vi.doUnmock('../src/persistence.js');
  });

  it('rehydrates saved baskets at boot', async () => {
    vi.resetModules();
    const store = await import('../src/customer-store.js');
    store.hydrateCustomerData({
      customers: [],
      addresses: [],
      sessions: [],
      devices: [],
      redemptions: [],
      payments: [],
      carts: [
        {
          customerId: 'cus_restart',
          items: [{ id: 'ci_1', productId: 'p_spinach', quantity: 3, note: null }],
          couponCode: 'WELCOME',
        },
      ],
    });
    const c = store.rawCart('cus_restart');
    expect(c.items).toHaveLength(1);
    expect(c.items[0].productId).toBe('p_spinach');
    expect(c.couponCode).toBe('WELCOME');
  });

  it('tolerates a boot with no saved baskets at all', async () => {
    vi.resetModules();
    const store = await import('../src/customer-store.js');
    store.hydrateCustomerData({
      customers: [],
      addresses: [],
      sessions: [],
      devices: [],
      redemptions: [],
      payments: [],
    });
    expect(store.rawCart('cus_nobody').items).toEqual([]);
  });
});
