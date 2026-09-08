/**
 * Access resolution — the ready seam for the app. Given a phone number, returns whether it's a
 * staff member and which role/sections/AI-access it has, so the app can open into the role's
 * surface instead of the customer app. THE MOBILE APP IS NOT WIRED TO THIS YET — it exists so the
 * app can adopt it later without any backend change.
 *
 *   GET /api/v1/access/resolve?mobile=98XXXXXXXX
 *     -> { isStaff, role, roleLabel?, sections, aiAccess }
 *
 * Note: in production this must be authenticated (resolve the caller's own verified number, not an
 * arbitrary one) so staff assignments can't be enumerated. Left open here only because it is not
 * yet connected to anything.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http.js';
import { validateQuery } from '../validate.js';
import { resolveAccess } from '../lib/roles.js';
import { findStaffByMobile } from '../access-store.js';

export const accessRouter = Router();

const Query = z.object({ mobile: z.string().min(10).max(15) });
accessRouter.get(
  '/resolve',
  validateQuery(Query),
  asyncHandler(async (req, res) => {
    // @ts-expect-error validatedQuery attached by middleware
    const { mobile } = req.validatedQuery;
    const s = findStaffByMobile(mobile);
    res.json({ mobile, ...resolveAccess(s?.role, s?.aiAccess) });
  }),
);
