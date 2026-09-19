/**
 * Fixed-window rate limiting, in memory.
 *
 * Why this exists: without it the OTP flow is an account-takeover path. `verifyOtp` allows three
 * guesses, but `setOtp` resets the counter to zero on every new request and nothing limited how
 * often you could ask for a new code — so an attacker gets three fresh guesses per request, for as
 * many requests as they like, against a six-digit space.
 *
 * It is also the only thing standing between a live MSG91 account and toll fraud: every unthrottled
 * `/otp/request` sends a real SMS that costs real money.
 *
 * In memory rather than Redis because every other piece of per-user state in this service
 * (sessions, carts, OTPs, the order-number sequence) already lives in one process's memory. That is
 * a deliberate, documented constraint, not an oversight — but it does mean THIS LIMITER ONLY HOLDS
 * WHILE THERE IS ONE PROCESS. The day a second replica is added, every limit here silently doubles
 * and this must move to a shared store.
 */
import { fail } from '../http.js';

/** key -> { count, resetAt }. Swept periodically so a flood of unique keys cannot grow it forever. */
const buckets = new Map();

const SWEEP_MS = 60_000;
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
}, SWEEP_MS);
// Never hold the process open just to sweep a cache.
sweeper.unref?.();

/** Exposed for tests, which need a clean slate between cases. */
export function resetRateLimits() {
  buckets.clear();
}

/**
 * @param {object} opts
 * @param {number} opts.windowMs        length of the window
 * @param {number} opts.max             requests allowed per key per window
 * @param {(req: any) => string} opts.key  what to count by — IP, mobile number, or both
 * @param {string} [opts.code]          error code returned to the client
 * @param {string} [opts.message]       human-readable message
 * @param {boolean} [opts.enabled]      off under NODE_ENV=test so the suite can cycle OTPs freely;
 *                                      its own tests pass `enabled: true` to exercise the logic.
 */
export function rateLimit({
  windowMs,
  max,
  key,
  code = 'RATE_LIMITED',
  message,
  enabled = process.env.NODE_ENV !== 'test',
}) {
  return (req, _res, next) => {
    if (!enabled) return next();
    let k;
    try {
      k = key(req);
    } catch {
      k = null;
    }
    // A key we cannot compute (malformed body, say) is not a reason to reject the request —
    // validation will deal with it a moment later.
    if (!k) return next();

    const now = Date.now();
    let b = buckets.get(k);
    if (!b || now > b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(k, b);
    }
    b.count += 1;
    if (b.count > max) {
      const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      _res.setHeader('Retry-After', String(retryAfter));
      return next(
        fail(429, code, message || 'Too many requests. Please wait a moment and try again.', {
          retryAfterSeconds: String(retryAfter),
        }),
      );
    }
    return next();
  };
}

/** Client address, honouring the proxy Render terminates TLS at (see `trust proxy` in index.js). */
export const ipOf = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
