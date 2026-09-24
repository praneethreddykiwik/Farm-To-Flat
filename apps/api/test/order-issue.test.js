/**
 * "Something in this bag is wrong."
 *
 * A photograph taken at the door is the only evidence either side will ever have, so what matters
 * is that a report can only be filed against your OWN delivered order, that it is never silently
 * lost, and that answering one does not rewrite what the customer said.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { getOrder } = await import('../src/store.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let seq = 0;

async function deliveredOrder(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  const { body: c } = await request(app).get('/api/v1/communities');
  const com = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set(auth(token))
    .send({ communityId: com.id, block: com.blocks[0], flat: '303', floor: '3' });
  const { body: cat } = await request(app).get('/api/v1/admin/products');
  const avail = cat.products.filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE');
  const start = (seq++ * 5) % avail.length;
  for (let n = 0; n < avail.length; n += 1) {
    const p = avail[(start + n) % avail.length];
    if (
      (
        await request(app)
          .put('/api/v1/cart/items')
          .set(auth(token))
          .send({ productId: p.id, quantity: 4 })
      ).status >= 400
    )
      continue;
    const { body: cart } = await request(app).get('/api/v1/cart').set(auth(token));
    if (cart.cart.meetsMinimum && cart.cart.items.length >= 4) break;
  }
  const w = await request(app)
    .get(`/api/v1/delivery-windows?addressId=${a.body.address.id}`)
    .set(auth(token));
  const slot = w.body.windows.find((x) => x.isOpen);
  const r = await request(app)
    .post('/api/v1/orders')
    .set(auth(token))
    .send({ addressId: a.body.address.id, deliveryDate: slot.date, window: slot.window });
  const id = r.body.order.id;
  if (r.body.paymentIntent)
    await request(app)
      .post('/api/v1/payments/verify')
      .set(auth(token))
      .send({ paymentId: r.body.paymentIntent.paymentId, success: true });
  return { token, id, order: r.body.order };
}

const advance = (id, status) =>
  request(app).patch(`/api/v1/admin/orders/${id}/status`).send({ status });

async function deliver(id) {
  await advance(id, 'PACKING');
  await advance(id, 'OUT_FOR_DELIVERY');
  const otp = getOrder(id).deliveryOtp;
  await request(app).post(`/api/v1/admin/orders/${id}/deliver`).send({ otp });
}

describe('reporting a problem with a delivery', () => {
  it('is refused before the order has actually been delivered', async () => {
    const { token, id } = await deliveredOrder('9244000001');
    const r = await request(app)
      .post(`/api/v1/orders/${id}/issue`)
      .set(auth(token))
      .send({ reason: 'DAMAGED', note: 'squashed' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('NOT_DELIVERED');
  });

  it('accepts a written report and hands it to the operator', async () => {
    const { token, id } = await deliveredOrder('9244000002');
    await deliver(id);
    const r = await request(app)
      .post(`/api/v1/orders/${id}/issue`)
      .set(auth(token))
      .send({ reason: 'QUALITY', note: 'the spinach was wilted' });
    expect(r.status).toBe(201);
    expect(r.body.issue.reason).toBe('QUALITY');
    expect(r.body.issue.status).toBe('OPEN');

    const ops = await request(app).get(`/api/v1/admin/orders/${id}`);
    expect(ops.body.order.issues).toHaveLength(1);
    expect(ops.body.order.issues[0].note).toBe('the spinach was wilted');
  });

  it('refuses an empty report — a complaint with nothing in it cannot be judged', async () => {
    const { token, id } = await deliveredOrder('9244000003');
    await deliver(id);
    const r = await request(app).post(`/api/v1/orders/${id}/issue`).set(auth(token)).send({});
    expect(r.status).toBe(422);
  });

  it('cannot be filed against somebody else’s order', async () => {
    const { id } = await deliveredOrder('9244000004');
    await deliver(id);
    const other = await deliveredOrder('9244000005');
    const r = await request(app)
      .post(`/api/v1/orders/${id}/issue`)
      .set(auth(other.token))
      .send({ note: 'not mine' });
    expect(r.status).toBe(404);
  });

  it('keeps every report — a second one does not replace the first', async () => {
    const { token, id } = await deliveredOrder('9244000006');
    await deliver(id);
    await request(app).post(`/api/v1/orders/${id}/issue`).set(auth(token)).send({ note: 'one' });
    await request(app).post(`/api/v1/orders/${id}/issue`).set(auth(token)).send({ note: 'two' });
    const mine = await request(app).get(`/api/v1/orders/${id}`).set(auth(token));
    expect(mine.body.order.issues.map((i) => i.note)).toEqual(['one', 'two']);
  });

  it('the operator answers it without rewriting what the customer said', async () => {
    const { token, id } = await deliveredOrder('9244000007');
    await deliver(id);
    const filed = await request(app)
      .post(`/api/v1/orders/${id}/issue`)
      .set(auth(token))
      .send({ reason: 'MISSING', note: 'no coriander in the bag' });
    const issueId = filed.body.issue.id;

    const done = await request(app)
      .post(`/api/v1/admin/orders/${id}/issues/${issueId}`)
      .send({ status: 'RESOLVED', resolution: 'Refunded ₹20 to wallet' });
    expect(done.status).toBe(200);
    expect(done.body.issue.status).toBe('RESOLVED');
    expect(done.body.issue.resolvedAt).toBeTruthy();
    // The customer's own words and photos are untouched.
    expect(done.body.issue.note).toBe('no coriander in the bag');
    expect(done.body.issue.reason).toBe('MISSING');

    const mine = await request(app).get(`/api/v1/orders/${id}`).set(auth(token));
    expect(mine.body.order.issues[0].resolution).toBe('Refunded ₹20 to wallet');
  });

  it('answering a report that does not exist is a 404, not a silent success', async () => {
    const { id } = await deliveredOrder('9244000008');
    await deliver(id);
    const r = await request(app)
      .post(`/api/v1/admin/orders/${id}/issues/iss_nope`)
      .send({ status: 'RESOLVED' });
    expect(r.status).toBe(404);
  });

  it('rejects a photo that is not an image type we accept', async () => {
    const { token, id } = await deliveredOrder('9244000009');
    await deliver(id);
    const r = await request(app)
      .post(`/api/v1/orders/${id}/issue`)
      .set(auth(token))
      .send({ photos: [{ contentType: 'application/pdf', dataBase64: 'AAAA' }] });
    // Validation refuses it before any bytes reach storage — the bucket is public, so an
    // unchecked upload endpoint is how it becomes someone else's file host.
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('VALIDATION');
  });
});
