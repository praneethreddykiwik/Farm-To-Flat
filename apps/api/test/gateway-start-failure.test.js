/**
 * Review #3 (21 Nov 2026): when the gateway refuses to open a payment, the order is undone at once —
 * basket back, nothing held — and the customer is told no money was taken.
 */
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
vi.mock('../src/lib/razorpay.js', async (importOriginal) => ({
  ...(await importOriginal()),
  razorpayEnabled: true,
  razorpayKeyId: 'rzp_test_fake',
  createRazorpayOrder: async () => {
    throw Object.assign(new Error('gateway down'), { status: 502, code: 'RAZORPAY_ORDER_FAILED' });
  },
}));

const { app } = await import('../src/index.js');
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
    .send({ communityId: community.id, block: community.blocks[0], flat: '909', floor: '9' });
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

describe('gateway refuses to start a payment', () => {
  it('answers with a clear error and puts the basket back; no order is left waiting', async () => {
    const ctx = await ready('9666000031');
    const before = await request(app).get('/api/v1/cart').set(auth(ctx.token));
    const r = await request(app).post('/api/v1/orders').set(auth(ctx.token)).send({
      idempotencyKey: 'gw-fail-0001',
      addressId: ctx.addressId,
      deliveryDate: ctx.win.date,
      window: ctx.win.window,
    });
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('PAYMENT_START_FAILED');
    const cart = await request(app).get('/api/v1/cart').set(auth(ctx.token));
    expect(cart.body.cart.items.length).toBe(before.body.cart.items.length);
    const orders = await request(app).get('/api/v1/orders').set(auth(ctx.token));
    expect(orders.body.orders.filter((o) => o.status === 'PENDING_PAYMENT')).toHaveLength(0);
  });
});
