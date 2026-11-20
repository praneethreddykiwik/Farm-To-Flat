/**
 * Review #10 (21 Nov 2026): checkout refuses an order for a community the operator switched off.
 * The address was saved while the community was live; the order must not be taken afterwards.
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
  return {
    token,
    communityId: community.id,
    addressId: a.body.address.id,
    win: w.body.windows.find((x) => x.isOpen),
  };
}
const place = (ctx) =>
  request(app).post('/api/v1/orders').set(auth(ctx.token)).send({
    addressId: ctx.addressId,
    deliveryDate: ctx.win.date,
    window: ctx.win.window,
  });

describe('checkout and an inactive community', () => {
  it('refuses with COMMUNITY_INACTIVE, and takes the order again once it is back on', async () => {
    const ctx = await ready('9666100001');
    const off = await request(app)
      .patch(`/api/v1/admin/communities/${ctx.communityId}`)
      .send({ isActive: false });
    expect(off.status).toBe(200);
    try {
      const r = await place(ctx);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('COMMUNITY_INACTIVE');
      expect(r.body.error.message).toMatch(/not delivering/i);
      // Nothing was committed: the basket is still there to order from later.
      const cart = await request(app).get('/api/v1/cart').set(auth(ctx.token));
      expect(cart.body.cart.items.length).toBeGreaterThan(0);
    } finally {
      await request(app)
        .patch(`/api/v1/admin/communities/${ctx.communityId}`)
        .send({ isActive: true });
    }
    const ok = await place(ctx);
    expect(ok.status).toBe(201);
  });
});
