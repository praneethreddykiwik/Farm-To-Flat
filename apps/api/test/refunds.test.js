/**
 * Money must never be refunded twice, never be stranded, and never be captured into the void.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function login(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  return v.body.accessToken;
}
async function topUp(token) {
  const w = await request(app).get('/api/v1/wallet').set(auth(token));
  const amount = Number(w.body.denominationsPaise[0]);
  const t = await request(app)
    .post('/api/v1/wallet/topup')
    .set(auth(token))
    .send({ amountPaise: amount });
  await request(app)
    .post('/api/v1/payments/verify')
    .set(auth(token))
    .send({ paymentId: t.body.paymentIntent.paymentId, success: true });
  return amount;
}
async function balance(token) {
  const w = await request(app).get('/api/v1/wallet').set(auth(token));
  return Number(w.body.balancePaise);
}
async function readyToOrder(mobile) {
  const token = await login(mobile);
  const { body: c } = await request(app).get('/api/v1/communities');
  const community = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set(auth(token))
    .send({ communityId: community.id, block: community.blocks[0], flat: '702', floor: '7' });
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
  const win = w.body.windows.find((x) => x.isOpen);
  return { token, addressId: a.body.address.id, win };
}
async function place(ctx, useWallet = true) {
  const r = await request(app).post('/api/v1/orders').set(auth(ctx.token)).send({
    addressId: ctx.addressId,
    deliveryDate: ctx.win.date,
    window: ctx.win.window,
    useWallet,
  });
  expect(r.status).toBe(201);
  return r.body;
}

describe('refunds are idempotent and never stranded', () => {
  it('PAYMENT_FAILED refunds once; admin cannot force-confirm it; cancel after that refunds nothing more', async () => {
    const ctx = await readyToOrder('9222000001');
    const topped = await topUp(ctx.token);
    const { order, paymentIntent } = await place(ctx);
    const applied = Number(order.walletAppliedPaise);
    expect(applied).toBeGreaterThan(0);
    expect(await balance(ctx.token)).toBe(topped - applied);

    await request(app)
      .post('/api/v1/payments/verify')
      .set(auth(ctx.token))
      .send({ paymentId: paymentIntent.paymentId, success: false });
    expect(await balance(ctx.token)).toBe(topped); // refunded once

    const force = await request(app)
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .send({ status: 'CONFIRMED' });
    expect(force.status).toBe(409); // PAYMENT_FAILED → CONFIRMED is no longer a legal move

    const cancel = await request(app)
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set(auth(ctx.token))
      .send({});
    expect(cancel.status).toBe(200);
    expect(cancel.body.order.status).toBe('CANCELLED');
    expect(await balance(ctx.token)).toBe(topped); // NOT refunded a second time
  });

  it('admin "Cancelled" from the board refunds the wallet (was stranded before)', async () => {
    const ctx = await readyToOrder('9222000002');
    const topped = await topUp(ctx.token);
    const { order, paymentIntent } = await place(ctx);
    const applied = Number(order.walletAppliedPaise);
    if (paymentIntent) {
      await request(app)
        .post('/api/v1/payments/verify')
        .set(auth(ctx.token))
        .send({ paymentId: paymentIntent.paymentId, success: true });
    }
    expect(await balance(ctx.token)).toBe(topped - applied);

    const r = await request(app)
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .send({ status: 'CANCELLED' });
    expect(r.status).toBe(200);
    expect(r.body.order.status).toBe('CANCELLED');
    expect(await balance(ctx.token)).toBe(topped);

    // and a second cancel attempt from anywhere changes nothing
    const again = await request(app)
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .send({ status: 'CANCELLED' });
    expect(again.status).toBe(200);
    expect(await balance(ctx.token)).toBe(topped);
    const cust = await request(app)
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set(auth(ctx.token))
      .send({});
    expect(cust.status).toBe(409);
  });

  it('a CONFIRMED order cancels outright, and 5 concurrent cancels refund exactly once', async () => {
    // The customer no longer waits on an operator: until the order is being packed, cancelling is
    // immediate. The refund still has to survive the customer hammering the button.
    const ctx = await readyToOrder('9222000003');
    const topped = await topUp(ctx.token);
    const { order, paymentIntent } = await place(ctx);
    const applied = Number(order.walletAppliedPaise);
    if (paymentIntent)
      await request(app)
        .post('/api/v1/payments/verify')
        .set(auth(ctx.token))
        .send({ paymentId: paymentIntent.paymentId, success: true });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post(`/api/v1/orders/${order.id}/cancel`).set(auth(ctx.token)).send({}),
      ),
    );
    // Every call answers cleanly — the first cancels, the rest see it is already cancelled.
    expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    expect(results.filter((r) => r.status === 200 && r.body.cancelled).length).toBeGreaterThan(0);
    // The money came back exactly once.
    expect(await balance(ctx.token)).toBe(topped);
    expect(applied).toBeGreaterThan(0);
  });

  it('an order already being packed raises a request, and moves no money until it is granted', async () => {
    const ctx = await readyToOrder('9222000009');
    const { order, paymentIntent } = await place(ctx);
    if (paymentIntent)
      await request(app)
        .post('/api/v1/payments/verify')
        .set(auth(ctx.token))
        .send({ paymentId: paymentIntent.paymentId, success: true });
    await request(app).patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: 'PACKING' });
    const owed = await balance(ctx.token);

    const r = await request(app)
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set(auth(ctx.token))
      .send({ reason: 'plans changed' });
    expect(r.status).toBe(200);
    expect(r.body.requested).toBe(true);
    expect(r.body.cancelled).toBe(false);
    expect(r.body.order.cancelRequested).toBe(true);
    // Still being packed, and nothing refunded — the operator has not decided yet.
    expect(r.body.order.status).toBe('PACKING');
    expect(await balance(ctx.token)).toBe(owed);

    // Asking twice is the same as asking once.
    const again = await request(app)
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set(auth(ctx.token))
      .send({});
    expect(again.status).toBe(200);
    expect(again.body.requested).toBe(true);

    // The operator grants it — now, and only now, the money comes back.
    const decided = await request(app)
      .post(`/api/v1/admin/orders/${order.id}/cancel-decision`)
      .send({ decision: 'APPROVE' });
    expect(decided.status).toBe(200);
    expect(decided.body.order.status).toBe('CANCELLED');
    expect(await balance(ctx.token)).toBeGreaterThanOrEqual(owed);
  });

  it('a declined request leaves the order alone and lets the customer ask again', async () => {
    const ctx = await readyToOrder('9222000011');
    const { order, paymentIntent } = await place(ctx);
    if (paymentIntent)
      await request(app)
        .post('/api/v1/payments/verify')
        .set(auth(ctx.token))
        .send({ paymentId: paymentIntent.paymentId, success: true });
    await request(app).patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: 'PACKING' });
    await request(app).post(`/api/v1/orders/${order.id}/cancel`).set(auth(ctx.token)).send({});

    const declined = await request(app)
      .post(`/api/v1/admin/orders/${order.id}/cancel-decision`)
      .send({ decision: 'DECLINE' });
    expect(declined.status).toBe(200);
    expect(declined.body.order.status).toBe('PACKING');
    expect(declined.body.order.cancelRequested).toBe(false);

    const mine = await request(app).get(`/api/v1/orders/${order.id}`).set(auth(ctx.token));
    expect(mine.body.order.canRequestCancel).toBe(true); // they may ask again
  });

  it('a gateway capture that lands after the order was cancelled is returned to the wallet, not lost', async () => {
    const ctx = await readyToOrder('9222000004');
    const { order, paymentIntent } = await place(ctx, false); // no wallet → full gateway amount
    expect(paymentIntent).toBeTruthy();
    const before = await balance(ctx.token);
    await request(app).post(`/api/v1/orders/${order.id}/cancel`).set(auth(ctx.token)).send({});
    const cap = await request(app)
      .post('/api/v1/payments/verify')
      .set(auth(ctx.token))
      .send({ paymentId: paymentIntent.paymentId, razorpayPaymentId: 'pay_late', success: true });
    expect(cap.status).toBe(200);
    expect(cap.body.orphaned).toBe(true);
    expect(cap.body.order.status).toBe('CANCELLED');
    expect(await balance(ctx.token)).toBe(before + Number(paymentIntent.amountPaise));
    const w = await request(app).get('/api/v1/wallet').set(auth(ctx.token));
    expect(w.body.ledger[0].reference).toBe(`${order.orderNumber}:gateway`);
  });
});
