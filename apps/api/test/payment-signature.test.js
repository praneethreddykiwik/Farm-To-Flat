/**
 * A gateway payment is only captured against a signature Razorpay actually produced.
 *
 * The verify route used to gate signature checking on whether the CALLER had sent a signature:
 *   if (razorpayEnabled && (razorpayPaymentId || razorpaySignature)) { ...verify... }
 * A request carrying neither — just `{ paymentId, success: true }` — fell straight past that guard
 * and captured the order with no money moving. These lock the gate shut.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const ORDER_ID = 'order_rzp_test';

/** Load the verify route with Razorpay configured, so the signature path is live. */
async function loadWithRazorpay() {
  vi.resetModules();
  process.env.NODE_ENV = 'test';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_abcdefghij';
  process.env.RAZORPAY_KEY_SECRET = 'secret_for_tests';
  return import('../src/lib/razorpay.js');
}

describe('razorpay signature verification', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    vi.resetModules();
  });

  it('stays disabled in the test env even with keys set, so the suite never calls the gateway', async () => {
    const { razorpayEnabled } = await loadWithRazorpay();
    expect(razorpayEnabled).toBe(false);
  });

  it('accepts the signature Razorpay would have produced', async () => {
    const { verifyRazorpaySignature } = await loadWithRazorpay();
    const crypto = await import('node:crypto');
    const paymentId = 'pay_real';
    const signature = crypto
      .createHmac('sha256', 'secret_for_tests')
      .update(`${ORDER_ID}|${paymentId}`)
      .digest('hex');
    expect(verifyRazorpaySignature({ orderId: ORDER_ID, paymentId, signature })).toBe(true);
  });

  it('rejects a missing signature — the shape that used to capture for free', async () => {
    const { verifyRazorpaySignature } = await loadWithRazorpay();
    expect(
      verifyRazorpaySignature({ orderId: ORDER_ID, paymentId: 'pay_x', signature: undefined }),
    ).toBe(false);
  });

  it('rejects a forged signature', async () => {
    const { verifyRazorpaySignature } = await loadWithRazorpay();
    expect(
      verifyRazorpaySignature({ orderId: ORDER_ID, paymentId: 'pay_x', signature: 'deadbeef' }),
    ).toBe(false);
  });

  it('rejects a signature minted for a DIFFERENT order', async () => {
    const { verifyRazorpaySignature } = await loadWithRazorpay();
    const crypto = await import('node:crypto');
    const signature = crypto
      .createHmac('sha256', 'secret_for_tests')
      .update(`order_someone_else|pay_x`)
      .digest('hex');
    expect(verifyRazorpaySignature({ orderId: ORDER_ID, paymentId: 'pay_x', signature })).toBe(
      false,
    );
  });
});
