/**
 * A PAYMENT_FAILED order is not an order.
 *
 * The wallet is returned, the stock released and the coupon freed the moment the payment fails, and
 * nothing will ever be delivered against it — but it was still listed in "Your orders" with a date
 * and a total, which is indistinguishable from a real one. It stays reachable by id so an old
 * notification still opens and explains itself.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { listOrdersForCustomer, patchOrder, updatePaymentSettings } from '../src/store.js';

process.env.NODE_ENV = 'test';
const auth = (t) => ({ Authorization: `Bearer ${t}` });
let seq = 0;

async function orderedCustomer() {
  const mobile = `93310${String(++seq).padStart(5, '0')}`;
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  const { body: c } = await request(app).get('/api/v1/communities');
  const com = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set(auth(token))
    .send({ communityId: com.id, block: com.blocks[0], flat: '909', floor: '9' });
  const { body: cat } = await request(app).get('/api/v1/admin/products');
  const avail = cat.products.filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE');
  for (let n = 0; n < avail.length; n += 1) {
    const put = await request(app)
      .put('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: avail[n].id, quantity: 4 });
    if (put.status >= 400) continue;
    const { body: cart } = await request(app).get('/api/v1/cart').set(auth(token));
    if (cart.cart.meetsMinimum && cart.cart.items.length >= 4) break;
  }
  const w = await request(app)
    .get(`/api/v1/delivery-windows?addressId=${a.body.address.id}`)
    .set(auth(token));
  const win = w.body.windows.find((x) => x.isOpen);
  const placed = await request(app).post('/api/v1/orders').set(auth(token)).send({
    addressId: a.body.address.id,
    deliveryDate: win.date,
    window: win.window,
    paymentMethod: 'COD',
  });
  return { token, order: placed.body.order, customerId: v.body.customer.id };
}

describe('a failed payment is not an order', () => {
  // COD is operator-controlled and off by default; this suite pays at the door so it never has to
  // drive a real gateway.
  beforeEach(() => {
    updatePaymentSettings({ codEnabled: true, codMaxOrderPaise: 300000, deliveryOtpEnabled: true });
  });

  it('disappears from the list the moment the payment fails, and the rest stay', async () => {
    const a = await orderedCustomer();
    expect(a.order?.id).toBeTruthy();

    const before = await request(app).get('/api/v1/orders').set(auth(a.token));
    expect(before.body.orders.map((o) => o.id)).toContain(a.order.id);

    patchOrder(a.order.id, (o) => {
      o.status = 'PAYMENT_FAILED';
    });

    const after = await request(app).get('/api/v1/orders').set(auth(a.token));
    expect(after.body.orders.map((o) => o.id)).not.toContain(a.order.id);
    // the row itself is untouched — this is a display rule, not a deletion
    expect(listOrdersForCustomer(a.customerId).some((o) => o.id === a.order.id)).toBe(true);
  });

  it('still opens by id, so an old notification explains itself instead of 404ing', async () => {
    const a = await orderedCustomer();
    patchOrder(a.order.id, (o) => {
      o.status = 'PAYMENT_FAILED';
    });
    const one = await request(app).get(`/api/v1/orders/${a.order.id}`).set(auth(a.token));
    expect(one.status).toBe(200);
    expect(one.body.order.status).toBe('PAYMENT_FAILED');
  });

  it('every order it does list carries translations on its lines', async () => {
    const a = await orderedCustomer();
    const r = await request(app).get('/api/v1/orders').set(auth(a.token));
    const lines = r.body.orders.flatMap((o) => o.items);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toHaveProperty('names');
    // at least one of the seeded products has a Telugu name, and it is not the English one
    const translated = lines.filter((l) => l.names?.te);
    expect(translated.length).toBeGreaterThan(0);
    for (const l of translated) expect(l.names.te).not.toBe(l.name);
  });
});
