/**
 * The public coupon list must tell a signed-in shopper which codes they have already spent.
 * A tester tapped "Apply" on a used offer, got a silent 409, and reported the button as dead.
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
    .send({ communityId: community.id, block: community.blocks[0], flat: '404', floor: '4' });
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

const listed = async (code, token) => {
  const r = token
    ? await request(app).get('/api/v1/coupons').set(auth(token))
    : await request(app).get('/api/v1/coupons');
  expect(r.status).toBe(200);
  return r.body.coupons.find((c) => c.code === code);
};

describe('GET /coupons', () => {
  it('flags a coupon the caller has already redeemed, and still answers a signed-out browser', async () => {
    const code = 'USEDONCE1';
    const created = await request(app)
      .post('/api/v1/admin/coupons')
      .send({ code, label: 'used once', type: 'PERCENT', percentOff: 10 });
    expect(created.status).toBe(201);

    const ctx = await ready('9333000101');
    expect((await listed(code, ctx.token)).alreadyUsed).toBe(false);

    await request(app).post('/api/v1/cart/coupon').set(auth(ctx.token)).send({ code });
    const placed = await request(app)
      .post('/api/v1/orders')
      .set(auth(ctx.token))
      .send({ addressId: ctx.addressId, deliveryDate: ctx.win.date, window: ctx.win.window });
    expect(placed.status).toBe(201);

    // now spent for this account — the row must arrive locked rather than fail on tap
    expect((await listed(code, ctx.token)).alreadyUsed).toBe(true);

    // a different shopper, and an anonymous one, still see it as available
    const other = await ready('9333000102');
    expect((await listed(code, other.token)).alreadyUsed).toBe(false);
    expect((await listed(code, null)).alreadyUsed).toBe(false);
  });
});
