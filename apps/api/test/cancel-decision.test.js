/**
 * A cancellation request on an order that has already been delivered is settled, not pending.
 * The Fulfilment board used to keep offering Approve on those, and approving one would have
 * refunded goods the customer was already holding.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { patchOrder, getOrder } = await import('../src/store.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function placedOrder(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  const { body: c } = await request(app).get('/api/v1/communities');
  const community = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set(auth(token))
    .send({ communityId: community.id, block: community.blocks[0], flat: '901', floor: '9' });
  const { body: cat } = await request(app).get('/api/v1/admin/products');
  for (const p of cat.products
    .filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE')
    .slice(0, 6)) {
    await request(app)
      .put('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: p.id, quantity: 6 });
  }
  const w = await request(app)
    .get(`/api/v1/delivery-windows?addressId=${a.body.address.id}`)
    .set(auth(token));
  const win = w.body.windows.find((x) => x.isOpen);
  const r = await request(app)
    .post('/api/v1/orders')
    .set(auth(token))
    .send({ addressId: a.body.address.id, deliveryDate: win.date, window: win.window });
  expect(r.status).toBe(201);
  if (r.body.paymentIntent)
    await request(app)
      .post('/api/v1/payments/verify')
      .set(auth(token))
      .send({ paymentId: r.body.paymentIntent.paymentId, success: true });
  return { token, id: r.body.order.id };
}

const advance = (id, status) =>
  request(app).patch(`/api/v1/admin/orders/${id}/status`).send({ status });

describe('cancellation decisions', () => {
  it('refuses to approve a cancellation on an order that has already been delivered', async () => {
    const { id } = await placedOrder('9222000801');
    await advance(id, 'PACKING');
    await advance(id, 'OUT_FOR_DELIVERY');
    // Delivery now needs the proof taken at the door, so it no longer goes through the plain status
    // PATCH. The code is the customer's to read out — the test reads it from the store directly.
    const otp = getOrder(id).deliveryOtp;
    const done = await request(app).post(`/api/v1/admin/orders/${id}/deliver`).send({ otp });
    expect(done.status).toBe(200);
    expect(done.body.order.status).toBe('DELIVERED');
    // No route raises a request any more (the customer either cancels outright or is refused), but
    // orders carrying one from before that change are still in the database — this is that row.
    patchOrder(id, (ord) => {
      ord.cancelRequested = true;
    });

    const decided = await request(app)
      .post(`/api/v1/admin/orders/${id}/cancel-decision`)
      .send({ decision: 'APPROVE' });
    expect(decided.status).toBe(409);
    expect(decided.body.error.code).toBe('CANNOT_CANCEL');
  });
});
