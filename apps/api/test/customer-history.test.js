/**
 * Customers — "which of their orders is this?", and the rules for showing it.
 *
 * Two halves. The counting has to be right: what is an order, what is not, and that the numbers
 * hold still. And the showing has to be careful, because this is the one screen that lays every
 * customer out in a row: no full mobile number in a list, no identity for someone who deleted their
 * account, a record of every history opened and every number revealed, and admins only.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';
process.env.ADMIN_TOKEN = TOKEN;

const { app } = await import('../src/index.js');
const { createOrder, listCommunities, listProducts } = await import('../src/store.js');
const { _memoryTrail } = await import('../src/lib/audit.js');
const { roleMayAccess } = await import('../src/routes/admin/auth.js');
const h = await import('../src/lib/customer-history.js');

const admin = (method, path) =>
  request(app)[method](`/api/v1/admin${path}`).set('x-admin-token', TOKEN);
const auth = (t) => ({ Authorization: `Bearer ${t}` });

/** A real account, signed in — so there is a customer id, and something to delete later. */
async function account(mobile, name) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  if (name) await request(app).patch('/api/v1/me').set(auth(token)).send({ name });
  const me = await request(app).get('/api/v1/me').set(auth(token));
  return { token, id: me.body.customer.id, mobile };
}

let community;
let product;
/** Put an order straight into the book: placing one through checkout is not what is under test. */
function order(who, { status = 'DELIVERED', at } = {}) {
  return createOrder({
    communityId: community.id,
    block: community.blocks[0],
    flat: '1204',
    lines: [[product.id, 2]],
    customerId: who.id || null,
    customerName: who.name || 'Asha Rao',
    mobile: who.mobile,
    status,
    createdAt: at,
    deliveryDate: String(at).slice(0, 10),
    window: 'MORNING',
  });
}

beforeAll(() => {
  [community] = listCommunities();
  product = listProducts().find((p) => (p.availability || 'AVAILABLE') === 'AVAILABLE');
});

describe('what counts as an order', () => {
  it('is one that was placed — confirmed, on its way, delivered', () => {
    for (const status of ['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED'])
      expect(h.wasPlaced({ status })).toBe(true);
  });

  it('is not a checkout that was abandoned or whose payment failed', () => {
    expect(h.wasPlaced({ status: 'PENDING_PAYMENT' })).toBe(false);
    expect(h.wasPlaced({ status: 'PAYMENT_FAILED' })).toBe(false);
  });

  it('tells a cancelled order from a cancelled checkout by what it had been', () => {
    const calledOff = {
      status: 'CANCELLED',
      timeline: [{ status: 'CONFIRMED' }, { status: 'CANCELLED' }],
    };
    const neverPaid = {
      status: 'CANCELLED',
      timeline: [{ status: 'PENDING_PAYMENT' }, { status: 'CANCELLED' }],
    };
    expect(h.wasPlaced(calledOff)).toBe(true);
    expect(h.wasPlaced(neverPaid)).toBe(false);
    expect(h.wasPlaced({ status: 'CANCELLED' })).toBe(false);
  });
});

describe('numbering', () => {
  const book = [
    {
      id: 'c',
      orderNumber: 'F2F-3',
      customerId: 'cus_1',
      status: 'DELIVERED',
      createdAt: '2026-11-03T05:00:00Z',
    },
    {
      id: 'a',
      orderNumber: 'F2F-1',
      customerId: 'cus_1',
      status: 'DELIVERED',
      createdAt: '2026-11-01T05:00:00Z',
    },
    {
      id: 'x',
      orderNumber: 'F2F-9',
      customerId: 'cus_1',
      status: 'PAYMENT_FAILED',
      createdAt: '2026-11-02T04:00:00Z',
    },
    {
      id: 'b',
      orderNumber: 'F2F-2',
      customerId: 'cus_1',
      status: 'CANCELLED',
      createdAt: '2026-11-02T05:00:00Z',
      timeline: [{ status: 'CONFIRMED' }],
    },
    {
      id: 'z',
      orderNumber: 'F2F-4',
      customerId: 'cus_2',
      status: 'CONFIRMED',
      createdAt: '2026-11-02T06:00:00Z',
    },
  ];

  it('counts each customer separately, in the order placed, skipping what was never an order', () => {
    const nos = h.orderNumbers(book);
    expect(nos.get('a')).toEqual({ n: 1, of: 3 });
    expect(nos.get('b')).toEqual({ n: 2, of: 3 }); // cancelled after it was placed: still their 2nd
    expect(nos.get('c')).toEqual({ n: 3, of: 3 });
    expect(nos.get('z')).toEqual({ n: 1, of: 1 });
    expect(nos.has('x')).toBe(false);
  });

  it('says it the way a person would', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(h.ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
      '111th',
    ]);
  });

  it('names where a customer stands', () => {
    expect([1, 2, 3, 40].map(h.stageOf)).toEqual(['FIRST', 'SECOND', 'REGULAR', 'REGULAR']);
  });
});

