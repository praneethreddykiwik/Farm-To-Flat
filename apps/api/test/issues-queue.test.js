/**
 * The complaints queue.
 *
 * A complaint used to be reachable only from inside the order it sat on, so finding one meant
 * already knowing which order to open, or catching the push as it arrived. A complaint nobody can
 * find is a complaint nobody answers — so what matters here is that every report shows up in one
 * list, carries enough of the delivery to act on, and leaves that list once it has been answered.
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
    .send({ communityId: com.id, block: com.blocks[0], flat: '404', floor: '4' });
  const { body: cat } = await request(app).get('/api/v1/admin/products');
  const avail = cat.products.filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE');
  const start = (seq++ * 5) % avail.length;
  for (let n = 0; n < avail.length; n += 1) {
    const p = avail[(start + n) % avail.length];
    const put = await request(app)
      .put('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: p.id, quantity: 4 });
    if (put.status >= 400) continue;
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
  // Straight to delivered — a complaint is only possible after the bag arrives.
  await request(app).patch(`/api/v1/admin/orders/${id}/status`).send({ status: 'PACKING' });
  await request(app)
    .patch(`/api/v1/admin/orders/${id}/status`)
    .send({ status: 'OUT_FOR_DELIVERY' });
  await request(app)
    .post(`/api/v1/admin/orders/${id}/deliver`)
    .send({ otp: getOrder(id).deliveryOtp });
  return { token, id, orderNumber: r.body.order.orderNumber };
}

const queue = (qs = '') => request(app).get(`/api/v1/admin/issues${qs}`);

describe('the complaints queue', () => {
  it('surfaces a complaint without anyone knowing which order it was on', async () => {
    const { token, id, orderNumber } = await deliveredOrder('9255000001');
    await request(app)
      .post(`/api/v1/orders/${id}/issue`)
      .set(auth(token))
      .send({ reason: 'DAMAGED', note: 'the tomatoes were crushed' });

    const r = await queue('?status=OPEN');
    expect(r.status).toBe(200);
    const mine = r.body.issues.find((i) => i.order?.id === id);
    expect(mine).toBeTruthy();
    expect(mine.note).toBe('the tomatoes were crushed');
    expect(mine.reason).toBe('DAMAGED');
    expect(mine.status).toBe('OPEN');
    // Enough of the delivery to act on it without opening the order first — that is the point.
    expect(mine.order).toMatchObject({ orderNumber });
    expect(mine.order.community).toBeTruthy();
    expect(mine.order.flat).toBe('404');
  });

  it('counts what is still unanswered, and stops counting once it is answered', async () => {
    const { token, id } = await deliveredOrder('9255000002');
    const before = (await queue()).body.openCount;

    await request(app)
      .post(`/api/v1/orders/${id}/issue`)
      .set(auth(token))
      .send({ reason: 'MISSING', note: 'no coriander in the bag' });
    const after = (await queue()).body.openCount;
    expect(after).toBe(before + 1);

    const open = (await queue('?status=OPEN')).body.issues.find((i) => i.order?.id === id);
    const decided = await request(app)
      .post(`/api/v1/admin/orders/${id}/issues/${open.id}`)
      .send({ status: 'RESOLVED', resolution: 'refunded the coriander' });
    expect(decided.status).toBe(200);

    expect((await queue()).body.openCount).toBe(before);
    // Gone from the open queue, but not gone: still there under its decision.
    expect((await queue('?status=OPEN')).body.issues.find((i) => i.order?.id === id)).toBeFalsy();
    const resolved = (await queue('?status=RESOLVED')).body.issues.find((i) => i.order?.id === id);
    expect(resolved).toMatchObject({ status: 'RESOLVED', resolution: 'refunded the coriander' });
    // The operator's answer must never have rewritten what the customer said.
    expect(resolved.note).toBe('no coriander in the bag');
  });

  it('serves the newest complaint first, because that is the one nobody has seen', async () => {
    const a = await deliveredOrder('9255000003');
    await request(app)
      .post(`/api/v1/orders/${a.id}/issue`)
      .set(auth(a.token))
      .send({ reason: 'QUALITY', note: 'older report' });
    await new Promise((r) => setTimeout(r, 5));
    const b = await deliveredOrder('9255000004');
    await request(app)
      .post(`/api/v1/orders/${b.id}/issue`)
      .set(auth(b.token))
      .send({ reason: 'QUALITY', note: 'newer report' });

    const issues = (await queue('?status=OPEN')).body.issues;
    const iA = issues.findIndex((i) => i.order?.id === a.id);
    const iB = issues.findIndex((i) => i.order?.id === b.id);
    expect(iB).toBeLessThan(iA);
  });

  it('does not leak internal fields — the queue is a whitelist, not a passthrough', async () => {
    const { token, id } = await deliveredOrder('9255000005');
    await request(app)
      .post(`/api/v1/orders/${id}/issue`)
      .set(auth(token))
      .send({ reason: 'OTHER', note: 'something else' });
    const mine = (await queue('?status=OPEN')).body.issues.find((i) => i.order?.id === id);
    expect(Object.keys(mine).sort()).toEqual(
      [
        'createdAt',
        'id',
        'note',
        'order',
        'photos',
        'reason',
        'resolution',
        'resolvedAt',
        'status',
      ].sort(),
    );
  });
});
