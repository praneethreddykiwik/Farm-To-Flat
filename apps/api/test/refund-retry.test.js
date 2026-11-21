/**
 * Review #4 (21 Nov 2026): a gateway refund that fails is retried automatically (same idempotency
 * key), and reconcile problems survive in the ops store.
 */
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
let refundFails = 1;
const refundKeys = [];
vi.mock('../src/lib/razorpay.js', async (importOriginal) => ({
  ...(await importOriginal()),
  razorpayEnabled: true,
  razorpayKeyId: 'rzp_test_fake',
  createRazorpayOrder: async () => ({ id: `order_T${Math.random().toString(36).slice(2, 10)}` }),
  createRazorpayRefund: async ({ idempotencyKey }) => {
    refundKeys.push(idempotencyKey);
    if (refundFails > 0) {
      refundFails -= 1;
      throw new Error('gateway timeout');
    }
    return { id: 'rfnd_1' };
  },
  fetchPaymentsForOrder: async () => [],
}));

const { app } = await import('../src/index.js');
const { capturePayment } = await import('../src/lib/capture.js');
const { cancelOrder, retryFailedRefunds } = await import('../src/lib/order-lifecycle.js');
const { getPayment } = await import('../src/customer-store.js');
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function paidOrder(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  const { body: c } = await request(app).get('/api/v1/communities');
  const community = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set(auth(token))
    .send({ communityId: community.id, block: community.blocks[0], flat: '707', floor: '7' });
  const { body } = await request(app).get('/api/v1/admin/products');
  for (const p of body.products
    .filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE')
    .slice(0, 6))
    await request(app)
      .put('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: p.id, quantity: 6 });
  const w = await request(app)
    .get(`/api/v1/delivery-windows?addressId=${a.body.address.id}`)
    .set(auth(token));
  const win = w.body.windows.find((x) => x.isOpen);
  const r = await request(app)
    .post('/api/v1/orders')
    .set(auth(token))
    .send({
      idempotencyKey: `refund-retry-${mobile}`,
      addressId: a.body.address.id,
      deliveryDate: win.date,
      window: win.window,
    });
  const pid = r.body.paymentIntent.paymentId;
  const cap = await capturePayment({
    paymentId: pid,
    razorpayPaymentId: 'pay_gw_1',
    source: 'webhook',
    // A real payment.captured webhook always carries the amount; since the security pentest of
    // 21 Nov 2026 (W12) a webhook capture without one is refused, so the fixture sends it.
    amountPaise: r.body.paymentIntent.amountPaise,
    currency: 'INR',
  });
  expect(cap.outcome).toBe('captured');
  return { orderId: r.body.order.id, paymentId: pid };
}

describe('failed gateway refunds', () => {
  it('are retried with the same key until they go through', async () => {
    const { orderId, paymentId } = await paidOrder('9666000041');
    cancelOrder(orderId);
    await new Promise((r) => setTimeout(r, 20)); // the gateway leg is fire-and-forget
    expect(getPayment(paymentId).refundFailed).toBeTruthy();
    const pass = await retryFailedRefunds();
    expect(pass.tried).toBe(1);
    expect(pass.refundedPaise).toBeGreaterThan(0);
    expect(getPayment(paymentId).refundFailed).toBeFalsy();
    expect(new Set(refundKeys).size).toBe(1); // never a second, different refund
    const again = await retryFailedRefunds();
    expect(again.tried).toBe(0);
  });
});
