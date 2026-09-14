/**
 * Access resolution — the app calls this right after sign-in to learn whether the signed-in number is
 * staff (and which role/sections/AI-access) so it can open into the right surface.
 *
 *   GET /api/v1/access/resolve   (authenticated)
 *     -> { mobile, isStaff, role, roleLabel?, sections, aiAccess }
 *
 * AUTHENTICATED and self-only: it resolves ONLY the caller's own verified number (from the Bearer
 * session), never an arbitrary ?mobile= — otherwise anyone could enumerate which numbers are staff and
 * their exact privileges. The route is mounted behind requireAuth in index.js.
 */
import { Router } from 'express';
import { asyncHandler } from '../http.js';
import { resolveAccess } from '../lib/roles.js';
import { findStaffByMobile } from '../access-store.js';
import { getCustomer } from '../customer-store.js';

export const accessRouter = Router();

accessRouter.get(
  '/resolve',
  asyncHandler(async (req, res) => {
    // requireAuth (mounted in index.js) has set req.customerId. Resolve the caller's OWN number only.
    const cust = getCustomer(req.customerId);
    const mobile = cust?.mobile || null;
    const s = mobile ? findStaffByMobile(mobile) : null;
    res.json({ mobile, ...resolveAccess(s?.role, s?.aiAccess) });
  }),
);
