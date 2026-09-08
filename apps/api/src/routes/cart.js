/**
 * Cart (contract, authenticated). Re-prices on every call, enforces the increment + daily cap, and
 * holds one coupon per cart. ₹500 minimum is reported (meetsMinimum) and enforced at checkout.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateBody } from '../validate.js';
import {
  clearCartCoupon,
  priceCart,
  rawCart,
  removeCartItem,
  setCartCoupon,
  setCartItem,
  validateCoupon,
} from '../customer-store.js';

export const cartRouter = Router();

cartRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ cart: priceCart(req.customerId) });
  }),
);

cartRouter.put(
  '/items',
  validateBody(
    z.object({
      productId: z.string().min(1),
      quantity: z.union([z.number(), z.string()]),
      note: z.string().max(140).nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const r = setCartItem(req.customerId, req.body);
    if (r.error) throw fail(r.error.status, r.error.code, r.error.message);
    res.json({ cart: priceCart(req.customerId) });
  }),
);

cartRouter.delete(
  '/items/:id',
  asyncHandler(async (req, res) => {
    removeCartItem(req.customerId, req.params.id);
    res.json({ cart: priceCart(req.customerId) });
  }),
);

cartRouter.post(
  '/coupon',
  validateBody(z.object({ code: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const cid = req.customerId;
    const subtotal = Number(priceCart(cid).subtotalPaise);
    const r = validateCoupon(cid, req.body.code, subtotal);
    if (r.error) throw fail(r.error.status, r.error.code, r.error.message, r.error.details);
    setCartCoupon(cid, r.coupon.code);
    res.json({ cart: priceCart(cid) });
  }),
);

cartRouter.delete(
  '/coupon',
  asyncHandler(async (req, res) => {
    clearCartCoupon(req.customerId);
    res.json({ cart: priceCart(req.customerId) });
  }),
);

/** exported so the order route can read the underlying cart (items + coupon) */
export { rawCart };
