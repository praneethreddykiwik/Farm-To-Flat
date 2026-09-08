/**
 * Customer contract flow — the app runs against exactly this. OTP → me → address → cart → coupon →
 * window → order transaction → payment verify → wallet, plus the auth gate and the cost-leak guard.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

const MOBILE = '9876500011';
let token;
let addressId;

async function login(mobile = MOBILE) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const r = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  return r.body;
}

beforeAll(async () => {
  const auth = await login();
  token = auth.accessToken;
  const addr = await request(app)
    .post('/api/v1/addresses')
    .set('Authorization', `Bearer ${token}`)
    .send({ communityId: 'com_cyberzon', block: 'Tower A', flat: '101', recipientName: 'Test' });
  addressId = addr.body.address.id;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('auth gate', () => {
  it('rejects unauthenticated access with UNAUTHENTICATED', async () => {
    const r = await request(app).get('/api/v1/me');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('verifies OTP and returns tokens + customer', async () => {
    const b = await login();
    expect(b.accessToken).toBeTruthy();
    expect(b.refreshToken).toBeTruthy();
    expect(b.customer.mobile).toBe(MOBILE);
  });
});

describe('cart + minimum order', () => {
  it('adds items in valid increments and re-prices', async () => {
    await request(app)
      .put('/api/v1/cart/items')
      .set(auth())
      .send({ productId: 'p_tomato', quantity: 1, note: 'ripe' });
    const cart = await request(app).get('/api/v1/cart').set(auth());
    expect(cart.body.cart.items.length).toBe(1);
    expect(cart.body.cart.items[0].note).toBe('ripe');
    expect(typeof cart.body.cart.subtotalPaise).toBe('string');
  });

  it('rejects an invalid increment', async () => {
    const r = await request(app)
      .put('/api/v1/cart/items')
      .set(auth())
      .send({ productId: 'p_tomato', quantity: 0.1 });
    expect(r.status).toBe(422);
  });

  it('blocks checkout below ₹500', async () => {
    const r = await request(app)
      .post('/api/v1/orders')
      .set(auth())
      .send({ addressId, deliveryDate: '2026-09-10', window: 'MORNING', useWallet: false });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('MIN_ORDER_NOT_MET');
  });
});

describe('order transaction + payment', () => {
  it('places an order, returns a payment intent, and confirms on verify', async () => {
    await request(app)
      .put('/api/v1/cart/items')
      .set(auth())
      .send({ productId: 'p_mutton', quantity: 1 });
    const win = await request(app).get('/api/v1/delivery-windows').set(auth());
    const open = win.body.windows.find((w) => w.isOpen);

    const order = await request(app)
      .post('/api/v1/orders')
      .set(auth())
      .send({ addressId, deliveryDate: open.date, window: open.window, useWallet: false });
    expect(order.status).toBe(201);
    expect(order.body.order.status).toBe('PENDING_PAYMENT');
    expect(order.body.paymentIntent.paymentId).toBeTruthy();

    // NON-NEGOTIABLE: the customer order shape never leaks cost
    const raw = JSON.stringify(order.body);
    for (const bad of ['costPaise', 'unitCostPaise', 'lineCostPaise', 'margin']) {
      expect(raw).not.toContain(bad);
    }

    const verify = await request(app)
      .post('/api/v1/payments/verify')
      .set(auth())
      .send({ paymentId: order.body.paymentIntent.paymentId, success: true });
    expect(verify.body.status).toBe('CAPTURED');
    expect(verify.body.order.status).toBe('CONFIRMED');
  });

  it('surfaces the order to the admin board', async () => {
    const admin = await request(app).get('/api/v1/admin/orders');
    const mine = admin.body.orders.find((o) => o.mobile === MOBILE);
    expect(mine).toBeTruthy();
  });
});

describe('wallet', () => {
  it('tops up and captures to a credit', async () => {
    const tu = await request(app)
      .post('/api/v1/wallet/topup')
      .set(auth())
      .send({ amountPaise: 100000 });
    expect(tu.status).toBe(201);
    const v = await request(app)
      .post('/api/v1/payments/verify')
      .set(auth())
      .send({ paymentId: tu.body.paymentIntent.paymentId, success: true });
    expect(v.body.status).toBe('CAPTURED');
    expect(Number(v.body.walletBalancePaise)).toBe(100000);
  });
});
