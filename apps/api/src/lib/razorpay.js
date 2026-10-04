// Server-side Razorpay. Creates REAL orders (so the app's checkout has something valid to pay) and
// verifies the payment signature with the key SECRET (which never leaves the server). Falls back to
// disabled when keys aren't set — the routes then keep their mock behaviour for local demos.
import crypto from 'node:crypto';

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// Off in the test env so the suite keeps its fast, offline mock payment flow (no live API calls).
export const razorpayEnabled =
  process.env.NODE_ENV !== 'test' && !!(KEY_ID && KEY_SECRET && /^rzp_(test|live)_/.test(KEY_ID));
export const razorpayKeyId = KEY_ID || null;

const AUTH = razorpayEnabled
  ? 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')
  : null;

/** Create a real Razorpay order. `amountPaise` is integer paise. Returns Razorpay's order object. */
export async function createRazorpayOrder({ amountPaise, receipt, notes }) {
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify({ amount: Number(amountPaise), currency: 'INR', receipt, notes }),
  });
  const data = await r.json();
  if (!r.ok) {
    throw Object.assign(new Error(data?.error?.description || 'Razorpay order failed'), {
      status: 502,
      code: 'RAZORPAY_ORDER_FAILED',
    });
  }
  return data; // { id: 'order_...', amount, currency, ... }
}

/**
 * Refund a captured payment, in full or in part. `amountPaise` omitted refunds everything.
 *
 * `X-Razorpay-Idempotency-Key` is what makes this safe to retry: if our first attempt timed out
 * after Razorpay had already accepted it, the retry returns THAT refund instead of issuing a second
 * one. Without it a flaky network is indistinguishable from a failed refund, and the safe-looking
 * response (retry) is the one that pays the customer twice.
 */
export async function createRazorpayRefund({ paymentId, amountPaise, idempotencyKey, notes }) {
  if (!razorpayEnabled)
    throw Object.assign(new Error('Razorpay is not configured'), {
      status: 503,
      code: 'RAZORPAY_NOT_CONFIGURED',
    });
  const r = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: AUTH,
      ...(idempotencyKey ? { 'X-Razorpay-Idempotency-Key': String(idempotencyKey) } : {}),
    },
    body: JSON.stringify({
      ...(amountPaise ? { amount: Number(amountPaise) } : {}),
      speed: 'normal',
      ...(notes ? { notes } : {}),
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    // Carry Razorpay's own words through. A bare "refund failed" in the log tells the operator to
    // go and refund by hand but not why it could not be done automatically, and the reason is
    // usually the actionable part ("payment already refunded", "amount exceeds captured").
    throw Object.assign(
      new Error(
        data?.error?.description || data?.message || `Razorpay refund failed (${r.status})`,
      ),
      { status: 502, code: 'RAZORPAY_REFUND_FAILED', upstream: data?.error || data || null },
    );
  return data; // { id: 'rfnd_...', amount, status, payment_id, ... }
}

/** The webhook can only be trusted when a secret exists to check it against. */
export const webhookEnabled = !!process.env.RAZORPAY_WEBHOOK_SECRET;

/**
 * Verify a Razorpay webhook: HMAC_SHA256(rawBody, webhookSecret) === X-Razorpay-Signature.
 *
 * It MUST be the raw bytes Razorpay sent. Re-serialising the parsed JSON changes key order and
 * whitespace, so the hash would never match and every genuine callback would look forged.
 * @param {Buffer|string} rawBody
 * @param {string} signature
 */
export function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}

/** Verify a checkout result: HMAC_SHA256(`${orderId}|${paymentId}`, keySecret) === signature. */
export function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  if (!KEY_SECRET || !signature) return false;
  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
