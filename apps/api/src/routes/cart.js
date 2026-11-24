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
import { constants } from '../store.js';

export const cartRouter = Router();

cartRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ cart: priceCart(req.customerId) });
  }),
);

/**
 * What these items would cost this customer, fees and tax included, WITHOUT touching the basket.
 *
 * The Dynamic Island card asks "Confirm tomorrow's order · ₹620?" before anything is in the basket,
 * so it needs the real bill up front: the same function checkout charges by, not a subtotal. Placing
 * the order re-checks the figure (expectedTotalPaise), so a price that moves in between is refused.
 */
const QuoteBody = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(60),
        quantity: z.union([
          z.number().positive().max(100000),
          z.string().regex(/^(?=.*[1-9])\d{1,6}(\.\d{1,3})?$/),
        ]),
      }),
    )
    .min(1)
    .max(60),
});
cartRouter.post(
  '/quote',
  validateBody(QuoteBody),
  asyncHandler(async (req, res) => {
    const c = priceCart(req.customerId, req.body.items);
    const cod = constants().cod;
    res.json({
      quote: {
        itemCount: c.items.length,
        // Products the catalogue no longer has: priced as if they were not there, and named so the
        // app does not offer a one-tap order that is missing something.
        missing: req.body.items
          .filter((l) => !c.items.some((x) => x.productId === l.productId))
          .map((l) => l.productId),
        subtotalPaise: c.subtotalPaise,
        discountPaise: c.couponDiscountPaise,
        chargesTotalPaise: c.chargesTotalPaise,
        taxPaise: c.taxPaise,
        totalPaise: c.totalPaise,
        minOrderValuePaise: c.minOrderValuePaise,
        meetsMinimum: c.meetsMinimum,
        couponError: c.couponError,
        walletBalancePaise: c.walletBalancePaise,
        // Cash is decided by the live setting, and by the order being small enough for it.
        codAllowed: !!cod.enabled && Number(c.totalPaise) <= Number(cod.maxOrderPaise),
      },
    });
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
