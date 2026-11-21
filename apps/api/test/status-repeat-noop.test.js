/**
 * Review #8 (21 Nov 2026): moving an order to the state it is already in must change nothing.
 *
 * OUT_FOR_DELIVERY → OUT_FOR_DELIVERY used to mint a fresh door code — killing the one the customer
 * had just been sent — and re-send every notification. A double tap on the board did it.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const store = await import('../src/store.js');
const cs = await import('../src/customer-store.js');

let n = 0;
function confirmedOrder() {
  n += 1;
  const customerId = `cus_repeat_${n}`;
  const [p] = store
    .listProducts()
    .filter((x) => x.isActive !== false && (!x.availability || x.availability === 'AVAILABLE'));
  const order = store.createOrder({
    communityId: 'com_cyberzon',
    customerId,
    customerName: 'Repeat Test',
    mobile: `90000${String(81000 + n).padStart(5, '0')}`,
    deliveryDate: '2099-01-01',
    window: 'MORNING',
    status: 'CONFIRMED',
    paymentMethod: 'PREPAID',
    lines: [{ productId: p.id, quantity: Number(p.increment) || 1 }],
  });
  return order;
}
const patch = (id, status) =>
  request(app).patch(`/api/v1/admin/orders/${id}/status`).send({ status });
const feed = (cid) => cs.listNotifications(cid, { limit: 100 }).length;

describe('same-state status changes are a no-op', () => {
  it('a repeated OUT_FOR_DELIVERY keeps the door code and notifies nobody again', async () => {
    const o = confirmedOrder();
    expect((await patch(o.id, 'PACKING')).status).toBe(200);
    expect((await patch(o.id, 'OUT_FOR_DELIVERY')).status).toBe(200);
    const code = store.getOrder(o.id).deliveryOtp;
    expect(code).toMatch(/^\d{4}$/);
    const notesBefore = feed(o.customerId);
    expect(notesBefore).toBeGreaterThan(0); // the first dispatch did notify
    const timelineBefore = store.getOrder(o.id).timeline.length;

    const again = await patch(o.id, 'OUT_FOR_DELIVERY');
    expect(again.status).toBe(200);
    expect(again.body.unchanged).toBe(true);
    expect(store.getOrder(o.id).deliveryOtp).toBe(code);
    expect(store.getOrder(o.id).timeline.length).toBe(timelineBefore);
    expect(feed(o.customerId)).toBe(notesBefore);
  });

  it('a repeated PACKING sends no second "packed" notification', async () => {
    const o = confirmedOrder();
    await patch(o.id, 'PACKING');
    const before = feed(o.customerId);
    const again = await patch(o.id, 'PACKING');
    expect(again.body.unchanged).toBe(true);
    expect(feed(o.customerId)).toBe(before);
  });

  it('bulk advance skips orders already in the target state, with a reason', async () => {
    const a = confirmedOrder();
    const b = confirmedOrder();
    await patch(a.id, 'PACKING');
    await patch(a.id, 'OUT_FOR_DELIVERY');
    await patch(b.id, 'PACKING');
    const codeA = store.getOrder(a.id).deliveryOtp;
    const r = await request(app)
      .post('/api/v1/admin/orders/advance')
      .send({ orderIds: [a.id, b.id], status: 'OUT_FOR_DELIVERY' });
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(1);
    expect(r.body.skipped).toEqual([expect.objectContaining({ id: a.id, reason: 'UNCHANGED' })]);
    expect(store.getOrder(a.id).deliveryOtp).toBe(codeA);
    expect(store.getOrder(b.id).deliveryOtp).toMatch(/^\d{4}$/);
  });

  it('still lets an order with no code be re-dispatched to issue one (DELIVERY_OTP_MISSING recovery)', async () => {
    const o = confirmedOrder();
    await patch(o.id, 'PACKING');
    await patch(o.id, 'OUT_FOR_DELIVERY');
    // As if it went out while codes were switched off.
    store.patchOrder(o.id, (ord) => {
      ord.deliveryOtp = null;
    });
    const r = await patch(o.id, 'OUT_FOR_DELIVERY');
    expect(r.status).toBe(200);
    expect(r.body.unchanged).toBeUndefined();
    expect(store.getOrder(o.id).deliveryOtp).toMatch(/^\d{4}$/);
  });
});
