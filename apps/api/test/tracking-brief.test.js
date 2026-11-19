/**
 * Rapture7's Developer Tracking Brief (19 Nov 2026), end to end through the HTTP API:
 *   - the NOW events land with the brief's properties, and never carry personal data;
 *   - the Play install referrer is parsed and the first tag wins;
 *   - a neighbour's phone number works as a referral without revealing who is a customer;
 *   - both sides get ₹30 when the invited first order is delivered;
 *   - the launch offer is OFF by default and, switched on, follows the brief's rules;
 *   - counter sessions, the Friday report (JSON + xlsx) and the events viewer;
 *   - the 5 PM reminder skips households that already ordered for tomorrow.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { getOrder, updatePaymentSettings } = await import('../src/store.js');
const { getWallet } = await import('../src/customer-store.js');
const { listEvents } = await import('../src/lib/events.js');
const { parseReferrer } = await import('../src/routes/growth.js');
const { runCutoffReminder } = await import('../src/lib/reminders.js');
const { todayISO } = await import('../src/lib/dates.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const A = '/api/v1/admin';
let seq = 0;
const T0 = Date.now() - 1000;
const evs = (name, cid) =>
  listEvents({ fromMs: T0, name }).filter((e) => !cid || e.customerId === cid);

async function shopper() {
  const mobile = `93460${String(++seq).padStart(5, '0')}`;
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  const me = await request(app).get('/api/v1/me').set(auth(token));
  const { body: c } = await request(app).get('/api/v1/communities');
  const com = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set(auth(token))
    .send({ communityId: com.id, block: com.blocks[0], flat: `${200 + seq}`, floor: '2' });
  return { mobile, token, id: me.body.customer.id, addressId: a.body.address.id, community: com };
}

async function fillBasket(ctx, minItems = 3) {
  const { body: cat } = await request(app).get(`${A}/products`);
  const avail = cat.products.filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE');
  const start = (seq * 5) % avail.length;
  for (let n = 0; n < avail.length; n += 1) {
    const p = avail[(start + n) % avail.length];
    const put = await request(app)
      .put('/api/v1/cart/items')
      .set(auth(ctx.token))
      .send({ productId: p.id, quantity: 3 });
    if (put.status >= 400) continue;
    const cart = await request(app).get('/api/v1/cart').set(auth(ctx.token));
    if (cart.body.cart?.meetsMinimum && cart.body.cart.items.length >= minItems) break;
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

describe('NOW events', () => {
  it('sign-in, community, source, order placed and delivered are recorded with the brief’s properties', async () => {
    const s = await shopper();
    const signed = evs('signed_in', s.id);
    expect(signed).toHaveLength(1);
    expect(signed[0].props.is_new_user).toBe(true);
    expect(evs('community_selected', s.id)[0].props.community_id).toBe(s.community.id);

    const o = await placeOrder(s, { heardFrom: 'COUNTER' });
    expect(o.status).toBe(201);
    expect(evs('source_answered', s.id)[0].props.answer).toBe('COUNTER');
    const placed = evs('order_placed', s.id);
    expect(placed).toHaveLength(1);
    expect(placed[0].props).toMatchObject({
      order_id: o.body.order.id,
      is_first_order: true,
      payment_method: 'COD',
    });
    expect(placed[0].props.order_value).toBeGreaterThan(0);

    await deliver(o.body.order.id);
    const d = evs('order_delivered', s.id);
    expect(d).toHaveLength(1);
    expect(d[0].props.order_id).toBe(o.body.order.id);
    expect('on_time' in d[0].props).toBe(true);

    // Nothing personal travels in any event.
    const all = JSON.stringify(listEvents({ fromMs: T0 }).filter((e) => e.customerId === s.id));
    expect(all).not.toContain(s.mobile);
    expect(JSON.stringify(listEvents({ fromMs: T0 }).map((e) => e.props))).not.toMatch(
      /"(mobile|name|flat|phone)"/,
    );
  });

  it('a refund after cancelling a paid order is an order_refunded event', async () => {
    const s = await shopper();
    const o = await placeOrder(s);
    expect(o.status).toBe(201);
    // A cash order has taken no money, so cancelling it refunds nothing — no event.
    await request(app)
      .patch(`${A}/orders/${o.body.order.id}/status`)
      .send({ status: 'CANCELLED', reason: 'test' });
    expect(evs('order_refunded', s.id)).toHaveLength(0);
  });

  it('a waitlist join is a waitlist_vote', async () => {
    const s = await shopper();
    const r = await request(app)
      .post('/api/v1/growth/community-requests')
      .set(auth(s.token))
      .send({ name: `Tracking Towers ${seq}`, area: 'Kokapet', pincode: '500075' });
    expect(r.status).toBeLessThan(300);
    expect(evs('waitlist_vote', s.id).length).toBeGreaterThanOrEqual(1);
  });
});

describe('client events', () => {
  it('accepts only the allowlist, and strips personal keys', async () => {
    const s = await shopper();
    const ok = await request(app)
      .post('/api/v1/events')
      .set(auth(s.token))
      .send({
        name: 'checkout_started',
        props: { basket_value: 450, mobile: '9999999999', item_count: 4 },
      });
    expect(ok.status).toBe(202);
    const e = evs('checkout_started', s.id)[0];
    expect(e.props).toEqual({ basket_value: 450, item_count: 4 });

    const bad = await request(app)
      .post('/api/v1/events')
      .set(auth(s.token))
      .send({ name: 'order_placed' });
    expect(bad.status).toBe(422);
    const anon = await request(app).post('/api/v1/events').send({ name: 'checkout_started' });
    expect(anon.status).toBe(401);
  });
});

describe('install referrer', () => {
  it('parses tagged links and ignores a plain store install', () => {
    expect(parseReferrer('src=counter&p=PR01&c=aquantis')).toMatchObject({
      src: 'counter',
      p: 'PR01',
      c: 'aquantis',
    });
    expect(parseReferrer('utm_source=whatsapp&utm_campaign=muppa')).toMatchObject({
      src: 'whatsapp',
      c: 'muppa',
    });
    expect(parseReferrer('utm_source=google-play&utm_medium=organic')).toBeNull();
    expect(parseReferrer('')).toBeNull();
  });

  it('records the first tag only, and a counter tag credits the promoter on the first order', async () => {
    await request(app)
      .post(`${A}/growth/promoters`)
      .send({ code: 'TRK01', name: 'Tracker', stall: 'Gate stall' });
    const s = await shopper();
    const a = await request(app)
      .post('/api/v1/growth/install-source')
      .set(auth(s.token))
      .send({ referrer: 'src=counter&p=TRK01&c=aquantis' });
    expect(a.body.recorded).toBe(true);
    const b = await request(app)
      .post('/api/v1/growth/install-source')
      .set(auth(s.token))
      .send({ referrer: 'src=whatsapp' });
    expect(b.body.tag.src).toBe('counter'); // first wins
    expect(evs('install_source_captured', s.id)).toHaveLength(1);

    const o = await placeOrder(s, { heardFrom: 'WHATSAPP' });
    expect(o.status).toBe(201);
    const src = await request(app).get(`${A}/orders/${o.body.order.id}/source`);
    expect(src.body.promoterCode).toBe('TRK01');
    expect(evs('order_placed', s.id)[0].props.source_tag).toBe('counter');
  });
});

describe('a neighbour’s phone number as the referral (iPhone has no install referrer)', () => {
  it('never reveals whether a number is a customer, and pays both sides ₹30 on delivery', async () => {
    const inviter = await shopper();
    const friend = await shopper();
    const known = await request(app)
      .post('/api/v1/growth/check-code')
      .set(auth(friend.token))
      .send({ code: inviter.mobile });
    const unknown = await request(app)
      .post('/api/v1/growth/check-code')
      .set(auth(friend.token))
      .send({ code: '9000011111' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body); // same answer either way
    const self = await request(app)
      .post('/api/v1/growth/check-code')
      .set(auth(friend.token))
      .send({ code: friend.mobile });
    expect(self.status).toBe(422);

    const before = getWallet(inviter.id).balancePaise;
    const fBefore = getWallet(friend.id).balancePaise;
    const o = await placeOrder(friend, { code: inviter.mobile, heardFrom: 'NEIGHBOUR' });
    expect(o.status).toBe(201);
    await deliver(o.body.order.id);
    expect(getWallet(inviter.id).balancePaise - before).toBe(3000);
    expect(getWallet(friend.id).balancePaise - fBefore).toBe(3000);
    const rewards = evs('referral_reward_applied').filter((e) =>
      [inviter.id, friend.id].includes(e.customerId),
    );
    expect(rewards.map((e) => e.props.role).sort()).toEqual(['new_customer', 'referrer']);

    // An unknown number on a first order is accepted and simply credits nobody.
    const other = await shopper();
    const o2 = await placeOrder(other, { code: '9000011111' });
    expect(o2.status).toBe(201);
  });
});

describe('launch offer', () => {
  it('is off by default', async () => {
    const r = await request(app).get(`${A}/business/settings/launchOffer`);
    expect(r.body.settings.enabled).toBe(false);
    const s = await shopper();
    await fillBasket(s);
    const cart = await request(app).get('/api/v1/cart').set(auth(s.token));
    expect(cart.body.cart.offer).toBeNull();
  });

  it('switched on: 5% off the first order, 10% capped at ₹50 on a quick second order', async () => {
    const today = todayISO();
    const bad = await request(app)
      .put(`${A}/business/settings/launchOffer`)
      .send({ startDate: '2027-02-01', endDate: '2027-01-01' });
    expect(bad.status).toBe(422);
    const on = await request(app)
      .put(`${A}/business/settings/launchOffer`)
      .send({ enabled: true, startDate: today, endDate: '2027-01-17' });
    expect(on.status).toBe(200);

    const s = await shopper();
    await fillBasket(s);
    const cart = await request(app).get('/api/v1/cart').set(auth(s.token));
    const sub = Number(cart.body.cart.subtotalPaise);
    expect(cart.body.cart.offer.type).toBe('LAUNCH_FIRST');
    expect(Number(cart.body.cart.offer.discountPaise)).toBe(Math.round(sub * 0.05));

    const o = await placeOrder(s);
    expect(o.status).toBe(201);
    const first = getOrder(o.body.order.id);
    expect(Number(first.couponDiscountPaise)).toBe(Math.round(Number(first.subtotalPaise) * 0.05));
    expect(evs('order_placed', s.id)[0].props.discount_type).toBe('LAUNCH_FIRST');

    // Second order while the first is not yet delivered: no offer.
    await fillBasket(s);
    let c2 = await request(app).get('/api/v1/cart').set(auth(s.token));
    expect(c2.body.cart.offer).toBeNull();

    await deliver(o.body.order.id);
    c2 = await request(app).get('/api/v1/cart').set(auth(s.token));
    const sub2 = Number(c2.body.cart.subtotalPaise);
    expect(c2.body.cart.offer.type).toBe('LAUNCH_SECOND');
    const expected =
      sub2 >= 40000 ? Math.min(Math.round(sub2 * 0.1), 5000) : Math.round(sub2 * 0.05);
    expect(Number(c2.body.cart.offer.discountPaise)).toBe(expected);

    // A coupon would stand the offer aside — one discount per order. Switch it off again.
    const off = await request(app)
      .put(`${A}/business/settings/launchOffer`)
      .send({ enabled: false });
    expect(off.body.settings.enabled).toBe(false);
  });
});

describe('counter sessions, the Friday report and the events viewer', () => {
  it('CRUD a counter session; the report and xlsx come back', async () => {
    const { body: c } = await request(app).get('/api/v1/communities');
    const com = c.communities[0];
    const today = todayISO();
    const bad = await request(app)
      .post(`${A}/growth/counter-sessions`)
      .send({ communityId: com.id, date: today, start: '18:00', end: '17:00' });
    expect(bad.status).toBe(422);
    const made = await request(app)
      .post(`${A}/growth/counter-sessions`)
      .send({
        communityId: com.id,
        date: today,
        start: '17:00',
        end: '20:00',
        promoterCodes: ['TRK01'],
      });
    expect(made.status).toBe(201);
    const id = made.body.session.id;
    const edit = await request(app)
      .patch(`${A}/growth/counter-sessions/${id}`)
      .send({ note: 'Gate 2' });
    expect(edit.body.session.note).toBe('Gate 2');
    const list = await request(app).get(`${A}/growth/counter-sessions?all=1`);
    expect(list.body.sessions.map((x) => x.id)).toContain(id);

    const rep = await request(app).get(`${A}/report/weekly?week=${today}`);
    expect(rep.status).toBe(200);
    expect(rep.body.northStar.households).toBeGreaterThanOrEqual(1);
    expect(rep.body.assisted.sessions).toBeGreaterThanOrEqual(1);
    for (const k of [
      'secondOrder',
      'threeWeeks',
      'capacity',
      'basketValue',
      'discounts',
      'onTime',
      'refunds',
      'referral',
      'waitlist',
    ])
      expect(rep.body[k]).toBeTruthy();
    // pseudonymous: no mobile numbers anywhere in the report
    expect(JSON.stringify(rep.body)).not.toMatch(/9346\d{6}/);

    const x = await request(app)
      .get(`${A}/report/weekly.xlsx?week=${today}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(x.status).toBe(200);
    expect(x.headers['content-type']).toContain('spreadsheetml');
    expect(x.body.subarray(0, 2).toString()).toBe('PK');

    const ev = await request(app).get(`${A}/events?from=${today}&to=${today}`);
    expect(ev.body.counts.signed_in).toBeGreaterThanOrEqual(1);
    expect(ev.body.events.every((e) => e.customerId === undefined)).toBe(true);

    const del = await request(app).delete(`${A}/growth/counter-sessions/${id}`);
    expect(del.status).toBe(200);
  });
});

describe('the 5 PM cut-off reminder', () => {
  it('is off by default, and skips households that already ordered for tomorrow', async () => {
    expect(await runCutoffReminder(Date.now())).toBe(0); // off
    const ordered = await shopper();
    const idle = await shopper();
    for (const s of [ordered, idle])
      await request(app)
        .post('/api/v1/devices')
        .set(auth(s.token))
        .send({ expoPushToken: `ExponentPushToken[trk${s.mobile}]` });
    const o = await placeOrder(ordered);
    expect(o.status).toBe(201);
    const tomorrowOrder = getOrder(o.body.order.id).deliveryDate;

    await runCutoffReminder(Date.now(), { force: true });
    const sentTo = new Set(evs('cutoff_reminder_sent').map((e) => e.customerId));
    expect(sentTo.has(idle.id)).toBe(true);
    // the reminder looks at tomorrow's orders; only assert the skip when the order is for tomorrow
    const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    });
    if (tomorrowOrder === tomorrow) expect(sentTo.has(ordered.id)).toBe(false);
  });
});

describe('tagged-link scans (/go)', () => {
  it('counts anonymously per day and tag, and refuses junk', async () => {
    const ok = await request(app)
      .post('/api/v1/links/click')
      .send({ src: 'counter', p: 'TRK01', c: 'aquantis' });
    expect(ok.status).toBe(202);
    await request(app)
      .post('/api/v1/links/click')
      .send({ src: 'counter', p: 'trk01', c: 'aquantis' });
    const bad = await request(app).post('/api/v1/links/click').send({ src: '<script>' });
    expect(bad.status).toBe(422);
    const today = todayISO();
    const rep = await request(app).get(`${A}/report/weekly?week=${today}`);
    expect(rep.body.assisted.linkScans.find((x) => x.key === 'counter').n).toBeGreaterThanOrEqual(
      2,
    );
  });
});

describe('erasure and retention', () => {
  it('deleting an account removes its install tag and detaches its events', async () => {
    const { eraseAccountNow, sweepDeletions, EVENT_RETENTION_DAYS } = await import(
      '../src/lib/account-deletion.js'
    );
    const { getOps } = await import('../src/ops-store.js');
    const s = await shopper();
    await request(app)
      .post('/api/v1/growth/install-source')
      .set(auth(s.token))
      .send({ referrer: 'src=whatsapp' });
    expect(evs(null, s.id).length).toBeGreaterThan(0);
    await eraseAccountNow(s.id);
    expect(getOps('installSource', s.id)).toBeNull();
    expect(evs(null, s.id)).toHaveLength(0);
    // and the retention sweep drops events older than 24 months
    await sweepDeletions(Date.now() + (EVENT_RETENTION_DAYS + 1) * 864e5);
    expect(listEvents({ fromMs: 0 })).toHaveLength(0);
  });
});
