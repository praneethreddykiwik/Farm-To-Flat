import { resolveAccess, getCustomer } from '../../customer-store.js';
import { verifyAdminSession } from '../../lib/admin-session.js';
import { roleForEmail } from '../../lib/admin-directory.js';
import { findStaffByMobile } from '../../access-store.js';
import { ROLE_META } from '../../lib/roles.js';
import { IS_PROD } from '../../lib/env.js';
import { fail } from '../../http.js';

/**
 * Admin auth. Three ways in:
 *   1) A Google-signed-in operator via `x-admin-session` — issued by POST /admin/auth/google after
 *      Google's own ID token verified AND the address was found on ADMIN_GOOGLE_EMAILS.
 *   2) A logged-in STAFF member (the app's ops console AND the web panel) — their own Bearer session
 *      resolves to a staff role. No shared secret involved.
 *   3) The shared operator token via `x-admin-token: <ADMIN_TOKEN>` — for scripts/tools. Treated as
 *      SUPER_ADMIN. With no ADMIN_TOKEN set it stays open in dev (also SUPER_ADMIN) but fails CLOSED
 *      in production.
 * Sets `req.staff = { role, ... }` for adminAuthorize below.
 * @type {import('express').RequestHandler}
 */
export function adminAuth(req, res, next) {
  // 1) a Google-signed-in operator.
  // The role is re-read from the allowlist on EVERY request rather than trusted from the token.
  // The token is valid for twelve hours, so a role carried inside it would keep working for twelve
  // hours after someone was removed from ADMIN_GOOGLE_EMAILS — which is the whole point of removing
  // them. Re-reading makes revocation take effect on the next request.
  const sessionToken = req.header('x-admin-session');
  if (sessionToken) {
    const session = verifyAdminSession(sessionToken);
    const role = session ? roleForEmail(session.email) : null;
    if (!role)
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'That sign-in has expired. Sign in again.' },
      });
    req.staff = { role, email: session.email, name: session.name, viaGoogle: true };
    return next();
  }

  // 2) a signed-in staff member
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
    // A Bearer that is NOT a staff member is a customer (or a dead token): refuse outright. It must
    // never fall through to the dev "no ADMIN_TOKEN → open" shortcut below.
    return res
      .status(401)
      .json({ error: { code: 'UNAUTHENTICATED', message: 'Admin sign-in required.' } });
  }

  // 3) the shared operator token
  const required = process.env.ADMIN_TOKEN;
  if (!required) {
    if (IS_PROD) {
      return res.status(503).json({
        error: { code: 'ADMIN_NOT_CONFIGURED', message: 'Admin auth is not configured.' },
      });
    }
    req.staff = { role: 'SUPER_ADMIN', viaToken: true, dev: true };
    return next();
  }
  if (safeEqual(req.header('x-admin-token') || '', required)) {
    req.staff = { role: 'SUPER_ADMIN', viaToken: true };
    return next();
  }
  return res
    .status(401)
    .json({ error: { code: 'UNAUTHENTICATED', message: 'Admin sign-in required.' } });
}

/** Constant-time string compare so the shared token can't be guessed byte-by-byte via timing. */
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

const ADMIN_UP = ['ADMIN', 'SUPER_ADMIN'];

/**
 * What each admin route needs. `sections` = any of the role's ROLE_META sections; `roles` = an
 * explicit role list; `null` = any staff member. Evaluated top-down, first match wins; anything not
 * listed requires ADMIN or above (deny by default). SUPER_ADMIN always passes.
 *
 * Before this, adminAuth only checked "is a staff member" — a FULFILMENT driver could edit prices,
 * read margin analytics and grant themselves SUPER_ADMIN (all verified with live requests).
 */
const RULES = [
  { when: (p) => p.startsWith('/metrics'), roles: null }, // console KPIs: every staff role
  // Customer notes are READ-ONLY and both working roles need them: the buyer reads the item notes
  // before the market, the delivery team reads the door instructions. Listed before the general
  // /orders rule, which would otherwise shut the buyer out of the very thing they have to shop to.
  {
    when: (p, m) => p === '/orders/notes' && m === 'GET',
    sections: ['orders', 'fulfilment', 'procurement'],
  },
  // Both of these sit BEFORE the general /orders rule, which grants the fulfilment and procurement
  // sections — a delivery driver must not be able to refund 31 orders in one request, and the audit
  // trail exists to be read by the person everyone else answers to, not by everyone.
  // SUPER_ADMIN short-circuits roleMayAccess above, so an empty roles list means "super only".
  { when: (p) => p === '/orders/close-stale', roles: [] },
  { when: (p) => p.startsWith('/audit'), roles: [] },
  { when: (p) => p.startsWith('/orders'), sections: ['orders', 'fulfilment'] },
  { when: (p, m) => p === '/procurement/settings' && m !== 'GET', roles: ADMIN_UP },
  { when: (p) => p === '/procurement/approve' || p === '/procurement/approvals', roles: ADMIN_UP },
  { when: (p) => p.startsWith('/procurement'), sections: ['procurement'] },
  { when: (p) => p.startsWith('/products'), sections: ['products'] },
  { when: (p) => p.startsWith('/communities'), sections: ['communities'] },
  { when: (p) => p.startsWith('/analytics'), sections: ['statistics'] },
  { when: (p) => p.startsWith('/access'), roles: ADMIN_UP },
  { when: (p) => p.startsWith('/coupons'), roles: ADMIN_UP },
  { when: (p) => p.startsWith('/support'), roles: ADMIN_UP },
];

/** Pure check, exported for tests. */
export function roleMayAccess(role, path, method) {
  if (!role || !ROLE_META[role]) return false;
  if (role === 'SUPER_ADMIN') return true;
  const rule = RULES.find((r) => r.when(path, method));
  if (!rule) return ADMIN_UP.includes(role);
  if (rule.roles === null) return true;
  if (rule.roles) return rule.roles.includes(role);
  const mine = ROLE_META[role].sections || [];
  return rule.sections.some((s) => mine.includes(s));
}

/** @type {import('express').RequestHandler} */
export function adminAuthorize(req, _res, next) {
  const role = req.staff?.role;
  if (!roleMayAccess(role, req.path, req.method))
    return next(fail(403, 'FORBIDDEN', 'Your role cannot do that.'));
  next();
}
