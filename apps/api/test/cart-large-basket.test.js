/**
 * A big basket. The owner's requirement: fifty items and more go in without trouble, and stay
 * quick. This fills the basket with as many different products as the catalogue has available (at
 * least fifty), checks every one is there and priced, and that a change to one line late on costs
 * no more than it did at the start.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let token;
let products;

const put = (productId, quantity) =>
  request(app).put('/api/v1/cart/items').set(auth(token)).send({ productId, quantity });

beforeAll(async () => {
  const mobile = '9224155077';
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  token = v.body.accessToken;
  const { body } = await request(app).get('/api/v1/catalog');
  products = body.products.filter((p) => (p.availability || 'AVAILABLE') === 'AVAILABLE');
});

describe('a basket of fifty and more', () => {
  it('takes every available product, at least fifty of them', async () => {
    expect(products.length).toBeGreaterThanOrEqual(50);
    const times = [];
    for (const p of products) {
      const t0 = performance.now();
      const r = await put(p.id, String(p.increment));
      times.push(performance.now() - t0);
      expect(r.status).toBe(200);
    }
    const { body } = await request(app).get('/api/v1/cart').set(auth(token));
    expect(body.cart.items.length).toBe(products.length);
    const sum = body.cart.items.reduce((s, i) => s + Number(i.lineTotalPaise), 0);
    expect(Number(body.cart.subtotalPaise)).toBe(sum);

    // The last ten adds are not slower than the first ten by more than a generous margin.
    const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const first = avg(times.slice(0, 10));
    const last = avg(times.slice(-10));
    expect(last).toBeLessThan(Math.max(first * 4, 40));
  });

  it('changes and removes one line in a full basket', async () => {
    const p = products[products.length - 1];
    const up = await put(p.id, String(Number(p.increment) * 2));
    expect(up.status).toBe(200);
    const line = up.body.cart.items.find((i) => i.productId === p.id);
    expect(Number(line.quantity)).toBe(Number(p.increment) * 2);
    const gone = await put(p.id, '0');
    expect(gone.status).toBe(200);
    expect(gone.body.cart.items.length).toBe(products.length - 1);
  });
});
