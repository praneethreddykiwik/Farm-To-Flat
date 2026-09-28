/**
 * Customer auth middleware. Resolves the Bearer access token to a customer id (req.customerId).
 * On failure returns 401 UNAUTHENTICATED — the app refreshes once, then signs the user out.
 */
import { resolveAccess } from '../customer-store.js';

/** @type {import('express').RequestHandler} */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || req.headers.Authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
  const customerId = token && resolveAccess(token);
  if (!customerId) {
    return res
      .status(401)
      .json({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in again.' } });
  }
  req.customerId = customerId;
  next();
}

/**
 * Same resolution, but never rejects. For public routes that read better when they know who is
 * asking — the coupon list marks the ones this customer has already redeemed — yet must still
 * answer a signed-out browser.
 * @type {import('express').RequestHandler}
 */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || req.headers.Authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
  const customerId = token && resolveAccess(token);
  if (customerId) req.customerId = customerId;
  next();
}
