/**
 * Public coupon list — what the shopper can see and apply, with the terms spelled out.
 *   GET /coupons?subtotal=  active, unexpired, not-fully-claimed coupons; pass the cart subtotal
 *                           (paise) to get the "Add ₹X more to unlock" line per coupon.
 * Terms only — never caps or redemption counts (that's the admin serialiser's job).
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http.js';
import { validateQuery } from '../validate.js';
import { couponPublic } from '../serialize.js';
import { listCoupons } from '../store.js';
import { redeemedCodes } from '../customer-store.js';
import { optionalAuth } from './require-auth.js';

export const couponsRouter = Router();

const Query = z.object({ subtotal: z.coerce.number().int().nonnegative().optional() });

couponsRouter.get(
  '/',
  optionalAuth,
  validateQuery(Query),
  asyncHandler(async (req, res) => {
    // @ts-expect-error validatedQuery is attached by validateQuery
    const subtotal = req.validatedQuery.subtotal ?? 0;
    const now = Date.now();
    // A coupon this customer has already spent used to render with a live Apply button and then
    // fail with 409 on tap. Lock the row instead of letting them find out the hard way.
    const used = req.customerId ? redeemedCodes(req.customerId) : new Set();
    const coupons = listCoupons()
      .filter((c) => c.isActive !== false)
      .filter((c) => new Date(c.expiresAt).getTime() > now)
      .filter((c) => !(c.globalCap && c.redeemedCount >= c.globalCap))
      .map((c) => ({ ...couponPublic(c, subtotal), alreadyUsed: used.has(c.code) }))
      // ones the basket already qualifies for float to the top; spent ones sink
      .sort(
        (a, b) =>
          Number(a.alreadyUsed) - Number(b.alreadyUsed) ||
          Number(b.meetsMinimum) - Number(a.meetsMinimum),
      );
    res.json({ coupons });
  }),
);
