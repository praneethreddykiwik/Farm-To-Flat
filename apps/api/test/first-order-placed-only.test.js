/**
 * Review #56 (21 Nov 2026): an order's frozen "first order" flag counts only orders that were
 * really placed. An abandoned checkout used to count, so the customer's real first order was
 * marked not-new and its invite / attribution were dropped.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const store = await import('../src/store.js');
const { expirePendingOrders } = await import('../src/lib/order-lifecycle.js');

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
    .send({ communityId: community.id, block: community.blocks[0], flat: '808', floor: '8' });
  const w = await request(app)
    .get(`/api/v1/delivery-windows?addressId=${a.body.address.id}`)
    .set(auth(token));
  return { token, addressId: a.body.address.id, win: w.body.windows.find((x) => x.isOpen) };
}
async function fill(ctx) {
  const { body } = await request(app).get('/api/v1/admin/products');
  const avail = body.products.filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE');
  const start = (seq++ * 7) % avail.length;
  for (let i = 0; i < 6; i += 1)
    await request(app)
      .put('/api/v1/cart/items')
      .set(auth(ctx.token))
      .send({ productId: avail[(start + i) % avail.length].id, quantity: 6 });
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

describe('the first-order flag', () => {
  it('ignores an abandoned checkout: the paid order after it is still the first', async () => {
    store.updatePaymentSettings({ codEnabled: true, codMaxOrderPaise: 100000000 });
    const ctx = await ready('9666200001');
    await fill(ctx);
    const abandoned = await place(ctx); // prepaid, never paid
    expect(abandoned.body.order.status).toBe('PENDING_PAYMENT');
    expirePendingOrders({ now: Date.now() + 31 * 60 * 1000 });
    expect(store.getOrder(abandoned.body.order.id).status).toBe('PAYMENT_FAILED');

    await fill(ctx);
    const real = await place(ctx, { paymentMethod: 'COD' });
    expect(real.status).toBe(201);
    expect(store.getOrder(real.body.order.id).isFirstOrder).toBe(true);

    // And the order after a really placed one is not.
    await fill(ctx);
    const next = await place(ctx, { paymentMethod: 'COD' });
    expect(next.status).toBe(201);
    expect(store.getOrder(next.body.order.id).isFirstOrder).toBe(false);
  });

  it('still counts a placed order under the same mobile (erased and re-signed-up)', () => {
    const [p] = store.listProducts();
    const lines = [{ productId: p.id, quantity: Number(p.increment) || 1 }];
    const base = {
      communityId: 'com_cyberzon',
      customerName: 'Mobile Test',
      mobile: '9666200099',
      deliveryDate: '2099-01-01',
      window: 'MORNING',
      lines,
    };
    store.createOrder({ ...base, customerId: 'cus_old_account', status: 'DELIVERED' });
    const again = store.createOrder({
      ...base,
      customerId: 'cus_new_account',
      status: 'CONFIRMED',
    });
    expect(again.isFirstOrder).toBe(false);
  });
});
