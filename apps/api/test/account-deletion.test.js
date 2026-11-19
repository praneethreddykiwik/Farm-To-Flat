/**
 * Account deletion (app stores / DPDP right to erasure), with the 60-day grace period decided on
 * 19 Nov 2026 (lib/account-deletion.js):
 *   - asking signs the account out everywhere at once and schedules erasure for 60 days later;
 *   - signing in again inside those 60 days cancels it, and says so;
 *   - the in-app flow is confirmed with a code sent to the account's own number;
 *   - nothing can be scheduled while an order is still in progress (a cash order needs this
 *     customer's door code to be completed);
 *   - when the 60 days are up the sweep erases PII and frees the number for a fresh signup.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { sweepDeletions, GRACE_DAYS } = await import('../src/lib/account-deletion.js');
const { getOrder, updatePaymentSettings } = await import('../src/store.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const me = (t) => request(app).get('/api/v1/me').set(auth(t));
async function login(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  return v.body;
}
async function withAddress(mobile) {
  const s = await login(mobile);
  const { body: c } = await request(app).get('/api/v1/communities');
  const com = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set(auth(s.accessToken))
    .send({ communityId: com.id, block: com.blocks[0], flat: '303', floor: '3' });
  return { ...s, addressId: a.body.address.id };
}
const DAY = 864e5;

beforeAll(() => {
  updatePaymentSettings({ codEnabled: true, codMaxOrderPaise: 500000, deliveryOtpEnabled: true });
});

describe('scheduling and the grace period', () => {
  it('signs out at once, keeps the account for 60 days, and signing in again cancels it', async () => {
    const mobile = '9557000010';
    const s = await withAddress(mobile);
    const del = await request(app).delete('/api/v1/me').set(auth(s.accessToken));
    expect(del.status).toBe(200);
    expect(del.body.scheduled).toBe(true);
    const days = Math.round((Date.parse(del.body.deleteAfter) - Date.now()) / DAY);
    expect(days).toBe(GRACE_DAYS);

    // signed out everywhere
    expect((await me(s.accessToken)).status).toBe(401);

    // signing back in within the grace period keeps everything
    const back = await login(mobile);
    expect(back.deletionCancelled).toBe(true);
    const addrs = await request(app).get('/api/v1/addresses').set(auth(back.accessToken));
    expect(addrs.body.addresses).toHaveLength(1);
    const status = await request(app).get('/api/v1/me/deletion').set(auth(back.accessToken));
    expect(status.body.scheduled).toBeNull();

    // and a sweep long after does nothing to it
    await sweepDeletions(Date.now() + (GRACE_DAYS + 1) * DAY);
    expect((await me(back.accessToken)).status).toBe(200);
  });

  it('deleting twice is a 401, never a 500', async () => {
    const { accessToken } = await login('9557000011');
    expect((await request(app).delete('/api/v1/me').set(auth(accessToken))).status).toBe(200);
    expect((await request(app).delete('/api/v1/me').set(auth(accessToken))).status).toBe(401);
  });
});

describe('the in-app flow, confirmed with a code', () => {
  it('needs the code; after 60 days the sweep erases the account and frees the number', async () => {
    const mobile = '9557000012';
    const s = await withAddress(mobile);
    const ask = await request(app).post('/api/v1/me/deletion/request').set(auth(s.accessToken));
    expect(ask.status).toBe(200);
    const wrong = await request(app)
      .post('/api/v1/me/deletion/confirm')
      .set(auth(s.accessToken))
      .send({ otp: '000000' });
    expect(wrong.status).toBe(401);
    expect((await me(s.accessToken)).status).toBe(200); // a wrong code changes nothing

    await request(app).post('/api/v1/me/deletion/request').set(auth(s.accessToken));
    const ok = await request(app)
      .post('/api/v1/me/deletion/confirm')
      .set(auth(s.accessToken))
      .send({ otp: '123456' });
    expect(ok.status).toBe(200);
    expect(ok.body.scheduled).toBe(true);
    expect((await me(s.accessToken)).status).toBe(401);

    // not yet: one day before the end of the grace period
    expect(await sweepDeletions(Date.now() + (GRACE_DAYS - 1) * DAY)).toBe(0);
    // after it: erased
    expect(await sweepDeletions(Date.now() + (GRACE_DAYS + 1) * DAY)).toBeGreaterThanOrEqual(1);

    const fresh = await login(mobile);
    expect(fresh.deletionCancelled).toBeUndefined();
    const addrs = await request(app).get('/api/v1/addresses').set(auth(fresh.accessToken));
    expect(addrs.body.addresses).toEqual([]); // a brand-new account on the same number
  });
});

describe('orders in progress block deletion', () => {
  it('refuses while a cash order is on its way, and allows it once delivered and paid', async () => {
    const s = await withAddress('9557000013');
    const { body: cat } = await request(app).get('/api/v1/admin/products');
    for (const p of cat.products
      .filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE')
      .slice(5, 25)) {
      await request(app)
        .put('/api/v1/cart/items')
        .set(auth(s.accessToken))
        .send({ productId: p.id, quantity: 3 });
      const cart = await request(app).get('/api/v1/cart').set(auth(s.accessToken));
      if (cart.body.cart?.meetsMinimum) break;
    }
    const w = await request(app)
      .get(`/api/v1/delivery-windows?addressId=${s.addressId}`)
      .set(auth(s.accessToken));
    const win = w.body.windows.find((x) => x.isOpen);
    const placed = await request(app)
      .post('/api/v1/orders')
      .set(auth(s.accessToken))
      .send({
        addressId: s.addressId,
        deliveryDate: win.date,
        window: win.window,
        paymentMethod: 'COD',
      });
    expect(placed.status).toBe(201);
    const id = placed.body.order.id;

    const st = await request(app).get('/api/v1/me/deletion').set(auth(s.accessToken));
    expect(st.body.canDelete).toBe(false);
    expect(st.body.ordersInProgress[0].orderNumber).toBe(placed.body.order.orderNumber);
    const ask = await request(app).post('/api/v1/me/deletion/request').set(auth(s.accessToken));
    expect(ask.status).toBe(409);
    expect(ask.body.error.code).toBe('ORDERS_IN_PROGRESS');
    const old = await request(app).delete('/api/v1/me').set(auth(s.accessToken)); // older app
    expect(old.status).toBe(409);
    expect((await me(s.accessToken)).status).toBe(200); // still signed in, nothing scheduled

    // delivered, code read out, cash taken
    await request(app).patch(`/api/v1/admin/orders/${id}/status`).send({ status: 'PACKING' });
    await request(app)
      .patch(`/api/v1/admin/orders/${id}/status`)
      .send({ status: 'OUT_FOR_DELIVERY' });
    const o = getOrder(id);
    const done = await request(app)
      .post(`/api/v1/admin/orders/${id}/deliver`)
      .send({ otp: o.deliveryOtp, collectedPaise: Number(o.totalPaise) });
    expect(done.status).toBe(200);

    const now = await request(app).get('/api/v1/me/deletion').set(auth(s.accessToken));
    expect(now.body.canDelete).toBe(true);
    const del = await request(app).delete('/api/v1/me').set(auth(s.accessToken));
    expect(del.status).toBe(200);
    expect(del.body.scheduled).toBe(true);
  });
});
