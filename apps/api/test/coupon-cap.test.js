/**
 * A coupon's globalCap must actually cap redemptions, count down on the live record, and give the
 * slot back when the order that used it is cancelled.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
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
    .send({ communityId: community.id, block: community.blocks[0], flat: '303', floor: '3' });
  const { body } = await request(app).get('/api/v1/admin/products');
  for (const p of body.products
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
  return { token, addressId: a.body.address.id, win: w.body.windows.find((x) => x.isOpen) };
}
const order = (ctx) =>
  request(app)
    .post('/api/v1/orders')
    .set(auth(ctx.token))
    .send({ addressId: ctx.addressId, deliveryDate: ctx.win.date, window: ctx.win.window });
const couponRow = async (code) => {
  const { body } = await request(app).get('/api/v1/admin/coupons');
  return body.coupons.find((c) => c.code === code);
};

describe('coupon globalCap', () => {
  it('cap of 1: two concurrent orders → one wins, the other is COUPON_CAP_REACHED; cancel frees the slot', async () => {
    const code = 'CAPTEST1';
    const created = await request(app)
      .post('/api/v1/admin/coupons')
      .send({ code, label: 'cap test', type: 'PERCENT', percentOff: 10, globalCap: 1 });
    expect(created.status).toBe(201);

    const a = await ready('9333000001');
    const b = await ready('9333000002');
    for (const ctx of [a, b]) {
      const r = await request(app).post('/api/v1/cart/coupon').set(auth(ctx.token)).send({ code });
      expect(r.status).toBe(200);
    }
    const [ra, rb] = await Promise.all([order(a), order(b)]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = ra.status === 409 ? ra : rb;
    const winner = ra.status === 201 ? ra : rb;
    expect(loser.body.error.code).toBe('COUPON_CAP_REACHED');
    expect((await couponRow(code)).redeemedCount).toBe(1);

    // the winner cancels → the redemption is released and the cap has room again
    await request(app)
      .post(`/api/v1/orders/${winner.body.order.id}/cancel`)
      .set(auth(winner === ra ? a.token : b.token))
      .send({});
    expect((await couponRow(code)).redeemedCount).toBe(0);
    const loserCtx = loser === ra ? a : b;
    const again = await request(app)
      .post('/api/v1/cart/coupon')
      .set(auth(loserCtx.token))
      .send({ code });
    expect(again.status).toBe(200);
    const placed = await order(loserCtx);
    expect(placed.status).toBe(201);
    expect((await couponRow(code)).redeemedCount).toBe(1);
  });
});
