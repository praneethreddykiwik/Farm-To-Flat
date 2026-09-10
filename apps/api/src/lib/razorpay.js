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
