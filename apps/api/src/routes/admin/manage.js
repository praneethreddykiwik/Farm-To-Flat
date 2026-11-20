/**
 * Admin CRUD that was missing (20 Nov 2026, "everything manageable from the admin"):
 *
 *   POST/PATCH/DELETE /admin/categories[/:id]     catalogue categories (delete only when empty)
 *   PATCH  /admin/orders/:id/source                correct an order's promoter / "how did you hear"
 *   PATCH  /admin/growth/referrals/:id             void a pending referral (no reward will be paid)
 *   DELETE /admin/growth/referrals/:id             remove a pending referral
 *   PATCH  /admin/insights/reminders/:id           edit a logged reminder
 *
 * Every change is audit-logged. Roles: see routes/admin/auth.js RULES.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../../http.js';
import { validateBody } from '../../validate.js';
import { recordAction } from '../../lib/audit.js';
import {
  createCategory,
  deleteCategory,
  getCommunity,
  getOrder,
  updateCategory,
} from '../../store.js';
import { getOps, putOps, removeOps } from '../../ops-store.js';
import { heardFromLabels, normaliseCode } from '../../lib/growth.js';

export const adminManageRouter = Router();

const unwrap = (r) => {
  if (r.error) throw fail(r.error.status, r.error.code, r.error.message);
  return r;
};

// ── categories ───────────────────────────────────────────────────────────────
const TINTS = ['mint', 'butter', 'sky', 'blush', 'lilac', 'sand', 'leaf', 'peach'];
const CategoryBody = z.object({
  name: z.string().trim().min(2).max(40),
  tint: z
    .enum(/** @type {[string, ...string[]]} */ (TINTS))
    .optional()
    .nullable(),
  order: z.number().int().min(0).max(999).optional(),
});

adminManageRouter.post(
  '/categories',
  validateBody(CategoryBody),
  asyncHandler(async (req, res) => {
    const r = unwrap(createCategory(req.body));
    await recordAction({ staff: req.staff, action: 'CATEGORY_CREATED', target: r.category.id });
    res.status(201).json(r);
  }),
);

adminManageRouter.patch(
  '/categories/:id',
  validateBody(CategoryBody.partial()),
  asyncHandler(async (req, res) => {
    const r = unwrap(updateCategory(req.params.id, req.body));
    await recordAction({
      staff: req.staff,
      action: 'CATEGORY_UPDATED',
      target: req.params.id,
      details: req.body,
    });
    res.json(r);
  }),
);

adminManageRouter.delete(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    unwrap(deleteCategory(req.params.id));
    await recordAction({ staff: req.staff, action: 'CATEGORY_DELETED', target: req.params.id });
    res.json({ ok: true });
  }),
);

// ── where an order came from ─────────────────────────────────────────────────
adminManageRouter.patch(
  '/orders/:id/source',
  validateBody(
    z.object({
      promoterCode: z.string().trim().max(12).optional().nullable(),
      heardFrom: z.string().trim().max(20).optional().nullable(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const o = getOrder(req.params.id);
    if (!o) throw fail(404, 'NOT_FOUND', 'Order not found.');
    const code = req.body.promoterCode ? normaliseCode(req.body.promoterCode) : null;
    if (code && !getOps('promoter', code))
      throw fail(422, 'VALIDATION', `No promoter with the code ${code}.`);
    const heard = req.body.heardFrom || null;
    if (heard && !heardFromLabels()[heard])
      throw fail(422, 'VALIDATION', 'That is not one of the answers.');
    const now = new Date().toISOString();
    const attr = getOps('orderAttr', o.id) || { orderId: o.id, customerId: o.customerId, at: now };
    if (req.body.promoterCode !== undefined) {
      attr.promoterCode = code;
      attr.stall = code ? getOps('promoter', code)?.stall || null : null;
    }
    await putOps('orderAttr', o.id, { ...attr, correctedAt: now });
    // The household's first order also carries its acquisition record.
    const acq = o.customerId ? getOps('attribution', o.customerId) : null;
    if (acq && acq.firstOrderId === o.id) {
      const next = { ...acq, correctedAt: now };
      if (req.body.promoterCode !== undefined) next.promoterCode = code;
      if (req.body.heardFrom !== undefined) next.heardFrom = heard;
      if (
        !next.acquisitionSource ||
        req.body.heardFrom !== undefined ||
        req.body.promoterCode !== undefined
      )
        next.acquisitionSource = code ? 'counter' : heard || next.acquisitionSource || null;
      await putOps('attribution', o.customerId, next);
    }
    await recordAction({
      staff: req.staff,
      action: 'ORDER_SOURCE_CORRECTED',
      target: o.id,
      details: req.body,
    });
    res.json({ ok: true });
  }),
);

// ── referrals ────────────────────────────────────────────────────────────────
function pendingReferral(id) {
  const r = getOps('referral', id);
  if (!r) throw fail(404, 'NOT_FOUND', 'No such referral.');
  if (r.status !== 'PENDING')
    throw fail(
      409,
      'SETTLED',
      'Only a pending referral can be changed; this one is already settled.',
    );
  return r;
}

adminManageRouter.patch(
  '/growth/referrals/:id',
  validateBody(z.object({ status: z.literal('VOID'), reason: z.string().trim().min(3).max(140) })),
  asyncHandler(async (req, res) => {
    const r = pendingReferral(req.params.id);
    const saved = await putOps('referral', r.id, {
      ...r,
      status: 'VOID',
      reason: req.body.reason,
      settledAt: new Date().toISOString(),
    });
    await recordAction({
      staff: req.staff,
      action: 'REFERRAL_VOIDED',
      target: r.id,
      details: { reason: req.body.reason },
    });
    res.json({ referral: saved });
  }),
);

adminManageRouter.delete(
  '/growth/referrals/:id',
  asyncHandler(async (req, res) => {
    const r = pendingReferral(req.params.id);
    await removeOps('referral', r.id);
    await recordAction({ staff: req.staff, action: 'REFERRAL_DELETED', target: r.id });
    res.json({ ok: true });
  }),
);

// ── a logged reminder ────────────────────────────────────────────────────────
adminManageRouter.patch(
  '/insights/reminders/:id',
  validateBody(
    z.object({
      at: z.string().datetime({ offset: true }).optional(),
      channel: z.enum(['WHATSAPP', 'PUSH', 'SMS', 'BROADCAST', 'OTHER']).optional(),
      communityId: z.string().max(40).optional().nullable(),
      note: z.string().trim().max(200).optional().nullable(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const cur = getOps('reminder', req.params.id);
    if (!cur) throw fail(404, 'NOT_FOUND', 'No such reminder.');
    if (req.body.communityId && !getCommunity(req.body.communityId))
      throw fail(422, 'VALIDATION', 'That community does not exist.');
    const saved = await putOps('reminder', cur.id, { ...cur, ...req.body });
    await recordAction({ staff: req.staff, action: 'REMINDER_UPDATED', target: cur.id });
    res.json({ reminder: saved });
  }),
);
