/**
 * Everything built from the 17 Nov 2026 business review, end to end through the HTTP API:
 * promoter codes, neighbour invites and their ₹30 reward, "how did you hear", the waitlist and
 * community requests, ratings with replies, expenses and the full P&L, buffer/wastage, reminders,
 * capacity, delay reasons, the customer date filter, and who may see what.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { getOrder, updatePaymentSettings } = await import('../src/store.js');
const { getWallet } = await import('../src/customer-store.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const A = '/api/v1/admin';
let seq = 0;

async function shopper() {
  const mobile = `93350${String(++seq).padStart(5, '0')}`;
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  const { body: c } = await request(app).get('/api/v1/communities');
  const com = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set(auth(token))
    .send({ communityId: com.id, block: com.blocks[0], flat: `${100 + seq}`, floor: '1' });
  return { mobile, token, addressId: a.body.address.id, community: com };
}

async function fillBasket(ctx) {
  const { body: cat } = await request(app).get(`${A}/products`);
  const avail = cat.products.filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE');
  const start = (seq * 7) % avail.length;
  for (let n = 0; n < avail.length; n += 1) {
    const p = avail[(start + n) % avail.length];
    const put = await request(app)
      .put('/api/v1/cart/items')
      .set(auth(ctx.token))
      .send({ productId: p.id, quantity: 3 });
    if (put.status >= 400) continue;
    const cart = await request(app).get('/api/v1/cart').set(auth(ctx.token));
    if (cart.body.cart?.meetsMinimum && cart.body.cart.items.length >= 3) break;
  }
  const w = await request(app)
    .get(`/api/v1/delivery-windows?addressId=${ctx.addressId}`)
    .set(auth(ctx.token));
  return w.body.windows.find((x) => x.isOpen);
}

async function placeOrder(ctx, extra = {}) {
  const win = await fillBasket(ctx);
  return request(app)
    .post('/api/v1/orders')
    .set(auth(ctx.token))
    .send({
      addressId: ctx.addressId,
      deliveryDate: win.date,
      window: win.window,
      paymentMethod: 'COD',
      ...extra,
    });
}

/** Walk an order to DELIVERED the way the delivery team does: packing → out → code + cash. */
async function deliver(orderId) {
  await request(app).patch(`${A}/orders/${orderId}/status`).send({ status: 'PACKING' });
  await request(app).patch(`${A}/orders/${orderId}/status`).send({ status: 'OUT_FOR_DELIVERY' });
  const o = getOrder(orderId);
  const r = await request(app)
    .post(`${A}/orders/${orderId}/deliver`)
    .send({ otp: o.deliveryOtp, collectedPaise: Number(o.totalPaise) });
  expect(r.status).toBe(200);
  return r.body.order;
}

beforeAll(() => {
  updatePaymentSettings({ codEnabled: true, codMaxOrderPaise: 500000, deliveryOtpEnabled: true });
});

describe('setup status', () => {
  it('reports the table as ready in a memory-only process', async () => {
    const r = await request(app).get(`${A}/business/status`);
    expect(r.status).toBe(200);
    expect(r.body.ready).toBe(true);
  });
});

