import { resolveAccess, getCustomer } from '../../customer-store.js';
import { findStaffByMobile } from '../../access-store.js';

/**
 * Admin auth. Two ways in:
 *   1) A logged-in STAFF member (the app's ops console) — their own Bearer session resolves to a
 *      staff role. This needs no shared secret and is how the mobile staff tools authenticate.
 *   2) The shared operator token (the admin WEBSITE) via `x-admin-token: <ADMIN_TOKEN>`.
 * With no ADMIN_TOKEN set it stays open in dev but fails CLOSED in production.
 * @type {import('express').RequestHandler}
 */
export function adminAuth(req, res, next) {
  // 1) a signed-in staff member (app ops console)
  const authz = req.headers.authorization || '';
  const bearer = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (bearer) {
    const cid = resolveAccess(bearer);
    const customer = cid ? getCustomer(cid) : null;
    const staff = customer ? findStaffByMobile(customer.mobile) : null;
    if (staff) {
      req.staff = staff;
      return next();
    }
  }

  // 2) the shared operator token (website)
  const required = process.env.ADMIN_TOKEN;
  if (!required) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({
        error: { code: 'ADMIN_NOT_CONFIGURED', message: 'Admin auth is not configured.' },
      });
    }
    return next();
  }
  if (req.header('x-admin-token') === required) return next();
  return res
    .status(401)
    .json({ error: { code: 'UNAUTHENTICATED', message: 'Admin sign-in required.' } });
}