describe('the handle for a customer', () => {
  it('is the account id when there is one', () => {
    expect(h.customerKeyOf({ customerId: 'cus_9', mobile: '9848012345' })).toBe('cus_9');
  });

  it('never contains the mobile number when there is not', () => {
    const key = h.customerKeyOf({ mobile: '9848012345' });
    expect(key).toMatch(/^g_[0-9a-f]{20}$/);
    expect(key).not.toContain('9848012345');
    expect(key).toBe(h.customerKeyOf({ mobile: '9848012345' })); // and is the same every time
    expect(h.customerKeyOf({})).toBe(null);
  });

  it('cannot be turned back into the number by hashing every mobile — it is keyed', async () => {
    const { createHash } = await import('node:crypto');
    // The old key was an unkeyed SHA-256 of a fixed prefix plus the number: anyone could compute it.
    const unkeyed = `g_${createHash('sha256').update('f2f-guest:9848012345').digest('hex').slice(0, 20)}`;
    expect(h.customerKeyOf({ mobile: '9848012345' })).not.toBe(unkeyed);
  });

  it('masks a number down to its last four digits', () => {
    expect(h.maskMobile('9848012345')).toBe('••••••2345');
    expect(h.maskMobile('')).toBe(null);
  });
});

describe('GET /admin/customers', () => {
  it('lists who has ordered, where they stand, and never a whole mobile number', async () => {
    const once = await account('9833300001', 'Once Only');
    const twice = await account('9833300002', 'Came Back');
    const often = await account('9833300003', 'Every Week');
    order(once, { at: '2026-10-01T05:00:00.000Z' });
    order(twice, { at: '2026-10-02T05:00:00.000Z' });
    order(twice, { at: '2026-10-09T05:00:00.000Z' });
    for (const d of ['03', '10', '17', '24']) order(often, { at: `2026-10-${d}T05:00:00.000Z` });
    // A checkout Once Only walked away from. It must not make them look like a returning customer.
    order(once, { status: 'PENDING_PAYMENT', at: '2026-10-05T05:00:00.000Z' });

    const r = await admin('get', '/customers');
    expect(r.status).toBe(200);
    const find = (c) => r.body.customers.find((x) => x.key === c.id);
    expect(find(once)).toMatchObject({
      name: 'Once Only',
      orders: 1,
      stage: 'FIRST',
      delivered: 1,
    });
    expect(find(twice)).toMatchObject({ name: 'Came Back', orders: 2, stage: 'SECOND' });
    expect(find(often)).toMatchObject({ name: 'Every Week', orders: 4, stage: 'REGULAR' });
    expect(find(often).firstOrderAt).toBe('2026-10-03T05:00:00.000Z');
    expect(find(often).lastOrderAt).toBe('2026-10-24T05:00:00.000Z');
    expect(find(often).spentPaise).toBeGreaterThan(0);
    expect(find(twice).mobileMasked).toBe('••••••0002');

    // The list is the one place every customer sits side by side. No full number, no flat.
    const text = JSON.stringify(r.body);
    for (const c of [once, twice, often]) expect(text).not.toContain(c.mobile);
    expect(text).not.toContain('"flat"');
    expect(text).not.toContain('"mobile"');

    const t = r.body.totals;
    expect(t.customers).toBe(r.body.customers.length);
    expect(t.first + t.second + t.regular).toBe(t.customers);
    expect(t.cameBackPct).toBeGreaterThan(0);
    expect(t.cameBackPct).toBeLessThanOrEqual(100);
  });

  it('filters by where a customer stands', async () => {
    const r = await admin('get', '/customers?stage=second');
    expect(r.body.customers.length).toBeGreaterThan(0);
    expect(r.body.customers.every((c) => c.stage === 'SECOND')).toBe(true);
    // The totals describe everyone, whatever is being looked at.
    const all = await admin('get', '/customers');
    expect(r.body.totals).toEqual(all.body.totals);
  });

  it('finds a customer by name, by order number, or by their number — and still masks it', async () => {
    const who = await account('9833300011', 'Findable Person');
    const o = order(who, { at: '2026-10-11T05:00:00.000Z' });

    const byName = await admin('get', '/customers?q=findable');
    expect(byName.body.customers.map((c) => c.key)).toEqual([who.id]);

    const byOrder = await admin('get', `/customers?q=${o.orderNumber}`);
    expect(byOrder.body.customers.map((c) => c.key)).toContain(who.id);

    const byMobile = await admin('get', '/customers?q=9833300011');
    expect(byMobile.body.customers.map((c) => c.key)).toEqual([who.id]);
    expect(JSON.stringify(byMobile.body)).not.toContain('9833300011');

    // Three digits would match a tenth of the book: not a search, a way to read everyone out.
    const tooShort = await admin('get', '/customers?q=983');
    expect(tooShort.body.customers.map((c) => c.key)).not.toContain(who.id);
  });
});