describe('promoter codes', () => {
  it('admin can add, edit, list and delete a promoter; bad codes are refused', async () => {
    const bad = await request(app)
      .post(`${A}/growth/promoters`)
      .send({ code: 'NB1234', name: 'X' });
    expect(bad.status).toBe(422);
    const c = await request(app)
      .post(`${A}/growth/promoters`)
      .send({ code: 'ravi01', name: 'Ravi', stall: 'Muppa Melody stall' });
    expect(c.status).toBe(201);
    expect(c.body.promoter.code).toBe('RAVI01');
    const dup = await request(app)
      .post(`${A}/growth/promoters`)
      .send({ code: 'RAVI01', name: 'Again' });
    expect(dup.status).toBe(409);
    const p = await request(app).patch(`${A}/growth/promoters/RAVI01`).send({ name: 'Ravi K' });
    expect(p.body.promoter.name).toBe('Ravi K');
    const tmp = await request(app)
      .post(`${A}/growth/promoters`)
      .send({ code: 'TEMP9', name: 'Temp' });
    expect(tmp.status).toBe(201);
    const del = await request(app).delete(`${A}/growth/promoters/TEMP9`);
    expect(del.status).toBe(200);
    const list = await request(app).get(`${A}/growth/promoters`);
    expect(list.body.promoters.map((x) => x.code)).toContain('RAVI01');
    expect(list.body.promoters.map((x) => x.code)).not.toContain('TEMP9');
  });

  it('an order with a promoter code is credited to that promoter and stall', async () => {
    const s = await shopper();
    const check = await request(app)
      .post('/api/v1/growth/check-code')
      .set(auth(s.token))
      .send({ code: 'ravi01' });
    expect(check.status).toBe(200);
    expect(check.body.kind).toBe('PROMOTER');
    const o = await placeOrder(s, { code: 'RAVI01', heardFrom: 'COUNTER' });
    expect(o.status).toBe(201);
    const ins = await request(app).get(`${A}/insights`);
    const ravi = ins.body.acquisition.byPromoter.find((p) => p.code === 'RAVI01');
    expect(ravi.orders).toBeGreaterThanOrEqual(1);
    expect(ravi.firstOrders).toBeGreaterThanOrEqual(1);
    expect(
      ins.body.acquisition.byChannel.find((c) => c.key === 'STALL').firstOrders,
    ).toBeGreaterThanOrEqual(1);
    expect(ins.body.acquisition.byHeardFrom.find((h) => h.key === 'COUNTER')).toBeTruthy();
    const src = await request(app).get(`${A}/orders/${o.body.order.id}/source`);
    expect(src.body.promoterCode).toBe('RAVI01');
  });

  it('an unknown code is refused before the order is taken', async () => {
    const s = await shopper();
    const r = await placeOrder(s, { code: 'NOSUCH' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('BAD_CODE');
  });
});

describe('neighbour invites', () => {
  it('pays the inviter once, when the invited first order is delivered — never on placing it', async () => {
    const inviter = await shopper();
    const inv = await request(app).get('/api/v1/growth/invite').set(auth(inviter.token));
    expect(inv.status).toBe(200);
    expect(inv.body.code).toMatch(/^NB[A-Z0-9]{6}$/);
    expect(inv.body.shareText).toContain(inv.body.code);
    expect(inv.body.link).toContain('fooducia.health/join');

    // Your own code is refused.
    const self = await request(app)
      .post('/api/v1/growth/check-code')
      .set(auth(inviter.token))
      .send({ code: inv.body.code });
    expect(self.status).toBe(422);

    const friend = await shopper();
    const first = await request(app).get('/api/v1/growth/first-order').set(auth(friend.token));
    expect(first.body.askHeardFrom).toBe(true);
    const placed = await placeOrder(friend, { code: inv.body.code, heardFrom: 'NEIGHBOUR' });
    expect(placed.status).toBe(201);
    const inviterId =
      getOrder(placed.body.order.id) &&
      (await request(app).get('/api/v1/me').set(auth(inviter.token))).body.customer?.id;
    const before = getWallet(inviterId).balancePaise;

    await deliver(placed.body.order.id);
    expect(getWallet(inviterId).balancePaise - before).toBe(3000);

    // A second delivery for the same new customer pays nothing more.
    const again = await placeOrder(friend);
    expect(again.status).toBe(201);
    await deliver(again.body.order.id);
    expect(getWallet(inviterId).balancePaise - before).toBe(3000);

    const after = await request(app).get('/api/v1/growth/invite').set(auth(inviter.token));
    expect(after.body.rewarded).toBe(1);
    expect(after.body.earnedPaise).toBe('3000');
    const refs = await request(app).get(`${A}/growth/referrals`);
    expect(refs.body.totals.rewarded).toBeGreaterThanOrEqual(1);

    // An invite code on a SECOND order is refused.
    const late = await request(app)
      .post('/api/v1/growth/check-code')
      .set(auth(friend.token))
      .send({ code: inv.body.code });
    expect(late.status).toBe(422);
  });

  it('settings change the reward, and are admin-only', async () => {
    const r = await request(app)
      .put(`${A}/growth/settings`)
      .send({ referrerRewardPaise: 5000, waitlistOpenAt: 15 });
    expect(r.status).toBe(200);
    expect(r.body.settings.referrerRewardPaise).toBe(5000);
    const back = await request(app)
      .put(`${A}/growth/settings`)
      .send({ referrerRewardPaise: 3000, waitlistOpenAt: 20 });
    expect(back.body.settings.waitlistOpenAt).toBe(20);
  });
});

describe('waitlist and community requests', () => {
  it('admin pre-loads a community, customers join and leave, requests are private until approved', async () => {
    const add = await request(app)
      .post(`${A}/growth/waitlist`)
      .send({
        name: 'Honer Aquantis',
        area: 'Nallagandla',
        towers: 12,
        flats: 1200,
        distanceKm: 1.5,
      });
    expect(add.status).toBe(201);
    const wid = add.body.community.id;

    const a = await shopper();
    const b = await shopper();
    const list = await request(app).get('/api/v1/growth/waitlist?q=aquan').set(auth(a.token));
    expect(list.body.waitlist.map((w) => w.id)).toContain(wid);
    const j = await request(app).post(`/api/v1/growth/waitlist/${wid}/join`).set(auth(a.token));
    expect(j.body.community.joined).toBe(true);
    expect(j.body.community.waiting).toBe(1);
    await request(app).post(`/api/v1/growth/waitlist/${wid}/join`).set(auth(b.token));
    const twice = await request(app).post(`/api/v1/growth/waitlist/${wid}/join`).set(auth(b.token));
    expect(twice.body.community.waiting).toBe(2); // joining twice does not count twice
    const leave = await request(app)
      .delete(`/api/v1/growth/waitlist/${wid}/join`)
      .set(auth(b.token));
    expect(leave.body.community.joined).toBe(false);
    expect(leave.body.community.waiting).toBe(1);

    const req = await request(app)
      .post('/api/v1/growth/community-requests')
      .set(auth(a.token))
      .send({ name: 'Green Meadows', area: 'Tellapur', towers: 8 });
    expect(req.status).toBe(201);
    expect(req.body.community.status).toBe('REQUESTED');
    // Not shown to someone else until the team approves it…
    const other = await request(app).get('/api/v1/growth/waitlist').set(auth(b.token));
    expect(other.body.waitlist.map((w) => w.name)).not.toContain('Green Meadows');
    // …and the admin sees it with who is waiting.
    const adm = await request(app).get(`${A}/growth/waitlist`);
    const gm = adm.body.waitlist.find((w) => w.name === 'Green Meadows');
    expect(gm.status).toBe('REQUESTED');
    expect(gm.waiting).toBe(1);
    const ok = await request(app)
      .patch(`${A}/growth/waitlist/${gm.id}`)
      .send({ status: 'WAITLIST' });
    expect(ok.body.community.status).toBe('WAITLIST');
    const now = await request(app).get('/api/v1/growth/waitlist').set(auth(b.token));
    expect(now.body.waitlist.map((w) => w.name)).toContain('Green Meadows');
    const del = await request(app).delete(`${A}/growth/waitlist/${gm.id}`);
    expect(del.status).toBe(200);
  });
});

describe('ratings and replies', () => {
  it('rate only after delivery; admin replies; the customer sees the reply', async () => {
    const s = await shopper();
    const o = await placeOrder(s);
    const id = o.body.order.id;
    const early = await request(app)
      .put(`/api/v1/orders/${id}/review`)
      .set(auth(s.token))
      .send({ rating: 5 });
    expect(early.status).toBe(409);
    await deliver(id);
    const r = await request(app)
      .put(`/api/v1/orders/${id}/review`)
      .set(auth(s.token))
      .send({ rating: 4, comment: 'Spinach was lovely', tags: ['Fresh', 'On time'] });
    expect(r.status).toBe(200);
    const list = await request(app).get(`${A}/feedback/reviews?unreplied=1`);
    expect(list.body.reviews.find((x) => x.orderId === id).rating).toBe(4);
    const rep = await request(app).put(`${A}/feedback/reviews/${id}`).send({ reply: 'Thank you!' });
    expect(rep.body.review.reply).toBe('Thank you!');
    const mine = await request(app).get(`/api/v1/orders/${id}/review`).set(auth(s.token));
    expect(mine.body.review.reply).toBe('Thank you!');
    // Another customer cannot read or write it.
    const x = await shopper();
    const no = await request(app).get(`/api/v1/orders/${id}/review`).set(auth(x.token));
    expect(no.status).toBe(404);
  });
});

describe('finance', () => {
  it('expenses: add, edit, import, delete — and they come off profit', async () => {
    const today = new Date(Date.now() + 330 * 60e3).toISOString().slice(0, 10);
    const before = await request(app).get(`${A}/finance?from=${today}&to=${today}`);
    const add = await request(app)
      .post(`${A}/finance/expenses`)
      .send({
        date: today,
        category: 'FUEL',
        kind: 'VARIABLE',
        amountPaise: 150000,
        note: 'Van diesel',
      });
    expect(add.status).toBe(201);
    const eid = add.body.expense.id;
    const edit = await request(app)
      .patch(`${A}/finance/expenses/${eid}`)
      .send({ amountPaise: 200000 });
    expect(edit.body.expense.amountPaise).toBe('200000');
    const imp = await request(app)
      .post(`${A}/finance/expenses/import`)
      .send({
        rows: [{ date: today, category: 'MARKETING', kind: 'VARIABLE', amountPaise: 50000 }],
      });
    expect(imp.body.imported).toBe(1);
    const after = await request(app).get(`${A}/finance?from=${today}&to=${today}`);
    const diff =
      Number(before.body.lines.netProfitBeforeTaxPaise) -
      Number(after.body.lines.netProfitBeforeTaxPaise);
    expect(diff).toBe(250000);
    expect(after.body.expensesByCategory.find((c) => c.category === 'FUEL').totalPaise).toBe(
      '200000',
    );
    const bad = await request(app)
      .post(`${A}/finance/expenses`)
      .send({ date: today, category: 'FUEL', kind: 'VARIABLE', amountPaise: 0 });
    expect(bad.status).toBe(422);
    const del = await request(app).delete(`${A}/finance/expenses/${eid}`);
    expect(del.status).toBe(200);
    const tax = await request(app).put(`${A}/finance/settings`).send({ incomeTaxPct: 30 });
    expect(tax.body.settings.incomeTaxPct).toBe(30);
  });

  it('a monthly expense is spread across the days of the range', async () => {
    const add = await request(app)
      .post(`${A}/finance/expenses`)
      .send({
        date: '2026-01-01',
        category: 'HOSTING',
        kind: 'FIXED',
        amountPaise: 365000,
        recurring: 'MONTHLY',
      });
    const r = await request(app).get(`${A}/finance?from=2026-03-01&to=2026-03-10`);
    // ₹3,650 a month = ₹43,800 a year = ₹120 a day → 10 days = ₹1,200.
    expect(r.body.expensesByCategory.find((c) => c.category === 'HOSTING').fixedPaise).toBe(
      '120000',
    );
    await request(app).delete(`${A}/finance/expenses/${add.body.expense.id}`);
  });
});

describe('buffer and wastage', () => {
  it('records what happened to the buffer and reports its cost', async () => {
    const s = await shopper();
    const o = await placeOrder(s);
    const date = o.body.order.deliveryDate;
    const w = await request(app).get(`${A}/procurement/wastage?from=${date}&to=${date}`);
    expect(w.status).toBe(200);
    const line = w.body.days[0];
    expect(line.extraQty).toBeGreaterThanOrEqual(0);
    const put = await request(app)
      .put(`${A}/procurement/wastage/${date}/${line.productId}`)
      .send({ usedQty: 0, wastedQty: line.extraQty, note: 'No replacements needed' });
    expect(put.status).toBe(200);
    const again = await request(app).get(`${A}/procurement/wastage?from=${date}&to=${date}`);
    const rec = again.body.days.find((d) => d.productId === line.productId);
    expect(rec.recorded).toBe(true);
    expect(again.body.totals.recordedLines).toBeGreaterThanOrEqual(1);
  });
});

describe('routine and promise', () => {
  it('reminders, capacity and delay reasons can be set and read back', async () => {
    const rem = await request(app)
      .post(`${A}/insights/reminders`)
      .send({ channel: 'WHATSAPP', note: 'Cut-off at 5:30' });
    expect(rem.status).toBe(201);
    const { body: c } = await request(app).get('/api/v1/communities');
    const cap = await request(app)
      .put(`${A}/insights/capacity/${c.communities[0].id}`)
      .send({ capacity: 40 });
    expect(cap.body.capacity).toBe(40);
    const ins = await request(app).get(`${A}/insights`);
    expect(ins.body.routine.reminders.map((r) => r.id)).toContain(rem.body.reminder.id);
    expect(ins.body.routine.communities.find((x) => x.id === c.communities[0].id).capacity).toBe(
      40,
    );
    expect(typeof ins.body.promise.onTimePct).toBe('number');
    expect(typeof ins.body.repeat.secondOrderWithin7Pct).toBe('number');
    expect(Array.isArray(ins.body.offers.coupons)).toBe(true);
    const s = await shopper();
    const o = await placeOrder(s);
    const d = await request(app)
      .put(`${A}/insights/delays/${o.body.order.id}`)
      .send({ reason: 'TRAFFIC' });
    expect(d.body.delay.reason).toBe('TRAFFIC');
    const bad = await request(app)
      .put(`${A}/insights/delays/${o.body.order.id}`)
      .send({ reason: 'ALIENS' });
    expect(bad.status).toBe(422);
    const del = await request(app).delete(`${A}/insights/reminders/${rem.body.reminder.id}`);
    expect(del.status).toBe(200);
  });

  it('products: winners and losers', async () => {
    const r = await request(app).get(`${A}/insights/products`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.winners)).toBe(true);
    expect(Array.isArray(r.body.losers)).toBe(true);
    expect(r.body.products.length).toBeGreaterThan(0);
  });
});

describe('customers by date', () => {
  it('filters to a range and shows how long between orders', async () => {
    const today = new Date(Date.now() + 330 * 60e3).toISOString().slice(0, 10);
    const r = await request(app).get(`${A}/customers?from=${today}&to=${today}`);
    expect(r.status).toBe(200);
    expect(r.body.customers.length).toBeGreaterThan(0);
    expect(r.body.customers.every((c) => c.ordersInRange > 0)).toBe(true);
    expect(r.body.customers[0]).toHaveProperty('avgDaysBetween');
    const none = await request(app).get(`${A}/customers?from=2001-01-01&to=2001-01-02`);
    expect(none.body.customers).toHaveLength(0);
  });
});

describe('who may see what', () => {
  it('a delivery-role staff member cannot open finance, growth or insights', async () => {
    // Seed FULFILMENT number from access-store.
    const mobile = '9848022222';
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
    const h = auth(v.body.accessToken);
    for (const p of [
      '/finance',
      '/growth/promoters',
      '/insights',
      '/feedback/reviews',
      '/finance/expenses',
    ]) {
      const r = await request(app).get(`${A}${p}`).set(h);
      expect(r.status, p).toBe(403);
    }
  });

  it('a customer token cannot reach the admin routes', async () => {
    const s = await shopper();
    const r = await request(app).get(`${A}/finance`).set(auth(s.token));
    expect(r.status).toBe(401);
  });
});

describe('account deletion', () => {
  it('removes the customer’s waitlist places and invite code', async () => {
    const add = await request(app)
      .post(`${A}/growth/waitlist`)
      .send({ name: 'Deletion Test Towers' });
    const s = await shopper();
    await request(app)
      .post(`/api/v1/growth/waitlist/${add.body.community.id}/join`)
      .set(auth(s.token));
    const inv = await request(app).get('/api/v1/growth/invite').set(auth(s.token));
    const del = await request(app).delete('/api/v1/me').set(auth(s.token));
    expect(del.status).toBe(200);
    const list = await request(app).get(`${A}/growth/waitlist`);
    expect(list.body.waitlist.find((w) => w.id === add.body.community.id).waiting).toBe(0);
    const other = await shopper();
    const code = await request(app)
      .post('/api/v1/growth/check-code')
      .set(auth(other.token))
      .send({ code: inv.body.code });
    expect(code.status).toBe(422);
  });
});
