/**
 * A retried order with the same idempotencyKey replays the original response (never CART_EMPTY,
 * never a second order); abandoned PENDING_PAYMENT orders expire and return the money.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { expirePendingOrders } = await import('../src/lib/order-lifecycle.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
async function ready(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  const { body: c } = await request(app).get('/api/v1/communities');
  const community = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set(auth(token))
    .send({ communityId: community.id, block: community.blocks[0], flat: '808', floor: '8' });
  const { body } = await request(app).get('/api/v1/admin/products');
  for (const p of body.products
    .filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE')
    .slice(0, 6))
    await request(app)
      .put('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: p.id, quantity: 6 });
  const w = await request(app)
    .get(`/api/v1/delivery-windows?addressId=${a.body.address.id}`)
    .set(auth(token));
  return { token, addressId: a.body.address.id, win: w.body.windows.find((x) => x.isOpen) };
}
const place = (ctx, key) =>
  request(app).post('/api/v1/orders').set(auth(ctx.token)).send({
    idempotencyKey: key,
    addressId: ctx.addressId,
    deliveryDate: ctx.win.date,
    window: ctx.win.window,
  });

describe('order idempotency + abandonment', () => {
  it('same key twice → same 201 body, one order', async () => {
    const ctx = await ready('9666000001');
    const key = 'idem-test-key-0001';
    const first = await place(ctx, key);
    expect(first.status).toBe(201);
    const second = await place(ctx, key); // cart is empty now — must NOT be 422
    expect(second.status).toBe(201);
    expect(second.body.order.id).toBe(first.body.order.id);
    expect(second.body.paymentIntent?.paymentId).toBe(first.body.paymentIntent?.paymentId);
    const list = await request(app).get('/api/v1/orders').set(auth(ctx.token));
    expect(list.body.orders.filter((o) => o.id === first.body.order.id).length).toBe(1);
    expect(list.body.orders.length).toBe(1);
    // a DIFFERENT key with an empty cart is still refused (no accidental duplicates)
    const third = await place(ctx, 'idem-test-key-0002');
    expect(third.status).toBe(422);
    expect(third.body.error.code).toBe('CART_EMPTY');
  });

  it('a PENDING_PAYMENT order older than the release window becomes PAYMENT_FAILED and frees its slot', async () => {
    const ctx = await ready('9666000002');
    const r = await place(ctx, 'idem-test-key-0003');
    expect(r.body.order.status).toBe('PENDING_PAYMENT');
    const winBefore = (
      await request(app)
        .get(`/api/v1/delivery-windows?addressId=${ctx.addressId}`)
        .set(auth(ctx.token))
    ).body.windows.find((w) => w.id === ctx.win.id);
    expect(expirePendingOrders({ now: Date.now() + 31 * 60 * 1000 })).toBeGreaterThanOrEqual(1);
    const after = await request(app).get(`/api/v1/orders/${r.body.order.id}`).set(auth(ctx.token));
    expect(after.body.order.status).toBe('PAYMENT_FAILED');
    const winAfter = (
      await request(app)
        .get(`/api/v1/delivery-windows?addressId=${ctx.addressId}`)
        .set(auth(ctx.token))
    ).body.windows.find((w) => w.id === ctx.win.id);
    expect(winAfter.booked).toBeLessThan(winBefore.booked); // this order's slot is free again
    // running it again changes nothing
    expect(expirePendingOrders({ now: Date.now() + 31 * 60 * 1000 })).toBe(0);
  });
});
