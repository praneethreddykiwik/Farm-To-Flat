/**
 * Review #6 (21 Nov 2026): the cart preview and checkout judge a coupon with ONE evaluator.
 *
 *  - FREE_ITEM used to take the product's price off and never add the product. It now adds the
 *    product to the order as a ₹0 line, and takes no money off.
 *  - The preview used to price any code in the basket with no checks, so it could show a discount
 *    that checkout then refused. A code checkout would refuse now takes nothing off in the preview
 *    and carries the same error.
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
    .send({ communityId: community.id, block: community.blocks[0], flat: '505', floor: '5' });
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
const place = (ctx) =>
  request(app)
    .post('/api/v1/orders')
    .set(auth(ctx.token))
    .send({ addressId: ctx.addressId, deliveryDate: ctx.win.date, window: ctx.win.window });
const cartOf = async (ctx) =>
  (await request(app).get('/api/v1/cart').set(auth(ctx.token))).body.cart;

function giftProduct() {
  return store
    .listProducts()
    .find(
      (p) =>
        p.isActive !== false &&
        (!p.availability || p.availability === 'AVAILABLE') &&
        Number(p.increment) > 0,
    );
}

describe('FREE_ITEM coupon', () => {
  it('adds the product to the order at ₹0 and takes no money off', async () => {
    const gift = giftProduct();
    const code = 'FREEGIFT1';
    const created = await request(app)
      .post('/api/v1/admin/coupons')
      .send({
        code,
        label: `Free ${gift.name}`,
        type: 'FREE_ITEM',
        freeProductId: gift.id,
      });
    expect(created.status).toBe(201);

    const ctx = await ready('9666300001');
    const applied = await request(app)
      .post('/api/v1/cart/coupon')
      .set(auth(ctx.token))
      .send({ code });
    expect(applied.status).toBe(200);
    const cart = applied.body.cart;
    expect(cart.coupon.code).toBe(code);
    expect(Number(cart.couponDiscountPaise)).toBe(0);
    expect(cart.freeItem.productId).toBe(gift.id);
    expect(Number(cart.freeItem.quantity)).toBe(Number(gift.increment));

    const r = await place(ctx);
    expect(r.status).toBe(201);
    const order = store.getOrder(r.body.order.id);
    const freeLine = order.items.find((l) => l.free);
    expect(freeLine).toBeTruthy();
    expect(freeLine.productId).toBe(gift.id);
    expect(freeLine.lineTotalPaise).toBe(0);
    expect(freeLine.unitPricePaise).toBe(0);
    // What the customer was shown is what the order charges.
    expect(Number(order.totalPaise)).toBe(Number(cart.totalPaise));
    expect(Number(order.subtotalPaise)).toBe(Number(cart.subtotalPaise));
    expect(Number(order.couponDiscountPaise)).toBe(0);
  });
});

describe('the preview and checkout agree on an invalid code', () => {
  it('a code switched off after it was applied takes nothing off, and checkout refuses it with the same error', async () => {
    const code = 'PREVIEWOFF1';
    await request(app)
      .post('/api/v1/admin/coupons')
      .send({ code, label: '10% off', type: 'PERCENT', percentOff: 10 });
    const ctx = await ready('9666300002');
    const applied = await request(app)
      .post('/api/v1/cart/coupon')
      .set(auth(ctx.token))
      .send({ code });
    expect(Number(applied.body.cart.couponDiscountPaise)).toBeGreaterThan(0);

    await request(app).patch(`/api/v1/admin/coupons/${code}`).send({ isActive: false });

    const cart = await cartOf(ctx);
    expect(Number(cart.couponDiscountPaise)).toBe(0);
    expect(cart.couponError.code).toBe('COUPON_NOT_FOUND');
    expect(cart.coupon.error.code).toBe('COUPON_NOT_FOUND'); // still shown, so it can be removed
    const r = await place(ctx);
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe(cart.couponError.code);

    // Removing it lets the order through at exactly the previewed total.
    await request(app).delete('/api/v1/cart/coupon').set(auth(ctx.token));
    const clean = await cartOf(ctx);
    expect(clean.couponError).toBeNull();
    const ok = await place(ctx);
    expect(ok.status).toBe(201);
    expect(Number(ok.body.order.totalPaise)).toBe(Number(clean.totalPaise));
  });
});
