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
  seen.set(`${customerId}|${key}`, { status, body, at: Date.now() });
}

export function sweepIdempotency(now = Date.now()) {
  let n = 0;
  for (const [k, v] of seen)
    if (now - v.at > TTL_MS) {
      seen.delete(k);
      n += 1;
    }
  return n;
}
if (!IS_TEST) setInterval(() => sweepIdempotency(), 60 * 60 * 1000).unref();
