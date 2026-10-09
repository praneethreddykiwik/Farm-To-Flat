/**
 * Putting Cloudflare in front of this API.
 *
 * Two problems appear the moment a CDN sits in front of an origin, and they are the same problem
 * seen from two sides, so they are solved together here rather than in two places that could
 * drift apart.
 *
 * ----------------------------------------------------------------------------------------------
 * 1. The rate limiter would quietly stop working.
 *
 * `app.set('trust proxy', 1)` tells Express to take the client address from the LAST entry of
 * X-Forwarded-For, because Render terminates TLS one hop in front of us. Add Cloudflare and there
 * are two hops, so `req.ip` becomes a Cloudflare edge address. Every customer in the country would
 * then share one rate-limit bucket: the OTP limiter — the only thing standing between a live MSG91
 * account and toll fraud — would start rejecting real users after a handful of requests, while an
 * attacker behind the same edge node is indistinguishable from them. Nothing would throw. The logs
 * would look fine.
 *
 * Cloudflare sets CF-Connecting-IP to the real client address and overwrites any value the client
 * sent, so it is the right source — but ONLY for requests that genuinely came through Cloudflare.
 * Read naively it is strictly worse than what it replaces: anyone hitting the Render origin
 * directly could set the header by hand and get a fresh bucket per request, which is no limiter at
 * all.
 *
 * 2. Cloudflare is trivial to walk around.
 *
 * WAF rules, bot rules and edge rate limits all live at the edge. They do nothing for a request
 * sent straight to farm-to-flat.onrender.com, and that hostname is public. Render's plans do not
 * offer an IP allowlist, so the origin has to authenticate the edge itself.
 *
 * ----------------------------------------------------------------------------------------------
 * The fix for both: Cloudflare injects a shared secret header via a Transform Rule, and the origin
 * requires it. That single check is what makes CF-Connecting-IP trustworthy — the header is only
 * believed on a request already proven to have come through Cloudflare — and what makes the edge
 * rules unavoidable.
 *
 * Inert until ORIGIN_SHARED_SECRET is set, so nothing changes before the Cloudflare side is
 * actually configured, and so a misconfiguration cannot lock the API shut by surprise.
 */
import { timingSafeEqual } from 'node:crypto';

const HEADER = 'x-origin-secret';

// Read per call rather than captured at import. The value is a single env var, so the cost is
// nothing, and it keeps the tests honest: they exercise the real module with the real env instead
// of a copy frozen before the suite could set it.
const secret = () => process.env.ORIGIN_SHARED_SECRET || '';

/** Whether the origin lock is switched on at all. */
export const originLockEnabled = () => !!secret();

/** Constant-time compare that tolerates a length mismatch without leaking it through timing. */
function secretMatches(given) {
  const want = secret();
  if (typeof given !== 'string' || given.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

/** True when this request carries proof it was routed through our Cloudflare zone. */
export function viaCloudflare(req) {
  if (!secret()) return false;
  return secretMatches(req.get(HEADER));
}

/**
 * The client's address.
 *
 * Replaces the bare `req.ip` the limiter used before. CF-Connecting-IP is preferred, but only on a
 * request that passed the origin lock — see the note above about why reading it unconditionally
 * would be worse than not reading it at all.
 */
export function clientIp(req) {
  if (viaCloudflare(req)) {
    const cf = req.get('cf-connecting-ip');
    if (cf) return cf;
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Refuse anything that did not come through Cloudflare.
 *
 * `/health` is exempt: Render's own health checks reach the container directly, never through the
 * edge, and failing them would take the service down to defend it.
 *
 * 403 rather than 404 deliberately. This is not a secret endpoint being hidden; it is a correctly
 * addressed request arriving by the wrong route, and an operator debugging a DNS cutover at
 * 2am should be told which of those two things happened.
 */
export function requireCloudflare(req, res, next) {
  if (!secret()) return next();
  if (req.path === '/health' || req.path === '/') return next();
  if (viaCloudflare(req)) return next();
  return res.status(403).json({
    error: {
      code: 'DIRECT_ORIGIN_ACCESS',
      message: 'This API is reachable only through its public hostname.',
    },
  });
}
