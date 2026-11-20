/**
 * The admin CRUD added on 20 Nov 2026 so everything is managed from the admin website:
 * categories, customer accounts (lookup, rename, wallet credit/debit, deletion on request and
 * cancel, scheduled deletions list), correcting an order's source, voiding/deleting a pending
 * referral, editing a logged reminder — and who may do each.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { updatePaymentSettings, getOrder } = await import('../src/store.js');
const { getWallet } = await import('../src/customer-store.js');
const { getOps } = await import('../src/ops-store.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const A = '/api/v1/admin';
let seq = 0;
async function shopper() {
  const mobile = `93480${String(++seq).padStart(5, '0')}`;
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const me = await request(app).get('/api/v1/me').set(auth(v.body.accessToken));
  const { body: c } = await request(app).get('/api/v1/communities');
  const com = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set(auth(v.body.accessToken))
    .send({ communityId: com.id, block: com.blocks[0], flat: `${600 + seq}`, floor: '6' });
  return {
    mobile,
    token: v.body.accessToken,
    id: me.body.customer.id,
    addressId: a.body.address.id,
  };
}
async function order(s, extra = {}) {
  const { body: cat } = await request(app).get(`${A}/products`);
  for (const p of cat.products.filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE')) {
    await request(app)
      .put('/api/v1/cart/items')
      .set(auth(s.token))
      .send({ productId: p.id, quantity: 3 });
    const cart = await request(app).get('/api/v1/cart').set(auth(s.token));
    if (cart.body.cart?.meetsMinimum) break;
  }
  const w = await request(app)
    .get(`/api/v1/delivery-windows?addressId=${s.addressId}`)
    .set(auth(s.token));
  const win = w.body.windows.find((x) => x.isOpen);
  return request(app)
    .post('/api/v1/orders')
    .set(auth(s.token))
    .send({
      addressId: s.addressId,
      deliveryDate: win.date,
      window: win.window,
      paymentMethod: 'COD',
      ...extra,
    });
}

beforeAll(() =>
  updatePaymentSettings({ codEnabled: true, codMaxOrderPaise: 500000, deliveryOtpEnabled: true }),
);

describe('categories', () => {
  it('create, rename, reorder, refuse deleting one with products, delete an empty one', async () => {
    const made = await request(app)
      .post(`${A}/categories`)
      .send({ name: 'Mushrooms', tint: 'sand' });
    expect(made.status).toBe(201);
    const id = made.body.category.id;
    expect((await request(app).post(`${A}/categories`).send({ name: 'Mushrooms' })).status).toBe(
      409,
    );
    const ed = await request(app)
      .patch(`${A}/categories/${id}`)
      .send({ name: 'Mushrooms & fungi', order: 0 });
    expect(ed.body.category.name).toBe('Mushrooms & fungi');
    const list = await request(app).get(`${A}/categories`);
    expect(list.body.categories[0].id).toBe(id); // order 0 sorts first
    expect((await request(app).delete(`${A}/categories/cat_leafy`)).status).toBe(409);
    expect((await request(app).delete(`${A}/categories/${id}`)).status).toBe(200);
    expect((await request(app).delete(`${A}/categories/${id}`)).status).toBe(404);
  });
});

describe('customer accounts', () => {
  it('lookup by number (masked), rename, wallet credit and debit with a reason', async () => {
    const s = await shopper();
    const bad = await request(app).get(`${A}/customer-lookup?mobile=123`);
    expect(bad.status).toBe(422);
    const found = await request(app).get(`${A}/customer-lookup?mobile=${s.mobile}`);
    expect(found.body.account.key).toBe(s.id);
    expect(JSON.stringify(found.body)).not.toContain(s.mobile);

    const ren = await request(app)
      .patch(`${A}/customers/${s.id}/account`)
      .send({ name: 'Lakshmi R' });
    expect(ren.body.account.name).toBe('Lakshmi R');

    const before = getWallet(s.id).balancePaise;
    const cr = await request(app)
      .post(`${A}/customers/${s.id}/wallet`)
      .send({ direction: 'CREDIT', amountPaise: 5000, reason: 'Sorry for the late delivery' });
    expect(cr.status).toBe(201);
    expect(getWallet(s.id).balancePaise - before).toBe(5000);
    const over = await request(app)
      .post(`${A}/customers/${s.id}/wallet`)
      .send({ direction: 'DEBIT', amountPaise: 9_000_00, reason: 'Too much' });
    expect(over.status).toBe(422);
    const db = await request(app)
      .post(`${A}/customers/${s.id}/wallet`)
      .send({ direction: 'DEBIT', amountPaise: 2000, reason: 'Credited twice by mistake' });
    expect(db.status).toBe(201);
    const acct = await request(app).get(`${A}/customers/${s.id}/account`);
    expect(acct.body.account.walletBalancePaise).toBe(String(before + 3000));
    expect(acct.body.ledger[0].note).toBe('Credited twice by mistake');
    // The customer sees it in their own wallet.
    const mine = await request(app).get('/api/v1/wallet').set(auth(s.token));
    expect(JSON.stringify(mine.body)).toContain('Sorry for the late delivery');
  });

  it('delete on request: blocked by an order in progress; scheduled, listed, cancelled', async () => {
    const s = await shopper();
    const o = await order(s);
    expect(o.status).toBe(201);
    const blocked = await request(app)
      .post(`${A}/customers/${s.id}/deletion`)
      .send({ reason: 'Asked by phone' });
    expect(blocked.status).toBe(409);
    await request(app)
      .patch(`${A}/orders/${o.body.order.id}/status`)
      .send({ status: 'CANCELLED', reason: 'test' });
    const ok = await request(app)
      .post(`${A}/customers/${s.id}/deletion`)
      .send({ reason: 'Asked by phone' });
    expect(ok.status).toBe(200);
    expect(ok.body.scheduled).toBe(true);
    const list = await request(app).get(`${A}/deletions`);
    expect(list.body.deletions.map((d) => d.key)).toContain(s.id);
    const cancel = await request(app).delete(`${A}/customers/${s.id}/deletion`);
    expect(cancel.status).toBe(200);
    expect(getOps('deletion', s.id)).toBeNull();
  });
});

describe('order source and referrals', () => {
  it('corrects the promoter and answer on a first order', async () => {
    await request(app).post(`${A}/growth/promoters`).send({ code: 'MGR01', name: 'Fix me' });
    const s = await shopper();
    const o = await order(s, { heardFrom: 'OTHER' });
    const id = o.body.order.id;
    const bad = await request(app)
      .patch(`${A}/orders/${id}/source`)
      .send({ promoterCode: 'NOPE99' });
    expect(bad.status).toBe(422);
    const fix = await request(app)
      .patch(`${A}/orders/${id}/source`)
      .send({ promoterCode: 'MGR01', heardFrom: 'COUNTER' });
    expect(fix.status).toBe(200);
    const src = await request(app).get(`${A}/orders/${id}/source`);
    expect(src.body.promoterCode).toBe('MGR01');
    expect(src.body.heardFromKey).toBe('COUNTER');
    expect(getOrder(id)).toBeTruthy();
  });

  it('voids a pending referral so no reward is paid; a settled one cannot change', async () => {
    const inviter = await shopper();
    const inv = await request(app).get('/api/v1/growth/invite').set(auth(inviter.token));
    const friend = await shopper();
    const o = await order(friend, { code: inv.body.code });
    expect(o.status).toBe(201);
    const v = await request(app)
      .patch(`${A}/growth/referrals/${friend.id}`)
      .send({ status: 'VOID', reason: 'Same household' });
    expect(v.status).toBe(200);
    expect(v.body.referral.status).toBe('VOID');
    const again = await request(app)
      .patch(`${A}/growth/referrals/${friend.id}`)
      .send({ status: 'VOID', reason: 'x again' });
    expect(again.status).toBe(409);
    expect((await request(app).delete(`${A}/growth/referrals/nope`)).status).toBe(404);
  });

  it('edits a logged reminder', async () => {
    const r = await request(app)
      .post(`${A}/insights/reminders`)
      .send({ channel: 'WHATSAPP', note: 'Group post' });
    const id = r.body.reminder.id;
    const ed = await request(app)
      .patch(`${A}/insights/reminders/${id}`)
      .send({ note: 'Muppa residents group, 5 PM' });
    expect(ed.body.reminder.note).toBe('Muppa residents group, 5 PM');
  });
});

describe('who may do it', () => {
  it('delivery staff are refused everywhere here', async () => {
    const mobile = '9848022222';
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
    const h = auth(v.body.accessToken);
    for (const [m, p] of [
      ['post', '/categories'],
      ['get', '/deletions'],
      ['get', '/customer-lookup?mobile=9000000000'],
      ['post', '/customers/cus_x/wallet'],
      ['patch', '/orders/ord_x/source'],
      ['patch', '/growth/referrals/x'],
    ]) {
      const r = await request(app)[m](`${A}${p}`).set(h).send({});
      expect(r.status, `${m} ${p}`).toBe(403);
    }
  });
});