describe('GET /admin/customers/:key', () => {
  it('numbers the orders as placed, shows the newest first, and writes down that it was opened', async () => {
    const who = await account('9833300021', 'History Reader');
    const first = order(who, { at: '2026-09-01T05:00:00.000Z' });
    // Placed, then called off — through the same route the console uses, so the order carries the
    // timeline a real cancellation leaves behind.
    const second = order(who, { status: 'CONFIRMED', at: '2026-09-08T05:00:00.000Z' });
    const cancel = await admin('patch', `/orders/${second.id}/status`).send({
      status: 'CANCELLED',
    });
    expect(cancel.status).toBe(200);
    const third = order(who, { status: 'CONFIRMED', at: '2026-09-15T05:00:00.000Z' });
    const before = _memoryTrail.length;

    const r = await admin('get', `/customers/${who.id}`);
    expect(r.status).toBe(200);
    expect(r.body.customer).toMatchObject({ orders: 3, delivered: 1, cancelled: 1, inHand: 1 });
    expect(r.body.orders.map((o) => [o.n, o.label, o.orderNumber, o.status])).toEqual([
      [3, '3rd order', third.orderNumber, 'CONFIRMED'],
      [2, '2nd order', second.orderNumber, 'CANCELLED'],
      [1, '1st order', first.orderNumber, 'DELIVERED'],
    ]);
    // What was bought and what it came to — not where it went or who was rung.
    expect(r.body.orders[0].itemCount).toBe(1);
    expect(r.body.orders[0].items).toContain(product.name);
    const text = JSON.stringify(r.body);
    expect(text).not.toContain(who.mobile);
    expect(text).not.toContain('"flat"');
    expect(text).not.toContain('"address"');

    const row = _memoryTrail[_memoryTrail.length - 1];
    expect(_memoryTrail.length).toBe(before + 1);
    expect(row).toMatchObject({ action: 'CUSTOMER_HISTORY_VIEWED', target: who.id });
    expect(JSON.stringify(row)).not.toContain(who.mobile);
  });

  it('is a 404 for nobody', async () => {
    expect((await admin('get', '/customers/cus_does_not_exist')).status).toBe(404);
  });
});

describe('POST /admin/customers/:key/contact', () => {
  it('hands over the number only for a reason, and records the reason — not the number', async () => {
    const who = await account('9833300031', 'Needs A Call');
    order(who, { status: 'OUT_FOR_DELIVERY', at: '2026-10-20T05:00:00.000Z' });

    expect((await admin('post', `/customers/${who.id}/contact`).send({})).status).toBe(422);
    expect(
      (await admin('post', `/customers/${who.id}/contact`).send({ reason: 'MARKETING' })).status,
    ).toBe(422);

    const before = _memoryTrail.length;
    const r = await admin('post', `/customers/${who.id}/contact`).send({ reason: 'DELIVERY' });
    expect(r.status).toBe(200);
    expect(r.body.mobile).toBe('9833300031');
    expect(_memoryTrail.length).toBe(before + 1);
    const row = _memoryTrail[_memoryTrail.length - 1];
    expect(row).toMatchObject({
      action: 'CUSTOMER_CONTACT_REVEALED',
      target: who.id,
      details: { reason: 'DELIVERY' },
    });
    expect(JSON.stringify(row)).not.toContain('9833300031');
  });
});

