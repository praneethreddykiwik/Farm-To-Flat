/** Request correlation ids and idempotency keys, generated client-side. */

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** @param {number} len */
export function shortId(len = 12) {
  let out = '';
  for (let i = 0; i < len; i += 1) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

export function requestId() {
  return `req_${Date.now().toString(36)}_${shortId(8)}`;
}

export function idempotencyKey() {
  return `idem_${Date.now().toString(36)}_${shortId(16)}`;
}
