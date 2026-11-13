/**
 * The bill of an order that has been placed.
 *
 * The owner set a platform fee and GST in the console, a customer was charged ₹602.99 on a ₹500
 * basket — and the order showed "Subtotal ₹500 / Total ₹602.99" with nothing in between, in the
 * app and on the invoice. Three separate causes, each covered here:
 *
 *  1. the fee lines and tax were computed for every order and never written to the database, so
 *     they were gone at the next restart;
 *  2. the order the app receives did not carry them at all;
 *  3. the invoice printed the delivery fee twice when it did have them.
 *
 * And the basket's photos, which went out as the storage address instead of through the image
 * route like every other photo.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';
process.env.ADMIN_TOKEN = TOKEN;

const { app } = await import('../src/index.js');
const { createOrder, hydrateOrders, listCommunities, listProducts, updateCharges, updateProduct } =
  await import('../src/store.js');
const { orderBill, priceBreakdown, reconstructSnapshot, breakdownSnapshot } = await import(
  '../src/lib/charges.js'
);
const { orderToRow } = await import('../src/persistence.js');
const { taxNote } = await import('../src/lib/invoice.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const admin = (method, path) =>
  request(app)[method](`/api/v1/admin${path}`).set('x-admin-token', TOKEN);

/** What the owner had set: a flat ₹11.01 platform fee, 18% on items and on fees. */
const OWNER_FEES = {
  charges: [{ label: 'Platform Fees', kind: 'FLAT', valuePaise: 1101 }],
  tax: { enabled: true, label: 'GST', goodsRateBps: 1800, feeRateBps: 1800 },
};

async function account(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  const me = await request(app).get('/api/v1/me').set(auth(token));
  return { token, id: me.body.customer.id, mobile };
}

let community;
let product;
function place(who, qty = 2) {
  return createOrder({
    communityId: community.id,
    block: community.blocks[0],
    flat: '1204',
    lines: [[product.id, qty]],
    customerId: who.id,
    customerName: 'Asha Rao',
    mobile: who.mobile,
    status: 'CONFIRMED',
    deliveryDate: '2026-11-14',
    window: 'MORNING',
  });
}

beforeAll(() => {
  [community] = listCommunities();
  product = listProducts().find((p) => (p.availability || 'AVAILABLE') === 'AVAILABLE');
});

afterEach(() => {
  updateCharges({ charges: [], tax: { enabled: false, goodsRateBps: 0, feeRateBps: 1800 } });
});

describe('the lines of a placed order', () => {
  it('are the fees and tax it was placed with, and they add up to its total', () => {
    const b = priceBreakdown({ subtotalPaise: 50000, ...OWNER_FEES });
    expect(b.totalPaise).toBe(60299); // the ₹602.99 on the owner's screen
    const bill = orderBill({
      subtotalPaise: 50000,
      totalPaise: b.totalPaise,
      taxPaise: b.taxPaise,
      chargeBreakdown: breakdownSnapshot(b),
    });
    expect(bill.lines).toEqual([{ label: 'Platform Fees', amountPaise: 1101 }]);
    expect(bill.taxLabel).toBe('GST');
    expect(bill.taxPaise).toBe(9198);
    expect(bill.itemised).toBe(true);
    expect(50000 + 1101 + bill.taxPaise).toBe(60299);
  });

  it('list delivery once, not once from the order and again from its snapshot', () => {
    const b = priceBreakdown({ subtotalPaise: 30000, deliveryChargePaise: 3900, ...OWNER_FEES });
    const bill = orderBill({
      subtotalPaise: 30000,
      deliveryChargePaise: 3900,
      totalPaise: b.totalPaise,
      taxPaise: b.taxPaise,
      chargeBreakdown: breakdownSnapshot(b),
    });
    expect(bill.lines.filter((l) => l.label === 'Delivery fee')).toHaveLength(1);
    const parts = 30000 + bill.lines.reduce((s, l) => s + l.amountPaise, 0) + bill.taxPaise;
    expect(parts).toBe(b.totalPaise);
  });

  it('still add up when the snapshot was lost: the gap is one honest line, not a silent jump', () => {
    const bill = orderBill({ subtotalPaise: 50000, totalPaise: 60299, chargeBreakdown: null });
    expect(bill.lines).toEqual([{ label: 'Fees and taxes', amountPaise: 10299, unitemised: true }]);
    expect(bill.taxPaise).toBe(0);
    expect(bill.itemised).toBe(false);
  });

  it('invent nothing for an order that was only ever goods and delivery', () => {
    expect(orderBill({ subtotalPaise: 29000, totalPaise: 29000 }).lines).toEqual([]);
    expect(
      orderBill({ subtotalPaise: 29000, deliveryChargePaise: 3900, totalPaise: 32900 }).lines,
    ).toEqual([{ label: 'Delivery fee', amountPaise: 3900 }]);
  });

  it('take a coupon into account before deciding anything is unexplained', () => {
    const bill = orderBill({ subtotalPaise: 50000, couponDiscountPaise: 5000, totalPaise: 45000 });
    expect(bill.lines).toEqual([]);
  });
});

describe('recovering the lines of an order saved without them', () => {
  const lost = { subtotalPaise: 50000, totalPaise: 60299, chargeBreakdown: null, taxPaise: 0 };

  it('happens when the saved settings give that order its own total, to the paisa', () => {
    const snap = reconstructSnapshot(lost, OWNER_FEES);
    expect(snap.lines).toEqual([{ label: 'Platform Fees', amountPaise: 1101 }]);
    expect(snap.taxPaise).toBe(9198);
    expect(snap.reconstructed).toBe(true);
  });

  it('does not happen when the settings have changed since — a guess is not a record', () => {
    const changed = { ...OWNER_FEES, tax: { ...OWNER_FEES.tax, goodsRateBps: 0 } };
    expect(reconstructSnapshot(lost, changed)).toBeNull();
  });

  it('leaves alone an order that has its lines, and one with nothing to recover', () => {
    expect(reconstructSnapshot({ ...lost, chargeBreakdown: { lines: [] } }, OWNER_FEES)).toBeNull();
    expect(reconstructSnapshot({ subtotalPaise: 29000, totalPaise: 29000 }, {})).toBeNull();
  });
});

