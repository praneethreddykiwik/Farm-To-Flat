/**
 * Payment options the operator controls.
 *   GET   /admin/payment-settings   cash-on-delivery + delivery-OTP configuration
 *   PATCH /admin/payment-settings   turn them on or off, set the cash cap
 *
 * Cash on delivery is off until someone deliberately turns it on: an unpaid order costs a real
 * packed bag if nobody answers the door, so it is a business decision rather than a default.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http.js';
import { validateBody } from '../../validate.js';
import { getPaymentSettings, updatePaymentSettings } from '../../store.js';

export const adminPaymentsRouter = Router();

adminPaymentsRouter.get(
  '/payment-settings',
  asyncHandler(async (_req, res) => res.json({ settings: getPaymentSettings() })),
);

adminPaymentsRouter.patch(
  '/payment-settings',
  validateBody(
    z.object({
      codEnabled: z.boolean().optional(),
      // A cap keeps a large amount of cash off a rider's person. 0 means "no cash orders at all",
      // which is deliberately distinct from switching the feature off.
      codMaxOrderPaise: z.number().int().min(0).max(10000000).optional(),
      deliveryOtpEnabled: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => res.json({ settings: updatePaymentSettings(req.body) })),
);
