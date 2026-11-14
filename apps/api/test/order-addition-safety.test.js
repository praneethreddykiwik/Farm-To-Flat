/**
 * Adding items to a placed order, from the money side (security audit 2026-11-14).
 *
 * Three gaps, each pinned here:
 *  1. A paid addition must come back when the order is cancelled. The refund used to look only at
 *     the order's first payment, so cancelling kept the money for anything added afterwards.
 *  2. A payment for an addition the order can no longer take — the order was cancelled, or a later
 *     add request replaced this one — used to be captured with nothing added and nothing returned.
 *  3. The add-items route skipped the basket's quantity-step rule, and capped each line separately,
 *     so the same product on several lines could book past the day's limit.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const store = await import('../src/store.js');
const cs = await import('../src/customer-store.js');
const { capturePayment } = await import('../src/lib/capture.js');
const { cancelOrder } = await import('../src/lib/order-lifecycle.js');
const { generateWindows, todayISO } = await import('../src/lib/windows.js');

const COMMUNITY = 'com_cyberzon';
const auth = (t) => ({ Authorization: `Bearer ${t}` });

/** In-stock products with a positive step, so every quantity below is one we really sell. */
function products() {
  return store
    .listProducts()
    .filter(
      (p) =>
        p.isActive !== false &&
        (!p.availability || p.availability === 'AVAILABLE') &&
        Number(p.increment) > 0,
    );
}

function openWindow() {
  const community = store.getCommunity(COMMUNITY);
  return generateWindows(community, todayISO(), store.bookedIndex(COMMUNITY)).find((w) => w.isOpen);
}

let n = 0;
/** A confirmed order for `customerId`, in a window that is still open. */
function confirmedOrder(customerId, paymentMethod = 'PREPAID') {
  n += 1;
  const win = openWindow();
  const [a] = products();
  return store.createOrder({
    communityId: COMMUNITY,
    customerId,
    customerName: 'Addition Test',
    mobile: `90000${String(70000 + n).padStart(5, '0')}`,
    deliveryDate: win.date,
    window: win.window,
    status: 'CONFIRMED',
    paymentMethod,
    lines: [{ productId: a.id, quantity: Number(a.increment) * 2 }],
  });
}

/** Stash an addition on the order, as the add-items route does, and return its payment intent. */
function pendingAddition(order, amountPaise = 4200) {
  const [, b] = products();
  const pay = cs.createPayment(order.customerId, {
    purpose: 'ORDER_ADDITION',
    orderId: order.id,
    amountPaise,
  });
  store.patchOrder(order.id, (o) => {
    o.pendingAddition = {
      paymentId: pay.id,
      lineInputs: [{ productId: b.id, quantity: Number(b.increment) }],
    };
  });
  return pay;
}

const balance = (cid) => Number(cs.getWallet(cid).balancePaise);

describe('a paid addition', () => {
  it('is applied when the order is still waiting for it', async () => {
    const order = confirmedOrder('cus_add_ok');
    const pay = pendingAddition(order);
    const r = await capturePayment({ paymentId: pay.id });
    expect(r.outcome).toBe('captured');
    expect(store.getOrder(order.id).items).toHaveLength(order.items.length + 1);
    expect(store.getOrder(order.id).pendingAddition).toBeNull();
  });

  it('arriving after the order was cancelled is returned to the wallet, not kept', async () => {
    const cid = 'cus_add_late';
    const order = confirmedOrder(cid);
    const pay = pendingAddition(order, 5100);
    cancelOrder(order.id);
    const before = balance(cid);

    const r = await capturePayment({ paymentId: pay.id });

    expect(r.outcome).toBe('orphaned');
    expect(balance(cid) - before).toBe(5100);
    // nothing was added to a cancelled order
    expect(store.getOrder(order.id).items).toHaveLength(order.items.length);
    // and a second delivery of the same capture is a no-op, not a second credit
    expect((await capturePayment({ paymentId: pay.id })).outcome).toBe('already');
    expect(balance(cid) - before).toBe(5100);
  });

  it('for an add request that a later one replaced is returned to the wallet', async () => {
    const cid = 'cus_add_replaced';
    const order = confirmedOrder(cid);
    const first = pendingAddition(order, 3000);
    pendingAddition(order, 3500); // the customer changed their mind before paying the first
    const before = balance(cid);

    const r = await capturePayment({ paymentId: first.id });

    expect(r.outcome).toBe('orphaned');
    expect(balance(cid) - before).toBe(3000);
    expect(store.getOrder(order.id).items).toHaveLength(order.items.length);
  });
});

describe('what a cancellation refunds', () => {
  it('includes every captured payment on the order — the original and each paid addition', async () => {
    const order = confirmedOrder('cus_refund_all');
    const original = cs.createPayment(order.customerId, {
      purpose: 'ORDER',
      orderId: order.id,
      amountPaise: 60000,
    });
    original.status = 'CAPTURED';
    const addition = pendingAddition(order, 7000);
    await capturePayment({ paymentId: addition.id });

    const ids = cs.refundablePaymentsForOrder(order.id).map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([original.id, addition.id]));
    expect(ids).toHaveLength(2);
  });

  it('leaves out a capture that was already returned to the wallet, so nothing is paid back twice', async () => {
    const order = confirmedOrder('cus_refund_orphan');
    const pay = pendingAddition(order, 2500);
    cancelOrder(order.id);
    await capturePayment({ paymentId: pay.id }); // orphaned → wallet
    expect(cs.refundablePaymentsForOrder(order.id)).toHaveLength(0);
  });
});

describe('the add-items route', () => {
  let token;
  let customerId;

  beforeAll(async () => {
    store.updatePaymentSettings({ codEnabled: true, codMaxOrderPaise: 100000000 });
    const mobile = '9123400771';
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
    token = v.body.accessToken;
    customerId = (await request(app).get('/api/v1/me').set(auth(token))).body.customer.id;
  });

  const add = (orderId, items) =>
    request(app).post(`/api/v1/orders/${orderId}/add-items`).set(auth(token)).send({ items });

  it('refuses a quantity that is not a whole number of the product’s steps', async () => {
    const order = confirmedOrder(customerId, 'COD');
    const [, b] = products();
    const r = await add(order.id, [{ productId: b.id, quantity: Number(b.increment) / 2 }]);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('VALIDATION');
  });

  it('caps the same product across several lines together, not each line on its own', async () => {
    const order = confirmedOrder(customerId, 'COD');
    const p = products().find((x) => {
      const left = Number(x.dailyCap) - (store.orderedQtyIndex(order.deliveryDate).get(x.id) || 0);
      return left >= Number(x.increment);
    });
    const inc = Number(p.increment);
    const left = Number(p.dailyCap) - (store.orderedQtyIndex(order.deliveryDate).get(p.id) || 0);
    const each = Math.floor(left / inc + 1e-9) * inc; // the most one line may take on its own
    const r = await add(order.id, [
      { productId: p.id, quantity: each },
      { productId: p.id, quantity: each },
    ]);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('CAP_EXCEEDED');
  });

  it('still adds a valid line to a cash order', async () => {
    const order = confirmedOrder(customerId, 'COD');
    const [, b] = products();
    const r = await add(order.id, [{ productId: b.id, quantity: Number(b.increment) }]);
    expect(r.status).toBe(200);
    expect(r.body.order.items).toHaveLength(order.items.length + 1);
  });
});
