/**
 * Review #5 (21 Nov 2026): the customer is charged only the total they were shown.
 *
 * The app sends the total its checkout screen displayed (`expectedTotalPaise`). If the server's
 * total differs — a price changed between viewing and paying — the order is refused with 409
 * PRICE_CHANGED and the new total, and nothing is committed. An app that sends no figure (builds
 * already on phones) gets the old behaviour.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const store = await import('../src/store.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let seq = 0;
async function ready(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  const { body: c } = await request(app).get('/api/v1/communities');
  const community = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set(auth(token))
    .send({ communityId: community.id, block: community.blocks[0], flat: '606', floor: '6' });
  const { body } = await request(app).get('/api/v1/admin/products');
  const avail = body.products.filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE');
  const start = (seq++ * 7) % avail.length;
  for (let i = 0; i < 6; i += 1)
    await request(app)
      .put('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: avail[(start + i) % avail.length].id, quantity: 6 });
  const w = await request(app)
    .get(`/api/v1/delivery-windows?addressId=${a.body.address.id}`)
    .set(auth(token));
  return { token, addressId: a.body.address.id, win: w.body.windows.find((x) => x.isOpen) };
}
const place = (ctx, extra = {}) =>
  request(app)
    .post('/api/v1/orders')
    .set(auth(ctx.token))
    .send({
      addressId: ctx.addressId,
      deliveryDate: ctx.win.date,
      window: ctx.win.window,
      ...extra,
    });
const cartOf = async (ctx) =>
  (await request(app).get('/api/v1/cart').set(auth(ctx.token))).body.cart;

describe('expected total at checkout', () => {
  it('places the order when the shown total matches', async () => {
    const ctx = await ready('9666400001');
    const cart = await cartOf(ctx);
    const r = await place(ctx, { expectedTotalPaise: cart.totalPaise });
    expect(r.status).toBe(201);
    expect(r.body.order.totalPaise).toBe(cart.totalPaise);
  });

  it('refuses with PRICE_CHANGED and the new total when a price moved, committing nothing', async () => {
    const ctx = await ready('9666400002');
    const shown = await cartOf(ctx);
    // A price changes while the customer is on the checkout screen.
    const line = shown.items[0];
    const p = store.getProduct(line.productId);
    await request(app)
      .patch(`/api/v1/admin/products/${p.id}`)
      .send({ pricePaise: Number(p.pricePaise) + 1000 });
    const now = await cartOf(ctx);
    expect(now.totalPaise).not.toBe(shown.totalPaise);

    const r = await place(ctx, { expectedTotalPaise: shown.totalPaise });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('PRICE_CHANGED');
    expect(r.body.error.details.expectedTotalPaise).toBe(shown.totalPaise);
    expect(r.body.error.details.totalPaise).toBe(now.totalPaise);
    // Nothing committed: the basket is intact and no order exists.
    expect((await cartOf(ctx)).items.length).toBe(shown.items.length);
    const mine = await request(app).get('/api/v1/orders').set(auth(ctx.token));
    expect(mine.body.orders.length).toBe(0);

    // Re-confirming the new total goes through.
    const ok = await place(ctx, { expectedTotalPaise: now.totalPaise });
    expect(ok.status).toBe(201);
  });

  it('an app that sends no expected total gets the old behaviour', async () => {
    const ctx = await ready('9666400003');
    const r = await place(ctx);
    expect(r.status).toBe(201);
  });
});
