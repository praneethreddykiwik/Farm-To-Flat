/**
 * Product availability — AVAILABLE / SOLD_OUT / HIDDEN, and how each affects the public catalog
 * and the cart.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

let token;
beforeAll(async () => {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile: '9123456780' });
  const r = await request(app)
    .post('/api/v1/auth/otp/verify')
    .send({ mobile: '9123456780', otp: '123456' });
  token = r.body.accessToken;
});
const auth = () => ({ Authorization: `Bearer ${token}` });
const inCatalog = async (id) =>
  (await request(app).get('/api/v1/catalog')).body.products.some((p) => p.id === id);

describe('availability', () => {
  it('defaults to AVAILABLE and can be ordered', async () => {
    const r = await request(app).get('/api/v1/admin/products');
    expect(r.body.products.every((p) => p.availability)).toBe(true);
    const add = await request(app)
      .put('/api/v1/cart/items')
      .set(auth())
      .send({ productId: 'p_onion', quantity: 0.5 });
    expect(add.status).toBe(200);
  });

  it('SOLD_OUT stays in the catalog but blocks the cart', async () => {
    await request(app).patch('/api/v1/admin/products/p_okra').send({ availability: 'SOLD_OUT' });
    expect(await inCatalog('p_okra')).toBe(true);
    const add = await request(app)
      .put('/api/v1/cart/items')
      .set(auth())
      .send({ productId: 'p_okra', quantity: 0.5 });
    expect(add.status).toBe(409);
    expect(add.body.error.code).toBe('UNAVAILABLE');
  });

  it('HIDDEN removes it from the public catalog (isActive false)', async () => {
    const r = await request(app)
      .patch('/api/v1/admin/products/p_okra')
      .send({ availability: 'HIDDEN' });
    expect(r.body.product.isActive).toBe(false);
    expect(await inCatalog('p_okra')).toBe(false);
  });

  it('restores to AVAILABLE', async () => {
    const r = await request(app)
      .patch('/api/v1/admin/products/p_okra')
      .send({ availability: 'AVAILABLE' });
    expect(r.body.product.isActive).toBe(true);
    expect(await inCatalog('p_okra')).toBe(true);
  });
});