describe('what is written to the database', () => {
  it('includes the fee lines and the tax — they used to live only until the next restart', () => {
    updateCharges(OWNER_FEES);
    const o = createOrder({
      communityId: community.id,
      block: community.blocks[0],
      flat: '9',
      lines: [[product.id, 1]],
      customerName: 'Row Test',
      mobile: '9000000310',
      deliveryDate: '2026-11-14',
      window: 'MORNING',
    });
    const row = orderToRow(o);
    expect(row.chargeBreakdown.lines.some((l) => l.label === 'Platform Fees')).toBe(true);
    expect(row.taxPaise).toBe(o.taxPaise);
    expect(row.taxPaise).toBeGreaterThan(0);
  });

  it('never sends a bare null for the snapshot of an order that has none', () => {
    const row = orderToRow({ id: 'x', subtotalPaise: 100, totalPaise: 100 });
    expect('chargeBreakdown' in row).toBe(false);
    expect(row.taxPaise).toBe(0);
  });
});

describe('the order the customer and the console receive', () => {
  it('carries every fee by the name the owner gave it, and the tax with its rates', async () => {
    const who = await account('9000000311');
    updateCharges(OWNER_FEES);
    const o = place(who);

    const { body } = await request(app).get(`/api/v1/orders/${o.id}`).set(auth(who.token));
    const order = body.order;
    expect(order.chargeLines.map((l) => l.label)).toContain('Platform Fees');
    expect(order.taxLabel).toBe('GST');
    expect(Number(order.taxPaise)).toBeGreaterThan(0);
    expect(order.taxRates).toMatchObject({ goodsBps: 1800, feeBps: 1800 });
    const fees = order.chargeLines.reduce((s, l) => s + Number(l.amountPaise), 0);
    expect(Number(order.subtotalPaise) + fees + Number(order.taxPaise)).toBe(
      Number(order.totalPaise),
    );

    const list = await admin('get', '/orders');
    const mine = list.body.orders.find((x) => x.id === o.id);
    expect(mine.chargeLines.map((l) => l.label)).toContain('Platform Fees');
    expect(mine.taxPaise).toBe(order.taxPaise);
  });

  it('keeps the bill it was placed with when the fees change afterwards', async () => {
    const who = await account('9000000312');
    updateCharges(OWNER_FEES);
    const o = place(who);
    updateCharges({ charges: [{ label: 'Platform Fees', kind: 'FLAT', valuePaise: 9900 }] });
    const { body } = await request(app).get(`/api/v1/orders/${o.id}`).set(auth(who.token));
    expect(body.order.chargeLines.find((l) => l.label === 'Platform Fees').amountPaise).toBe(
      '1101',
    );
  });

  it('gets its lines back at start-up when it was saved without them', async () => {
    const who = await account('9000000313');
    updateCharges(OWNER_FEES);
    const o = place(who);
    // As the database held it: everything but the snapshot.
    const { chargeBreakdown: _gone, ...asSaved } = o;
    hydrateOrders([{ ...asSaved, chargeBreakdown: null, taxPaise: 0 }]);

    const { body } = await request(app).get(`/api/v1/orders/${o.id}`).set(auth(who.token));
    expect(body.order.chargeLines.map((l) => l.label)).toContain('Platform Fees');
    expect(Number(body.order.taxPaise)).toBe(o.taxPaise);
  });
});

describe('the invoice', () => {
  it('says what the tax is a percentage of', () => {
    const b = priceBreakdown({ subtotalPaise: 50000, ...OWNER_FEES });
    const bill = orderBill({
      subtotalPaise: 50000,
      totalPaise: b.totalPaise,
      chargeBreakdown: breakdownSnapshot(b),
    });
    expect(taxNote(bill)).toBe('18% on items Rs. 90.00, 18% on fees Rs. 1.98');
    expect(taxNote({ taxBreakdown: null })).toBe('');
  });

  it('is produced for an order with fees and tax', async () => {
    const who = await account('9000000314');
    updateCharges(OWNER_FEES);
    const o = place(who);
    const res = await request(app)
      .get(`/api/v1/orders/${o.id}/invoice`)
      .set(auth(who.token))
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('a photo in the basket', () => {
  it('goes through the image route, at the address the catalogue gives for the same product', async () => {
    const who = await account('9000000315');
    const stored =
      'https://abcdefgh.supabase.co/storage/v1/object/public/product-images/1791455759333-npbk1e.png';
    const before = product.image;
    await updateProduct(product.id, { image: stored });
    try {
      await request(app)
        .put('/api/v1/cart/items')
        .set(auth(who.token))
        .send({ productId: product.id, quantity: Number(product.increment) || 1 });
      const cart = (await request(app).get('/api/v1/cart').set(auth(who.token))).body.cart;
      const line = cart.items.find((i) => i.productId === product.id);
      expect(line.image).not.toContain('supabase.co');
      expect(line.image).toContain('/api/v1/img/1791455759333-npbk1e.png');

      const catalog = (await request(app).get('/api/v1/catalog')).body;
      const inCatalog = catalog.products.find((p) => p.id === product.id);
      expect(line.image).toBe(inCatalog.image);
    } finally {
      await updateProduct(product.id, { image: before });
    }
  });
});
