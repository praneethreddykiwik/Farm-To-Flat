/**
 * Window capacity is derived from live orders: no phantom bookings, a cancelled order frees its
 * slot, and the count is exact under concurrent placement.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

async function login(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  return v.body.accessToken;
}

async function bigCart(token) {
  const { body } = await request(app).get('/api/v1/admin/products');
  const ok = body.products.filter((p) => (p.availability || 'AVAILABLE') === 'AVAILABLE');
  for (const p of ok.slice(0, 6)) {
    await request(app)
      .put('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id, quantity: 6 });
  }
}

async function customerWithAddress(mobile) {
  const token = await login(mobile);
  const { body: c } = await request(app).get('/api/v1/communities');
  const community = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set('Authorization', `Bearer ${token}`)
    .send({ communityId: community.id, block: community.blocks[0], flat: '901', floor: '9' });
  return { token, addressId: a.body.address.id, community };
}

async function windowsFor(token, addressId) {
  const r = await request(app)
    .get(`/api/v1/delivery-windows?addressId=${addressId}`)
    .set('Authorization', `Bearer ${token}`);
  return r.body.windows;
}

describe('window capacity is derived from live orders', () => {
  it('a fresh window has no phantom bookings: remaining === capacity', async () => {
    const { token, addressId } = await customerWithAddress('9111000001');
    const w = (await windowsFor(token, addressId)).find((x) => x.isOpen);
    expect(w.booked).toBe(0);
    expect(w.remaining).toBe(w.capacity);
  });

  it('placing an order consumes exactly one slot; cancelling frees it', async () => {
    const { token, addressId } = await customerWithAddress('9111000002');
    await bigCart(token);
    const before = (await windowsFor(token, addressId)).find((x) => x.isOpen);
    const o = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ addressId, deliveryDate: before.date, window: before.window });
    expect(o.status).toBe(201);
    const during = (await windowsFor(token, addressId)).find((x) => x.id === before.id);
    expect(during.booked).toBe(before.booked + 1);
    expect(during.remaining).toBe(before.remaining - 1);

    // PENDING_PAYMENT cancels immediately → slot is released
    const c = await request(app)
      .post(`/api/v1/orders/${o.body.order.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(c.body.order.status).toBe('CANCELLED');
    const after = (await windowsFor(token, addressId)).find((x) => x.id === before.id);
    expect(after.booked).toBe(before.booked);
    expect(after.remaining).toBe(before.remaining);
  });

  it('a full window rejects with WINDOW_FULL only when real orders fill it', async () => {
    // shrink capacity of the first community to 2 so the test is fast
    const { body: c } = await request(app).get('/api/v1/communities');
    const community = c.communities[0];
    await request(app)
      .patch(`/api/v1/admin/communities/${community.id}`)
      .send({ windowCapacity: 2 });
    const buyers = [];
    for (const m of ['9111000011', '9111000012', '9111000013']) {
      const b = await customerWithAddress(m);
      await bigCart(b.token);
      buyers.push(b);
    }
    // pick a window nobody else in this file used (last open one)
    const all = await windowsFor(buyers[0].token, buyers[0].addressId);
    const w = [...all].reverse().find((x) => x.isOpen && x.booked === 0);
    const results = await Promise.all(
      buyers.map((b) =>
        request(app)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${b.token}`)
          .send({ addressId: b.addressId, deliveryDate: w.date, window: w.window }),
      ),
    );
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 201, 409]);
    const full = results.find((r) => r.status === 409);
    expect(full.body.error.code).toBe('WINDOW_FULL');
    const now = (await windowsFor(buyers[0].token, buyers[0].addressId)).find((x) => x.id === w.id);
    expect(now.booked).toBe(2);
    expect(now.remaining).toBe(0);
    expect(now.isOpen).toBe(false);
    await request(app)
      .patch(`/api/v1/admin/communities/${community.id}`)
      .send({ windowCapacity: community.windowCapacity || 40 });
  });
});
