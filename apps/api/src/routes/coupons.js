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

export const couponsRouter = Router();

const Query = z.object({ subtotal: z.coerce.number().int().nonnegative().optional() });

couponsRouter.get(
  '/',
  validateQuery(Query),
  asyncHandler(async (req, res) => {
    // @ts-expect-error validatedQuery is attached by validateQuery
    const subtotal = req.validatedQuery.subtotal ?? 0;
    const now = Date.now();
    const coupons = listCoupons()
      .filter((c) => c.isActive !== false)
      .filter((c) => new Date(c.expiresAt).getTime() > now)
      .filter((c) => !(c.globalCap && c.redeemedCount >= c.globalCap))
      .map((c) => couponPublic(c, subtotal))
      // ones the basket already qualifies for float to the top
      .sort((a, b) => Number(b.meetsMinimum) - Number(a.meetsMinimum));
    res.json({ coupons });
  }),
);