describe('a customer who deleted their account', () => {
  it('keeps their orders in the count and loses everything that says who they were', async () => {
    const gone = await account('9833300041', 'Soon Erased');
    order(gone, { at: '2026-08-01T05:00:00.000Z' });
    order(gone, { at: '2026-08-08T05:00:00.000Z' });
    expect((await request(app).delete('/api/v1/me').set(auth(gone.token))).status).toBe(200);

    const list = await admin('get', '/customers');
    const row = list.body.customers.find((c) => c.key === gone.id);
    // Still two orders — the tax record stands — but nobody's.
    expect(row).toMatchObject({ erased: true, name: null, mobileMasked: null, orders: 2 });
    expect(JSON.stringify(list.body)).not.toContain('Soon Erased');
    expect(JSON.stringify(list.body)).not.toContain('0041');

    // The order itself still carries the name it was placed under. The history must not borrow it.
    const detail = await admin('get', `/customers/${gone.id}`);
    expect(detail.body.customer).toMatchObject({ erased: true, name: null, mobileMasked: null });
    expect(JSON.stringify(detail.body)).not.toContain('Soon Erased');

    const contact = await admin('post', `/customers/${gone.id}/contact`).send({
      reason: 'COMPLAINT',
    });
    expect(contact.status).toBe(410);
    expect(contact.body.error.code).toBe('ERASED');

    // And they cannot be found by the number they used to have.
    const search = await admin('get', '/customers?q=9833300041');
    expect(search.body.customers.map((c) => c.key)).not.toContain(gone.id);
  });
});

describe('who may look', () => {
  it('is admins and super admins, and nobody else', () => {
    for (const path of ['/customers', '/customers/cus_1', '/customers/cus_1/contact']) {
      expect(roleMayAccess('SUPER_ADMIN', path, 'GET')).toBe(true);
      expect(roleMayAccess('ADMIN', path, 'GET')).toBe(true);
      expect(roleMayAccess('FULFILMENT', path, 'GET')).toBe(false);
      expect(roleMayAccess('PROCUREMENT', path, 'GET')).toBe(false);
    }
  });

  it('needs a staff session at all', async () => {
    expect((await request(app).get('/api/v1/admin/customers')).status).toBe(401);
  });
});

describe('the orders list', () => {
  it('says which of the customer’s orders each one is', async () => {
    const who = await account('9833300051', 'Numbered Orders');
    const a = order(who, { at: '2026-10-01T05:00:00.000Z' });
    const b = order(who, { status: 'CONFIRMED', at: '2026-10-08T05:00:00.000Z' });
    const never = order(who, { status: 'PAYMENT_FAILED', at: '2026-10-09T05:00:00.000Z' });

    const r = await admin('get', '/orders');
    const find = (o) => r.body.orders.find((x) => x.id === o.id);
    expect(find(a)).toMatchObject({ customerOrderNo: 1, customerOrders: 2, firstOrder: true });
    expect(find(b)).toMatchObject({ customerOrderNo: 2, customerOrders: 2, firstOrder: false });
    expect(find(never)).toMatchObject({
      customerOrderNo: null,
      customerOrders: null,
      firstOrder: false,
    });
  });

  it('gives the new-customer badge to the first order that was really placed', async () => {
    // Their first checkout died at the payment screen; they tried again and it went through. The
    // second attempt is their first order, and it is the one that should be marked.
    const who = await account('9833300052', 'Second Attempt');
    const failed = order(who, { status: 'PAYMENT_FAILED', at: '2026-10-01T05:00:00.000Z' });
    const placed = order(who, { status: 'CONFIRMED', at: '2026-10-01T05:05:00.000Z' });

    const r = await admin('get', '/orders');
    const find = (o) => r.body.orders.find((x) => x.id === o.id);
    expect(find(failed).firstOrder).toBe(false);
    expect(find(placed)).toMatchObject({ firstOrder: true, customerOrderNo: 1 });
  });
});
