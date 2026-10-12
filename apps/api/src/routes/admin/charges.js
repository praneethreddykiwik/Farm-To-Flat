/**
 * The fee lines and tax rates that appear on every customer's bill.
 *
 * Editable from the admin console so a platform fee can be introduced, changed or withdrawn
 * without a release — which is the point: the alternative is folding these costs into product
 * prices, where the customer cannot see them and the operator cannot change one without repricing
 * the catalogue.
 *
 * A preview comes back with every read and write. These numbers go onto real bills, and the
 * difference between "5%" and "50%" is one keystroke; seeing what a sample basket would cost
 * before and after is the cheapest guard against that there is.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../../http.js';
import { validateBody } from '../../validate.js';
import { chargesConfig, constants, updateCharges } from '../../store.js';
import { priceBreakdown } from '../../lib/charges.js';
import { recordAction } from '../../lib/audit.js';

export const adminChargesRouter = Router();

/** A ₹500 basket, so the operator sees the effect of a change in rupees rather than in basis points. */
const SAMPLE_SUBTOTAL_PAISE = 50000;

const preview = () => {
  const k = constants();
  const b = priceBreakdown({
    subtotalPaise: SAMPLE_SUBTOTAL_PAISE,
    deliveryChargePaise: k.deliveryChargePaise,
    charges: k.charges,
    tax: k.tax,
  });
  return {
    subtotalPaise: String(b.subtotalPaise),
    lines: b.chargeLines.map((l) => ({ label: l.label, amountPaise: String(l.amountPaise) })),
    taxLabel: b.taxLabel,
    taxPaise: String(b.taxPaise),
    totalPaise: String(b.totalPaise),
  };
};

adminChargesRouter.get(
  '/charges',
  asyncHandler(async (_req, res) => res.json({ ...chargesConfig(), preview: preview() })),
);

const ChargeRule = z.object({
  id: z.string().max(48).optional(),
  label: z.string().min(1).max(48),
  kind: z.enum(['FLAT', 'PERCENT']),
  valuePaise: z.number().int().min(0).max(10000000).optional(),
  valueBps: z.number().int().min(0).max(5000).optional(),
  taxable: z.boolean().optional(),
  enabled: z.boolean().optional(),
  note: z.string().max(120).nullable().optional(),
});

adminChargesRouter.put(
  '/charges',
  validateBody(
    z.object({
      charges: z.array(ChargeRule).max(12).optional(),
      tax: z
        .object({
          enabled: z.boolean().optional(),
          label: z.string().max(24).optional(),
          goodsRateBps: z.number().int().min(0).max(5000).optional(),
          feeRateBps: z.number().int().min(0).max(5000).optional(),
        })
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const before = chargesConfig();
    const r = await updateCharges(req.body);
    if (r.error) throw fail(422, 'VALIDATION', r.error);
    // Awaited. Changing what customers are charged is exactly the kind of decision that must have
    // a name attached to it afterwards.
    await recordAction({
      staff: req.staff,
      action: 'CHARGES_UPDATED',
      target: null,
      details: { before, after: { charges: r.charges, tax: r.tax } },
    });
    res.json({ ...r, deliveryChargePaise: before.deliveryChargePaise, preview: preview() });
  }),
);
