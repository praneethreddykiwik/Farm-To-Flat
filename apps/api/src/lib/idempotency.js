/**
 * Idempotent replays for money-bearing POSTs. The app sends an `idempotencyKey` with every order; a
 * retry after a lost response (mobile network, cold host) used to hit an already-emptied cart and get
 * `422 CART_EMPTY` — the order and its paymentIntent existed server-side but the client never learned
 * the id, so the order sat in PENDING_PAYMENT and the wallet debit was held. Now the first successful
 * response is remembered per (customer, key) for 24h and replayed verbatim.
 *
 * In-memory: a restart forgets keys (the retry then behaves as before — still safe, never doubled,
 * because the cart is already empty). Bounded by a periodic sweep.
 */
import { IS_TEST } from './env.js';

const TTL_MS = 24 * 60 * 60 * 1000;
/** `${customerId}|${key}` -> { status, body, at } */
const seen = new Map();

export function idempotencyGet(customerId, key) {
  if (!key) return null;
  const hit = seen.get(`${customerId}|${key}`);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    seen.delete(`${customerId}|${key}`);
    return null;
  }
  return hit;
}

export function idempotencyPut(customerId, key, status, body) {
  if (!key) return;
  inFlight.delete(`${customerId}|${key}`);
  seen.set(`${customerId}|${key}`, { status, body, at: Date.now() });
}

/**
 * Keys whose first request is still being worked on.
 *
 * Review #2 (21 Nov 2026): the response was only remembered AFTER the slow part (the Razorpay call),
 * so a second copy of the same request arriving meanwhile — a double tap, or the phone's own retry
 * on a flaky network — was not recognised as a repeat. Reserve the key first; a copy that arrives
 * while it is reserved is told to wait instead of being worked on again.
 */
const inFlight = new Map();
const IN_FLIGHT_MS = 2 * 60 * 1000; // a crashed handler must not hold a key forever

/** @returns {boolean} false when another request with this key is already being handled */
export function idempotencyBegin(customerId, key) {
  if (!key) return true;
  const k = `${customerId}|${key}`;
  const at = inFlight.get(k);
  if (at && Date.now() - at < IN_FLIGHT_MS) return false;
  inFlight.set(k, Date.now());
  return true;
}

/** Release a reservation without remembering a response (the request failed; a retry may run). */
export function idempotencyAbort(customerId, key) {
  if (key) inFlight.delete(`${customerId}|${key}`);
}

/**
 * The key for this request: the body field (older apps), else the `Idempotency-Key` header — which
 * is what the current app actually sends; the server used to read only the body, so the app's key
 * never arrived.
 */
export function idempotencyKeyOf(req) {
  const fromBody = req.body?.idempotencyKey;
  if (fromBody) return String(fromBody);
  const h = req.get?.('idempotency-key') || req.headers?.['idempotency-key'];
  const v = Array.isArray(h) ? h[0] : h;
  return v && v.length >= 8 && v.length <= 80 ? String(v) : undefined;
}

export function sweepIdempotency(now = Date.now()) {
  let n = 0;
  for (const [k, v] of seen)
    if (now - v.at > TTL_MS) {
      seen.delete(k);
      n += 1;
    }
  for (const [k, at] of inFlight) if (now - at > IN_FLIGHT_MS) inFlight.delete(k);
  return n;
}
if (!IS_TEST) setInterval(() => sweepIdempotency(), 60 * 60 * 1000).unref();
