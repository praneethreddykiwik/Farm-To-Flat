/**
 * Cash on delivery.
 *
 * The money arrives at the door, so the only proof the business ever gets is what the person
 * delivering types in. These pin that: the option cannot be used unless the operator turned it on,
 * a cash order cannot be marked delivered without the customer's code AND the full amount, and a
 * settled order stops asking for money.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { getOrder, updatePaymentSettings } = await import('../src/store.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let seq = 0;

async function basket() {
  const mobile = `92240${String(++seq).padStart(5, '0')}`;
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
  // Each basket STARTS at a different point in the catalog — the farm's daily cap is shared across
  // every order for a day, so reusing the same products would exhaust it partway through the suite
  // — and keeps adding until it clears the order minimum, since a slice of cheap leafy greens does
  // not reach ₹500 on its own.
  const avail = cat.products.filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE');
  const start = ((seq - 1) * 5) % avail.length;
  for (let n = 0; n < avail.length; n += 1) {
    const p = avail[(start + n) % avail.length];
    const put = await request(app)
      .put('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: p.id, quantity: 4 });
    if (put.status >= 400) continue; // capped out on this product — try the next
    const { body: cart } = await request(app).get('/api/v1/cart').set(auth(token));
    if (cart.cart.meetsMinimum && cart.cart.items.length >= 4) break;
  }
  const w = await request(app)
    .get(`/api/v1/delivery-windows?addressId=${a.body.address.id}`)
    .set(auth(token));
  return { token, addressId: a.body.address.id, win: w.body.windows.find((x) => x.isOpen) };
}

const placeCod = (ctx) =>
  request(app).post('/api/v1/orders').set(auth(ctx.token)).send({
    addressId: ctx.addressId,
    deliveryDate: ctx.win.date,
    window: ctx.win.window,
    paymentMethod: 'COD',
  });

const advance = (id, status) =>
  request(app).patch(`/api/v1/admin/orders/${id}/status`).send({ status });

describe('cash on delivery', () => {
  beforeEach(() => {
    updatePaymentSettings({ codEnabled: true, codMaxOrderPaise: 300000, deliveryOtpEnabled: true });
  });

  it('is refused while the operator has it switched off', async () => {
    updatePaymentSettings({ codEnabled: false });
    const r = await placeCod(await basket());
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('COD_UNAVAILABLE');
  });

  it('places a live order with nothing to pay online', async () => {
    const r = await placeCod(await basket());
    expect(r.status).toBe(201);
    expect(r.body.order.status).toBe('CONFIRMED'); // live immediately — money comes at the door
    expect(r.body.paymentIntent).toBeFalsy();
    expect(r.body.order.paymentMethod).toBe('COD');
    expect(Number(r.body.order.codDuePaise)).toBe(Number(r.body.order.totalPaise));
  });

  it('refuses an order larger than the cash cap', async () => {
    updatePaymentSettings({ codMaxOrderPaise: 100 }); // ₹1
    const r = await placeCod(await basket());
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('COD_LIMIT_EXCEEDED');
  });

  it('never spends the wallet on a cash order', async () => {
    const ctx = await basket();
    const w = await request(app).get('/api/v1/wallet').set(auth(ctx.token));
    const amt = Number(w.body.denominationsPaise[0]);
    const t = await request(app)
      .post('/api/v1/wallet/topup')
      .set(auth(ctx.token))
      .send({ amountPaise: amt });
    await request(app)
      .post('/api/v1/payments/verify')
      .set(auth(ctx.token))
      .send({ paymentId: t.body.paymentIntent.paymentId, success: true });
    const r = await request(app).post('/api/v1/orders').set(auth(ctx.token)).send({
      addressId: ctx.addressId,
      deliveryDate: ctx.win.date,
      window: ctx.win.window,
      paymentMethod: 'COD',
      useWallet: true,
    });
    expect(r.status).toBe(201);
    expect(Number(r.body.order.walletAppliedPaise)).toBe(0);
    const after = await request(app).get('/api/v1/wallet').set(auth(ctx.token));
    expect(Number(after.body.balancePaise)).toBe(amt); // untouched
  });

  it('gives the customer a code only while the order is actually on the way', async () => {
    const ctx = await basket();
    const { body } = await placeCod(ctx);
    const id = body.order.id;
    let mine = await request(app).get(`/api/v1/orders/${id}`).set(auth(ctx.token));
    expect(mine.body.order.deliveryOtp).toBeNull();

    await advance(id, 'PACKING');
    await advance(id, 'OUT_FOR_DELIVERY');
    mine = await request(app).get(`/api/v1/orders/${id}`).set(auth(ctx.token));
    expect(mine.body.order.deliveryOtp).toMatch(/^\d{4}$/);

    // The operator must never be handed the digits — it is proof the CUSTOMER was at the door.
    const ops = await request(app).get(`/api/v1/admin/orders/${id}`);
    expect(ops.body.order.deliveryOtpPending).toBe(true);
    expect(ops.body.order.deliveryOtp).toBeUndefined();
  });

  it('cannot be marked delivered from the board, skipping the proof', async () => {
    const ctx = await basket();
    const { body } = await placeCod(ctx);
    await advance(body.order.id, 'PACKING');
    await advance(body.order.id, 'OUT_FOR_DELIVERY');
    const r = await advance(body.order.id, 'DELIVERED');
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('DELIVERY_PROOF_REQUIRED');
  });

  it('refuses a wrong code, and refuses short cash', async () => {
    const ctx = await basket();
    const { body } = await placeCod(ctx);
    const id = body.order.id;
    await advance(id, 'PACKING');
    await advance(id, 'OUT_FOR_DELIVERY');
    const otp = getOrder(id).deliveryOtp;
    const due = Number(body.order.totalPaise);

    const wrong = await request(app)
      .post(`/api/v1/admin/orders/${id}/deliver`)
      .send({ otp: '0000', collectedPaise: due });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe('DELIVERY_OTP_INVALID');

    const short = await request(app)
      .post(`/api/v1/admin/orders/${id}/deliver`)
      .send({ otp, collectedPaise: due - 100 });
    expect(short.status).toBe(422);
    expect(short.body.error.code).toBe('COD_SHORT_PAYMENT');

    // Neither failure may have banked money or moved the order on.
    expect(getOrder(id).status).toBe('OUT_FOR_DELIVERY');
    expect(Number(getOrder(id).codCollectedPaise)).toBe(0);
  });

  it('completes on the right code and the full amount, and stops asking for money', async () => {
    const ctx = await basket();
    const { body } = await placeCod(ctx);
    const id = body.order.id;
    const due = Number(body.order.totalPaise);
    await advance(id, 'PACKING');
    await advance(id, 'OUT_FOR_DELIVERY');
    const otp = getOrder(id).deliveryOtp;

    const done = await request(app)
      .post(`/api/v1/admin/orders/${id}/deliver`)
      .send({ otp, collectedPaise: due });
    expect(done.status).toBe(200);
    expect(done.body.order.status).toBe('DELIVERED');
    expect(Number(done.body.order.codCollectedPaise)).toBe(due);
    expect(Number(done.body.order.codDuePaise)).toBe(0);
    expect(done.body.order.deliveredAt).toBeTruthy();

    // The code is spent — replaying it must not deliver the order twice.
    const again = await request(app)
      .post(`/api/v1/admin/orders/${id}/deliver`)
      .send({ otp, collectedPaise: due });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_DELIVERED');
  });

  it('a prepaid order needs the code but no cash', async () => {
    const ctx = await basket();
    const r = await request(app).post('/api/v1/orders').set(auth(ctx.token)).send({
      addressId: ctx.addressId,
      deliveryDate: ctx.win.date,
      window: ctx.win.window,
    });
    if (!r.body.order) throw new Error(`place failed: ${r.status} ${JSON.stringify(r.body)}`);
    const id = r.body.order.id;
    if (r.body.paymentIntent)
      await request(app)
        .post('/api/v1/payments/verify')
        .set(auth(ctx.token))
        .send({ paymentId: r.body.paymentIntent.paymentId, success: true });
    await advance(id, 'PACKING');
    await advance(id, 'OUT_FOR_DELIVERY');
    const otp = getOrder(id).deliveryOtp;
    const done = await request(app).post(`/api/v1/admin/orders/${id}/deliver`).send({ otp });
    expect(done.status).toBe(200);
    expect(Number(done.body.order.codCollectedPaise)).toBe(0);
  });

  it('skips the code entirely when the operator turns that off', async () => {
    updatePaymentSettings({ deliveryOtpEnabled: false });
    const ctx = await basket();
    const { body } = await placeCod(ctx);
    const id = body.order.id;
    await advance(id, 'PACKING');
    await advance(id, 'OUT_FOR_DELIVERY');
    expect(getOrder(id).deliveryOtp).toBeNull();
    const done = await request(app)
      .post(`/api/v1/admin/orders/${id}/deliver`)
      .send({ collectedPaise: Number(body.order.totalPaise) });
    expect(done.status).toBe(200);
    expect(done.body.order.status).toBe('DELIVERED');
  });
});
