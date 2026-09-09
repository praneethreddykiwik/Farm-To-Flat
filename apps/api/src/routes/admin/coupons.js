/**
 * Admin coupon management. Create coupons of several kinds and manage them:
 *   GET    /admin/coupons          list (with caps + redemption count)
 *   POST   /admin/coupons          create — PERCENT (% off) | FLAT (₹ off) | FREE_ITEM
 *   PATCH  /admin/coupons/:code    edit any field (value, min order, expiry, cap, active…)
 *   DELETE /admin/coupons/:code    remove
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../../http.js';
import { validateBody } from '../../validate.js';
import { couponAdmin } from '../../serialize.js';
import {
  createCoupon,
  deleteCoupon,
  getCoupon,
  getProduct,
  listCoupons,
  updateCoupon,
} from '../../store.js';

export const adminCouponsRouter = Router();

const paise = z.number().int().nonnegative();

// One schema, three shapes — the discount type decides which value field is required.
const CreateCoupon = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(24)
      .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only.'),
    label: z.string().max(60).optional(),
    type: z.enum(['PERCENT', 'FLAT', 'FREE_ITEM']),
    percentOff: z.number().min(1).max(100).optional(), // for PERCENT (whole %)
    valuePaise: paise.optional(), // for FLAT (₹ off)
    freeProductId: z.string().optional(), // for FREE_ITEM
    minOrderPaise: paise.default(0),
    expiresAt: z.string().optional(),
    globalCap: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'PERCENT' && v.percentOff == null)
      ctx.addIssue({ code: 'custom', message: 'Set a percentage (1–100).', path: ['percentOff'] });
    if (v.type === 'FLAT' && v.valuePaise == null)
      ctx.addIssue({ code: 'custom', message: 'Set the ₹ amount off.', path: ['valuePaise'] });
    if (v.type === 'FREE_ITEM' && !v.freeProductId)
      ctx.addIssue({ code: 'custom', message: 'Pick the free product.', path: ['freeProductId'] });
  });

// PERCENT stores basis points (valueBp); the form sends a whole percent — convert here.
function toStored(body) {
  const row = {
    code: body.code,
    label: body.label,
    type: body.type,
    minOrderPaise: body.minOrderPaise ?? 0,
    ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
    ...(body.globalCap !== undefined ? { globalCap: body.globalCap } : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
  };
  if (body.type === 'PERCENT') row.valueBp = Math.round(body.percentOff * 100);
  if (body.type === 'FLAT') row.valuePaise = body.valuePaise;
  if (body.type === 'FREE_ITEM') row.freeProductId = body.freeProductId;
  return row;
}

adminCouponsRouter.get(
  '/coupons',
  asyncHandler(async (_req, res) => {
    res.json({ coupons: listCoupons().map(couponAdmin) });
  }),
);

adminCouponsRouter.post(
  '/coupons',
  validateBody(CreateCoupon),
  asyncHandler(async (req, res) => {
    const b = req.body;
    if (getCoupon(b.code)) throw fail(409, 'CODE_TAKEN', 'That code already exists.');
    if (b.type === 'FREE_ITEM' && !getProduct(b.freeProductId))
      throw fail(422, 'VALIDATION', 'Unknown product for the free item.');
    const coupon = createCoupon(toStored(b));
    res.status(201).json({ coupon: couponAdmin(coupon) });
  }),
);

const UpdateCoupon = CreateCoupon._def.schema.partial();

adminCouponsRouter.patch(
  '/coupons/:code',
  validateBody(UpdateCoupon),
  asyncHandler(async (req, res) => {
    if (!getCoupon(req.params.code)) throw fail(404, 'NOT_FOUND', 'Coupon not found.');
    const patch = { ...req.body };
    if (patch.percentOff != null) {
      patch.valueBp = Math.round(patch.percentOff * 100);
      delete patch.percentOff;
    }
    delete patch.code; // code is the id — not editable
    const coupon = updateCoupon(req.params.code, patch);
    res.json({ coupon: couponAdmin(coupon) });
  }),
);

adminCouponsRouter.delete(
  '/coupons/:code',
  asyncHandler(async (req, res) => {
    if (!deleteCoupon(req.params.code)) throw fail(404, 'NOT_FOUND', 'Coupon not found.');
    res.json({ ok: true });
  }),
);
