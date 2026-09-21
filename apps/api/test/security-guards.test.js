/**
 * CSV exports neutralise spreadsheet formulas; the dev OTP decision confines the fixed code in prod.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { csvEscape } = await import('../src/lib/csv.js');
const { devOtpAllowedFor } = await import('../src/customer-store.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('CSV formula injection', () => {
  it('cells starting with = + - @ are neutralised', () => {
    expect(csvEscape('=HYPERLINK(0)')).toBe("'=HYPERLINK(0)");
    expect(csvEscape('+cmd')).toBe("'+cmd");
    expect(csvEscape('-1')).toBe("'-1");
    expect(csvEscape('@SUM')).toBe("'@SUM");
    expect(csvEscape('=cmd|calc, x')).toBe('"\'=cmd|calc, x"');
    expect(csvEscape('Spinach')).toBe('Spinach');
    expect(csvEscape(12)).toBe('12');
  });

  it('a customer note lands in the packing CSV as text, not a formula', async () => {
    const mobile = '9777000001';
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
    const token = v.body.accessToken;
    const { body: c } = await request(app).get('/api/v1/communities');
    const community = c.communities[0];
    const a = await request(app)
      .post('/api/v1/addresses')
      .set(auth(token))
      .send({ communityId: community.id, block: community.blocks[0], flat: '101', floor: '1' });
    const { body } = await request(app).get('/api/v1/admin/products');
    const ps = body.products.filter((p) => (p.availability || 'AVAILABLE') === 'AVAILABLE');
    for (const p of ps.slice(0, 6))
      await request(app)
        .put('/api/v1/cart/items')
        .set(auth(token))
        .send({ productId: p.id, quantity: 6, note: '=cmd|calc' });
    const w = await request(app)
      .get(`/api/v1/delivery-windows?addressId=${a.body.address.id}`)
      .set(auth(token));
    const win = w.body.windows.find((x) => x.isOpen);
    const o = await request(app)
      .post('/api/v1/orders')
      .set(auth(token))
      .send({ addressId: a.body.address.id, deliveryDate: win.date, window: win.window });
    expect(o.status).toBe(201);
    const csv = await request(app).get('/api/v1/admin/orders/export.csv?type=packing');
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("'=cmd|calc");
    expect(csv.text).not.toMatch(/,=cmd\|calc/);
  });
});

describe('dev OTP confinement', () => {
  const base = { allowDev: true, allowlist: new Set(), isStaff: false };
  it('outside production the fixed code is always allowed', () => {
    expect(devOtpAllowedFor('9000000000', { ...base, isProd: false, isStaff: true })).toBe(true);
  });
  it('in production without ALLOW_DEV_OTP nobody gets it', () => {
    expect(devOtpAllowedFor('9000000000', { ...base, isProd: true, allowDev: false })).toBe(false);
  });
  it('with no allowlist the closed test accepts it for every number, staff included', () => {
    // Staff roles have no other way in: there is no SMS provider to deliver a random code, so
    // excluding them made the procurement, fulfilment and super-admin screens untestable.
    expect(devOtpAllowedFor('9000000000', { ...base, isProd: true, isStaff: true })).toBe(true);
    expect(devOtpAllowedFor('9000000000', { ...base, isProd: true, isStaff: false })).toBe(true);
  });
  it('an allowlist confines it to those numbers — staff on the list, everyone else off', () => {
    const allow = new Set(['9000000000']);
    expect(
      devOtpAllowedFor('9000000000', { ...base, isProd: true, isStaff: true, allowlist: allow }),
    ).toBe(true);
    // Confinement applies to ordinary customers too, not just staff.
    expect(
      devOtpAllowedFor('9111111111', { ...base, isProd: true, isStaff: false, allowlist: allow }),
    ).toBe(false);
    expect(
      devOtpAllowedFor('9222222222', { ...base, isProd: true, isStaff: true, allowlist: allow }),
    ).toBe(false);
  });
});

describe('one customer can never reach another customer', () => {
  /** Sign in, save an address, fill a basket and place an order. Returns the token + order. */
  async function customerWithOrder(mobile, flat) {
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
    const token = v.body.accessToken;
    const { body: c } = await request(app).get('/api/v1/communities');
    const community = c.communities[0];
    const a = await request(app)
      .post('/api/v1/addresses')
      .set(auth(token))
      .send({ communityId: community.id, block: community.blocks[0], flat, floor: '3' });
    const { body: cat } = await request(app).get('/api/v1/catalog?limit=100').set(auth(token));
    for (const prod of (cat.products || [])
      .filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE')
      .slice(0, 8)) {
      await request(app)
        .put('/api/v1/cart/items')
        .set(auth(token))
        .send({ productId: prod.id, quantity: 4 });
    }
    const w = await request(app)
      .get(`/api/v1/delivery-windows?addressId=${a.body.address.id}`)
      .set(auth(token));
    const win = (w.body.windows || []).find((x) => x.isOpen);
    const r = await request(app)
      .post('/api/v1/orders')
      .set(auth(token))
      .send({ addressId: a.body.address.id, deliveryDate: win.date, window: win.window });
    expect(r.status).toBe(201);
    return { token, order: r.body.order, addressId: a.body.address.id };
  }

  it("another customer's order reads as not found, and cannot be cancelled", async () => {
    const owner = await customerWithOrder('9777001001', '301');
    const stranger = await customerWithOrder('9777001002', '302');

    // Not 403 — 404. A stranger should not even learn that the order exists.
    const read = await request(app)
      .get(`/api/v1/orders/${owner.order.id}`)
      .set(auth(stranger.token));
    expect(read.status).toBe(404);

    const cancel = await request(app)
      .post(`/api/v1/orders/${owner.order.id}/cancel`)
      .set(auth(stranger.token))
      .send({});
    expect(cancel.status).toBe(404);

    // The owner is unaffected by the attempt.
    const mine = await request(app).get(`/api/v1/orders/${owner.order.id}`).set(auth(owner.token));
    expect(mine.status).toBe(200);
    expect(mine.body.order.status).not.toBe('CANCELLED');
  });

  it("a stranger cannot deliver to, or destroy, someone else's address", async () => {
    const owner = await customerWithOrder('9777001003', '303');
    const stranger = await customerWithOrder('9777001004', '304');
    const w = await request(app)
      .get(`/api/v1/delivery-windows?addressId=${owner.addressId}`)
      .set(auth(stranger.token));
    const win = (w.body.windows || []).find((x) => x.isOpen);
    const r = await request(app)
      .post('/api/v1/orders')
      .set(auth(stranger.token))
      .send({ addressId: owner.addressId, deliveryDate: win?.date, window: win?.window });
    expect(r.status).toBeGreaterThanOrEqual(400);
    const del = await request(app)
      .delete(`/api/v1/addresses/${owner.addressId}`)
      .set(auth(stranger.token));
    expect(del.status).toBeGreaterThanOrEqual(400);
  });

  it('the order list only ever contains your own orders', async () => {
    const owner = await customerWithOrder('9777001005', '305');
    const stranger = await customerWithOrder('9777001006', '306');
    const list = await request(app).get('/api/v1/orders').set(auth(stranger.token));
    expect(list.status).toBe(200);
    const ids = (list.body.orders || []).map((o) => o.id);
    expect(ids).not.toContain(owner.order.id);
  });
});
