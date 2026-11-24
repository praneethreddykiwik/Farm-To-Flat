/**
 * POST /cart/quote: the price of a list of items, fees and tax included, for the Dynamic Island's
 * "Confirm tomorrow's order" card. It must agree with the bill checkout charges, and must never
 * touch the basket.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { updatePaymentSettings } = await import('../src/store.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let token;
let items;

const quote = (body, t = token) => request(app).post('/api/v1/cart/quote').set(auth(t)).send(body);

beforeAll(async () => {
  const mobile = '9224155001';
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  token = v.body.accessToken;
  const { body } = await request(app).get('/api/v1/catalog');
  items = body.products
    .filter((p) => (p.availability || 'AVAILABLE') === 'AVAILABLE')
    .slice(0, 4)
    .map((p) => ({ productId: p.id, quantity: String(p.increment) }));
});

describe('POST /cart/quote', () => {
  it('needs a signed-in customer', async () => {
    const r = await request(app).post('/api/v1/cart/quote').send({ items });
    expect(r.status).toBe(401);
  });

  it('is the basket’s own bill for the same items, and leaves the basket as it was', async () => {
    const before = await request(app).get('/api/v1/cart').set(auth(token));
    expect(before.body.cart.items).toEqual([]);
    const q = await quote({ items });
    expect(q.status).toBe(200);
    const after = await request(app).get('/api/v1/cart').set(auth(token));
    expect(after.body.cart.items).toEqual([]);

    for (const it of items)
      expect((await request(app).put('/api/v1/cart/items').set(auth(token)).send(it)).status).toBe(
        200,
      );
    const { body } = await request(app).get('/api/v1/cart').set(auth(token));
    for (const k of ['subtotalPaise', 'totalPaise', 'taxPaise', 'meetsMinimum'])
      expect(q.body.quote[k]).toEqual(body.cart[k]);
    expect(q.body.quote.itemCount).toBe(items.length);

    // With things in the basket, a quote for something else neither counts nor changes them.
    const one = await quote({ items: [items[0]] });
    expect(one.body.quote.itemCount).toBe(1);
    const still = await request(app).get('/api/v1/cart').set(auth(token));
    expect(still.body.cart).toEqual(body.cart);
  });

  it('names a product that is no longer sold instead of failing or hiding it', async () => {
    const q = await quote({ items: [items[0], { productId: 'p_gone', quantity: '1' }] });
    expect(q.status).toBe(200);
    expect(q.body.quote.missing).toEqual(['p_gone']);
    expect(q.body.quote.itemCount).toBe(1);
  });

  it('follows the live cash-on-delivery setting and limit', async () => {
    updatePaymentSettings({ codEnabled: false });
    expect((await quote({ items })).body.quote.codAllowed).toBe(false);
    updatePaymentSettings({ codEnabled: true, codMaxOrderPaise: 100000000 });
    expect((await quote({ items })).body.quote.codAllowed).toBe(true);
    updatePaymentSettings({ codMaxOrderPaise: 1 });
    expect((await quote({ items })).body.quote.codAllowed).toBe(false);
    updatePaymentSettings({ codEnabled: false, codMaxOrderPaise: 300000 });
  });

  it('refuses nonsense', async () => {
    for (const body of [
      {},
      { items: [] },
      { items: [{ productId: 'x', quantity: '-1' }] },
      { items: [{ productId: 'x', quantity: '0' }] },
      { items: [{ productId: 'x', quantity: 'NaN' }] },
      { items: [{ productId: '', quantity: '1' }] },
      { items: Array.from({ length: 61 }, () => ({ productId: 'x', quantity: '1' })) },
    ])
      expect((await quote(body)).status).toBe(422);
  });
});
