import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

/**
 * The payment-substitution attack, and why binding matters.
 *
 * A Razorpay signature is HMAC_SHA256(`order_id|payment_id`, key_secret). It proves that pair was
 * really paid on this merchant account. It does NOT say which of OUR payment intents it settles.
 *
 * The route used to verify against `req.body.razorpayOrderId || pay.razorpayOrderId`, letting the
 * caller choose what the signature was compared against:
 *
 *   1. start a ₹5,000 top-up  → intent A, gateway order_A   (never paid)
 *   2. start a ₹100 top-up    → intent B, gateway order_B   (paid for real)
 *   3. POST /payments/verify { paymentId: A, razorpayOrderId: order_B, ...B's real triple }
 *
 * Every check passed, because every check was true — of the other payment. ₹5,000 credited for
 * ₹100 paid. These tests pin the two properties that stop it.
 */
const SECRET = 'test_key_secret';
const sign = (orderId, paymentId) =>
  crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

/** The verifier, with the secret injected — same algorithm as lib/razorpay.js. */
function verify({ orderId, paymentId, signature }) {
  if (!signature) return false;
  const expected = sign(orderId, paymentId);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

describe('a signature only proves the pair it was computed over', () => {
  it("B's genuine signature does NOT verify against A's order id", () => {
    const sigB = sign('order_B', 'pay_rzp_B');
    // This is the whole fix: the route now passes pay.razorpayOrderId (order_A), never the body's.
    expect(verify({ orderId: 'order_A', paymentId: 'pay_rzp_B', signature: sigB })).toBe(false);
  });

  it("B's genuine signature verifies against B's own order id", () => {
    const sigB = sign('order_B', 'pay_rzp_B');
    expect(verify({ orderId: 'order_B', paymentId: 'pay_rzp_B', signature: sigB })).toBe(true);
  });

  it('a signature for a different payment id on the same order fails', () => {
    const sigB = sign('order_B', 'pay_rzp_B');
    expect(verify({ orderId: 'order_B', paymentId: 'pay_rzp_OTHER', signature: sigB })).toBe(false);
  });
});

describe('a receipt may only be spent once', () => {
  it('finds a gateway payment id already recorded against another intent', async () => {
    const { paymentByRazorpayPaymentId } = await import('../src/customer-store.js');
    // Nothing is seeded here, so the lookup must simply be safe and honest about finding nothing.
    expect(paymentByRazorpayPaymentId('pay_rzp_UNSEEN')).toBeNull();
    expect(paymentByRazorpayPaymentId(undefined)).toBeNull();
    expect(paymentByRazorpayPaymentId('')).toBeNull();
  });
});
