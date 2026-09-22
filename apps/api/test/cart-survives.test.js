/**
 * A basket must survive every way an unpaid checkout can die.
 *
 * The tester's report: "cancelling order at middle of payment ... must stay on cart if the payment
 * failed but in application our cart is being empty". Placing an order clears the cart, so every
 * path that kills an order BEFORE it was paid for has to hand the basket back:
 *   1. the customer taps "cancel" in the payment sheet  → /payments/verify success:false
 *   2. the customer cancels the PENDING_PAYMENT order   → /orders/:id/cancel
 *   3. the customer walks away and the order times out  → expirePendingOrders()
 * Only (1) was covered before; (2) and (3) left the customer to re-shop from scratch.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { expirePendingOrders } = await import('../src/lib/order-lifecycle.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function readyToOrder(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  const { body: c } = await request(app).get('/api/v1/communities');
  const community = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set(auth(token))
    .send({ communityId: community.id, block: community.blocks[0], flat: '702', floor: '7' });
  const { body } = await request(app).get('/api/v1/admin/products');
  const picked = body.products
    .filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE')
    .slice(0, 4);
  for (const p of picked) {
    await request(app)
      .put('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: p.id, quantity: 6 });
  }
  const w = await request(app)
    .get(`/api/v1/delivery-windows?addressId=${a.body.address.id}`)
    .set(auth(token));
  return { token, addressId: a.body.address.id, win: w.body.windows.find((x) => x.isOpen) };
}

const place = async (ctx) => {
  const r = await request(app).post('/api/v1/orders').set(auth(ctx.token)).send({
    addressId: ctx.addressId,
    deliveryDate: ctx.win.date,
    window: ctx.win.window,
    useWallet: false,
  });
  expect(r.status).toBe(201);
  return r.body;
};
const cartSize = async (token) => {
  const r = await request(app).get('/api/v1/cart').set(auth(token));
  return (r.body.cart?.items || []).length;
};

describe('an unpaid basket comes back', () => {
  it('cancelling the PENDING_PAYMENT order puts the items back in the cart', async () => {
    const ctx = await readyToOrder('9223000001');
    const before = await cartSize(ctx.token);
    expect(before).toBeGreaterThan(0);
    const { order } = await place(ctx);
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(await cartSize(ctx.token)).toBe(0); // placing an order empties the basket

    const r = await request(app)
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set(auth(ctx.token))
      .send({});
    expect(r.status).toBe(200);
    expect(await cartSize(ctx.token)).toBe(before);
  });

  it('a checkout the customer walked away from times out and returns the basket', async () => {
    const ctx = await readyToOrder('9223000002');
    const before = await cartSize(ctx.token);
    const { order } = await place(ctx);
    expect(await cartSize(ctx.token)).toBe(0);

    // Well past ORDER_RELEASE_MINUTES: the sweeper runs and the order is abandoned.
    expirePendingOrders({ now: Date.now() + 10 * 60 * 60 * 1000 });

    const o = await request(app).get(`/api/v1/orders/${order.id}`).set(auth(ctx.token));
    expect(o.body.order.status).toBe('PAYMENT_FAILED');
    expect(await cartSize(ctx.token)).toBe(before);
  });

  it('a basket built since the abandoned order is never clobbered', async () => {
    const ctx = await readyToOrder('9223000003');
    const { order } = await place(ctx);
    // The customer starts shopping again before the sweeper catches up.
    const { body } = await request(app).get('/api/v1/admin/products');
    const p = body.products.filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE')[0];
    await request(app)
      .put('/api/v1/cart/items')
      .set(auth(ctx.token))
      .send({ productId: p.id, quantity: 2 });
    expect(await cartSize(ctx.token)).toBe(1);

    expirePendingOrders({ now: Date.now() + 10 * 60 * 60 * 1000 });
    const o = await request(app).get(`/api/v1/orders/${order.id}`).set(auth(ctx.token));
    expect(o.body.order.status).toBe('PAYMENT_FAILED');
    // Still the one item they just added — the dead order is not merged in on top of it.
    expect(await cartSize(ctx.token)).toBe(1);
  });
});
