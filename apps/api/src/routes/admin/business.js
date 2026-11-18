/**
 * The admin side of everything asked for in the 17 Nov 2026 business review.
 *
 *   GET    /business/status                    is the OpsRecord table there? (and the SQL if not)
 *
 *   Growth — where customers come from
 *   GET    /growth/promoters                   promoters with their numbers for a date range
 *   POST   /growth/promoters                   add one          PATCH/DELETE /growth/promoters/:code
 *   GET    /growth/referrals                   who invited whom, and what was paid
 *   GET    /growth/settings  PUT …             referral reward, waitlist threshold, "how did you hear"
 *   GET    /growth/waitlist                    waitlist communities + how many are waiting
 *   POST   /growth/waitlist                    pre-load one     PATCH/DELETE /growth/waitlist/:id
 *
 *   Insights — the five Friday questions
 *   GET    /insights?from&to                   acquisition, repeat, routine, promise, offers
 *   GET    /insights/products?from&to          winners and losers
 *   POST   /insights/reminders                 log a reminder   DELETE /insights/reminders/:id
 *   PUT    /insights/capacity/:communityId     orders a community can take per morning
 *   PUT    /insights/delays/:orderId           why a delivery was late   DELETE …
 *
 *   Finance — the full P&L
 *   GET    /finance?from&to                    revenue → gross → net profit, before and after tax
 *   GET    /finance/expenses                   POST, PATCH/DELETE /finance/expenses/:id
 *   POST   /finance/expenses/import            many rows at once (from a spreadsheet)
 *   GET    /finance/settings  PUT …            the tax rate used for "after tax"
 *
 *   Feedback — reviews alongside complaints
 *   GET    /feedback/reviews                   PUT /feedback/reviews/:orderId (reply / hide)
 *
 * Wastage entry lives under /procurement/wastage (procurement.js area) so the buying team can
 * record it; see the end of this file.
 *
 * Everything here is ADMIN or above (deny-by-default in auth.js), except /procurement/wastage which
 * the procurement role can use. Changes to money and settings are written to the audit trail.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../../http.js';
import { validateBody } from '../../validate.js';
import { recordAction } from '../../lib/audit.js';
import { id as newId } from '../../lib/ids.js';
import { listCommunities, getCommunity, getOrder, getProduct } from '../../store.js';
import { getCustomer } from '../../customer-store.js';
import {
  opsStatus,
  listOps,
  getOps,
  putOps,
  removeOps,
  getSettings,
  saveSettings,
} from '../../ops-store.js';
import {
  HEARD_FROM,
  PROMOTER_CODE_RE,
  isReservedPrefix,
  normaliseCode,
  savePromoter,
} from '../../lib/growth.js';
import {
  acquisition,
  repeat,
  routine,
  promise,
  offers,
  products,
  buffer,
  finance,
  rangeOf,
  DELAY_REASONS,
  EXPENSE_CATEGORIES,
} from '../../lib/insights.js';
import { maskMobile } from '../../lib/customer-history.js';

export const adminBusinessRouter = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-19.');
const rupees = z.number().int().min(0).max(1_000_000_000); // paise; up to ₹1 crore
const nameOf = (cid) => {
  const c = cid ? getCustomer(cid) : null;
  return c
    ? { name: c.name || null, mobileMasked: maskMobile(c.mobile) }
    : { name: null, mobileMasked: null };
};

adminBusinessRouter.get(
  '/business/status',
  asyncHandler(async (_req, res) => res.json(await opsStatus())),
);

// ── promoters ───────────────────────────────────────────────────────────────

const PromoterBody = z.object({
  code: z.string().trim().min(3).max(12),
  name: z.string().trim().min(1).max(60),
  stall: z.string().trim().max(60).optional().nullable(),
  communityId: z.string().max(40).optional().nullable(),
  mobile: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number.')
    .optional()
    .nullable()
    .or(z.literal('')),
  active: z.boolean().optional(),
});

adminBusinessRouter.get(
  '/growth/promoters',
  asyncHandler(async (req, res) => {
    const range = rangeOf(req.query);
    const stats = new Map(acquisition(range).byPromoter.map((p) => [p.code, p]));
    const promoters = listOps('promoter')
      .map((p) => ({
        code: p.id,
        name: p.name,
        stall: p.stall || null,
        communityId: p.communityId || null,
        communityName: p.communityId ? getCommunity(p.communityId)?.name || null : null,
        mobile: p.mobile || null,
        active: p.active !== false,
        createdAt: p.createdAt || null,
        orders: stats.get(p.id)?.orders || 0,
        firstOrders: stats.get(p.id)?.firstOrders || 0,
        revenuePaise: stats.get(p.id)?.revenuePaise || '0',
      }))
      .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name));
    res.json({
      range,
      promoters,
      communities: listCommunities().map((c) => ({ id: c.id, name: c.name })),
    });
  }),
);

adminBusinessRouter.post(
  '/growth/promoters',
  validateBody(PromoterBody),
  asyncHandler(async (req, res) => {
    const code = normaliseCode(req.body.code);
    if (!PROMOTER_CODE_RE.test(code))
      throw fail(422, 'VALIDATION', 'A code is 3–12 letters or digits, e.g. RAVI01.');
    if (isReservedPrefix(code))
      throw fail(
        422,
        'VALIDATION',
        'Codes starting with NB are reserved for customer invite codes.',
      );
    if (getOps('promoter', code) || getOps('refCode', code))
      throw fail(409, 'CONFLICT', `The code ${code} is already in use.`);
    if (req.body.communityId && !getCommunity(req.body.communityId))
      throw fail(422, 'VALIDATION', 'That community does not exist.');
    const saved = await savePromoter(code, { ...req.body, mobile: req.body.mobile || null });
    await recordAction({
      staff: req.staff,
      action: 'PROMOTER_ADDED',
      target: code,
      details: { name: saved.name },
    });
    res.status(201).json({ promoter: { code, ...saved } });
  }),
);

adminBusinessRouter.patch(
  '/growth/promoters/:code',
  validateBody(PromoterBody.partial().omit({ code: true })),
  asyncHandler(async (req, res) => {
    const code = normaliseCode(req.params.code);
    const cur = getOps('promoter', code);
    if (!cur) throw fail(404, 'NOT_FOUND', 'No promoter with that code.');
    if (req.body.communityId && !getCommunity(req.body.communityId))
      throw fail(422, 'VALIDATION', 'That community does not exist.');
    const saved = await savePromoter(code, {
      ...cur,
      ...req.body,
      mobile: req.body.mobile ?? cur.mobile ?? null,
    });
    await recordAction({
      staff: req.staff,
      action: 'PROMOTER_UPDATED',
      target: code,
      details: req.body,
    });
    res.json({ promoter: { code, ...saved } });
  }),
);

adminBusinessRouter.delete(
  '/growth/promoters/:code',
  asyncHandler(async (req, res) => {
    const code = normaliseCode(req.params.code);
    if (!getOps('promoter', code)) throw fail(404, 'NOT_FOUND', 'No promoter with that code.');
    // Orders already credited keep their credit in the numbers; a deleted code just stops working.
    await removeOps('promoter', code);
    await recordAction({ staff: req.staff, action: 'PROMOTER_DELETED', target: code });
    res.json({ ok: true });
  }),
);

// ── referrals + growth settings ──────────────────────────────────────────────

adminBusinessRouter.get(
  '/growth/referrals',
  asyncHandler(async (_req, res) => {
    const list = listOps('referral')
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .map((r) => ({
        id: r.id,
        status: r.status,
        reason: r.reason || null,
        orderNumber: r.orderNumber || null,
        at: r.at,
        settledAt: r.settledAt || null,
        paidPaise: String(r.paidPaise || 0),
        welcomePaise: String(r.welcomePaise || 0),
        inviter: nameOf(r.referrerId),
        invited: nameOf(r.refereeId),
      }));
    const paid = list.filter((r) => r.status === 'REWARDED');
    res.json({
      referrals: list,
      totals: {
        invites: list.length,
        pending: list.filter((r) => r.status === 'PENDING').length,
        rewarded: paid.length,
        paidPaise: String(
          paid.reduce((n, r) => n + Number(r.paidPaise) + Number(r.welcomePaise), 0),
        ),
      },
    });
  }),
);

const GrowthSettingsBody = z.object({
  referralEnabled: z.boolean().optional(),
  referrerRewardPaise: z.number().int().min(0).max(100000).optional(),
  refereeRewardPaise: z.number().int().min(0).max(100000).optional(),
  waitlistOpenAt: z.number().int().min(1).max(10000).optional(),
  askHeardFrom: z.boolean().optional(),
});

adminBusinessRouter.get(
  '/growth/settings',
  asyncHandler(async (_req, res) =>
    res.json({ settings: getSettings('growth'), heardFrom: HEARD_FROM }),
  ),
);

adminBusinessRouter.put(
  '/growth/settings',
  validateBody(GrowthSettingsBody),
  asyncHandler(async (req, res) => {
    const settings = await saveSettings('growth', req.body);
    await recordAction({ staff: req.staff, action: 'GROWTH_SETTINGS_CHANGED', details: req.body });
    res.json({ settings });
  }),
);

// ── waitlist communities ─────────────────────────────────────────────────────

export const WAITLIST_STATUS = ['WAITLIST', 'REQUESTED', 'OPENED', 'DECLINED'];

const WaitlistBody = z.object({
  name: z.string().trim().min(2).max(80),
  area: z.string().trim().max(80).optional().nullable(),
  towers: z.number().int().min(0).max(500).optional().nullable(),
  flats: z.number().int().min(0).max(100000).optional().nullable(),
  distanceKm: z.number().min(0).max(100).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
  status: z.enum(/** @type {[string, ...string[]]} */ (WAITLIST_STATUS)).optional(),
  communityId: z.string().max(40).optional().nullable(),
});

function waitlistView(w, threshold) {
  const joins = listOps('waitlistJoin').filter((j) => j.waitlistId === w.id);
  return {
    id: w.id,
    name: w.name,
    area: w.area || null,
    towers: w.towers ?? null,
    flats: w.flats ?? null,
    distanceKm: w.distanceKm ?? null,
    note: w.note || null,
    status: w.status || 'WAITLIST',
    source: w.source || 'ADMIN',
    requestedBy: w.requestedBy ? nameOf(w.requestedBy) : null,
    communityId: w.communityId || null,
    createdAt: w.createdAt || null,
    waiting: joins.length,
    threshold,
    progressPct: Math.min(100, Math.round((joins.length / Math.max(1, threshold)) * 100)),
  };
}

adminBusinessRouter.get(
  '/growth/waitlist',
  asyncHandler(async (_req, res) => {
    const threshold = getSettings('growth').waitlistOpenAt;
    const list = listOps('waitlist')
      .map((w) => waitlistView(w, threshold))
      .sort((a, b) => b.waiting - a.waiting || a.name.localeCompare(b.name));
    res.json({ waitlist: list, threshold });
  }),
);

adminBusinessRouter.post(
  '/growth/waitlist',
  validateBody(WaitlistBody),
  asyncHandler(async (req, res) => {
    const clash = listOps('waitlist').find(
      (w) => w.name.trim().toLowerCase() === req.body.name.trim().toLowerCase(),
    );
    if (clash) throw fail(409, 'CONFLICT', `${clash.name} is already on the list.`);
    const wid = newId('wl', 8);
    const saved = await putOps('waitlist', wid, {
      ...req.body,
      status: req.body.status || 'WAITLIST',
      source: 'ADMIN',
      createdAt: new Date().toISOString(),
    });
    await recordAction({
      staff: req.staff,
      action: 'WAITLIST_ADDED',
      target: wid,
      details: { name: saved.name },
    });
    res.status(201).json({ community: waitlistView(saved, getSettings('growth').waitlistOpenAt) });
  }),
);

adminBusinessRouter.patch(
  '/growth/waitlist/:id',
  validateBody(WaitlistBody.partial()),
  asyncHandler(async (req, res) => {
    const cur = getOps('waitlist', req.params.id);
    if (!cur) throw fail(404, 'NOT_FOUND', 'Not on the waitlist.');
    if (req.body.communityId && !getCommunity(req.body.communityId))
      throw fail(422, 'VALIDATION', 'That community does not exist.');
    const saved = await putOps('waitlist', cur.id, {
      ...cur,
      ...req.body,
      updatedAt: new Date().toISOString(),
    });
    await recordAction({
      staff: req.staff,
      action: 'WAITLIST_UPDATED',
      target: cur.id,
      details: req.body,
    });
    res.json({ community: waitlistView(saved, getSettings('growth').waitlistOpenAt) });
  }),
);

adminBusinessRouter.delete(
  '/growth/waitlist/:id',
  asyncHandler(async (req, res) => {
    const cur = getOps('waitlist', req.params.id);
    if (!cur) throw fail(404, 'NOT_FOUND', 'Not on the waitlist.');
    for (const j of listOps('waitlistJoin').filter((x) => x.waitlistId === cur.id))
      await removeOps('waitlistJoin', j.id);
    await removeOps('waitlist', cur.id);
    await recordAction({
      staff: req.staff,
      action: 'WAITLIST_DELETED',
      target: cur.id,
      details: { name: cur.name },
    });
    res.json({ ok: true });
  }),
);

// ── insights ────────────────────────────────────────────────────────────────

adminBusinessRouter.get(
  '/insights',
  asyncHandler(async (req, res) => {
    const range = rangeOf(req.query);
    res.json({
      range,
      acquisition: acquisition(range),
      repeat: repeat(range),
      routine: routine(range),
      promise: promise(range),
      offers: offers(range),
      delayReasons: DELAY_REASONS,
      generatedAt: new Date().toISOString(),
    });
  }),
);

adminBusinessRouter.get(
  '/insights/products',
  asyncHandler(async (req, res) => {
    const range = rangeOf(req.query);
    res.json({ range, ...products(range) });
  }),
);

const ReminderBody = z.object({
  at: z.string().datetime({ offset: true }).optional(),
  channel: z.enum(['WHATSAPP', 'PUSH', 'SMS', 'BROADCAST', 'OTHER']),
  communityId: z.string().max(40).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

adminBusinessRouter.post(
  '/insights/reminders',
  validateBody(ReminderBody),
  asyncHandler(async (req, res) => {
    if (req.body.communityId && !getCommunity(req.body.communityId))
      throw fail(422, 'VALIDATION', 'That community does not exist.');
    const rid = newId('rem', 8);
    const saved = await putOps('reminder', rid, {
      at: req.body.at ? new Date(req.body.at).toISOString() : new Date().toISOString(),
      channel: req.body.channel,
      communityId: req.body.communityId || null,
      note: req.body.note || null,
      by: req.staff?.email || req.staff?.name || 'admin',
    });
    res.status(201).json({ reminder: saved });
  }),
);

adminBusinessRouter.delete(
  '/insights/reminders/:id',
  asyncHandler(async (req, res) => {
    if (!getOps('reminder', req.params.id)) throw fail(404, 'NOT_FOUND', 'No such reminder.');
    await removeOps('reminder', req.params.id);
    res.json({ ok: true });
  }),
);

adminBusinessRouter.put(
  '/insights/capacity/:communityId',
  validateBody(z.object({ capacity: z.number().int().min(0).max(100000).nullable() })),
  asyncHandler(async (req, res) => {
    const c = getCommunity(req.params.communityId);
    if (!c) throw fail(404, 'NOT_FOUND', 'No such community.');
    const cur = getOps('communityMeta', c.id) || {};
    const saved = await putOps('communityMeta', c.id, { ...cur, capacity: req.body.capacity });
    res.json({ communityId: c.id, capacity: saved.capacity ?? null });
  }),
);

adminBusinessRouter.put(
  '/insights/delays/:orderId',
  validateBody(
    z.object({
      reason: z.enum(/** @type {[string, ...string[]]} */ (Object.keys(DELAY_REASONS))),
      note: z.string().trim().max(200).optional().nullable(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const o = getOrder(req.params.orderId);
    if (!o) throw fail(404, 'NOT_FOUND', 'Order not found.');
    const saved = await putOps('delay', o.id, {
      orderNumber: o.orderNumber,
      reason: req.body.reason,
      note: req.body.note || null,
      by: req.staff?.email || 'admin',
      at: new Date().toISOString(),
    });
    res.json({ delay: saved });
  }),
);

adminBusinessRouter.delete(
  '/insights/delays/:orderId',
  asyncHandler(async (req, res) => {
    await removeOps('delay', req.params.orderId);
    res.json({ ok: true });
  }),
);

// ── finance ─────────────────────────────────────────────────────────────────

const ExpenseBody = z.object({
  date: isoDate,
  category: z.enum(/** @type {[string, ...string[]]} */ (Object.keys(EXPENSE_CATEGORIES))),
  kind: z.enum(['FIXED', 'VARIABLE']),
  amountPaise: rupees.refine((n) => n > 0, 'Enter an amount above zero.'),
  recurring: z.enum(['NONE', 'MONTHLY']).optional(),
  endDate: isoDate.optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
  vendor: z.string().trim().max(80).optional().nullable(),
});

const expenseView = (e) => ({
  id: e.id,
  date: e.date,
  category: e.category,
  categoryLabel: EXPENSE_CATEGORIES[e.category] || e.category,
  kind: e.kind,
  amountPaise: String(e.amountPaise),
  recurring: e.recurring || 'NONE',
  endDate: e.endDate || null,
  note: e.note || null,
  vendor: e.vendor || null,
  createdBy: e.createdBy || null,
  createdAt: e.createdAt || null,
});

adminBusinessRouter.get(
  '/finance',
  asyncHandler(async (req, res) => res.json(finance(rangeOf(req.query)))),
);

adminBusinessRouter.get(
  '/finance/expenses',
  asyncHandler(async (req, res) => {
    const range = rangeOf(req.query);
    const all = req.query.all === '1';
    const list = listOps('expense')
      .filter(
        (e) => all || e.recurring === 'MONTHLY' || (e.date >= range.from && e.date <= range.to),
      )
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map(expenseView);
    res.json({ range, expenses: list, categories: EXPENSE_CATEGORIES });
  }),
);

async function saveExpense(eid, body, staff, prev = null) {
  if (body.endDate && body.endDate < body.date)
    throw fail(422, 'VALIDATION', 'The end date is before the start date.');
  return putOps('expense', eid, {
    ...(prev || {}),
    ...body,
    recurring: body.recurring || prev?.recurring || 'NONE',
    createdBy: prev?.createdBy || staff?.email || 'admin',
    createdAt: prev?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

adminBusinessRouter.post(
  '/finance/expenses',
  validateBody(ExpenseBody),
  asyncHandler(async (req, res) => {
    const eid = newId('exp', 8);
    const saved = await saveExpense(eid, req.body, req.staff);
    await recordAction({
      staff: req.staff,
      action: 'EXPENSE_ADDED',
      target: eid,
      details: { amountPaise: req.body.amountPaise, category: req.body.category },
    });
    res.status(201).json({ expense: expenseView(saved) });
  }),
);

adminBusinessRouter.patch(
  '/finance/expenses/:id',
  validateBody(ExpenseBody.partial()),
  asyncHandler(async (req, res) => {
    const cur = getOps('expense', req.params.id);
    if (!cur) throw fail(404, 'NOT_FOUND', 'No such expense.');
    const merged = { ...cur, ...req.body };
    const check = ExpenseBody.safeParse({ ...merged, amountPaise: Number(merged.amountPaise) });
    if (!check.success)
      throw fail(422, 'VALIDATION', check.error.issues[0]?.message || 'Check the expense.');
    const saved = await saveExpense(cur.id, merged, req.staff, cur);
    await recordAction({
      staff: req.staff,
      action: 'EXPENSE_UPDATED',
      target: cur.id,
      details: req.body,
    });
    res.json({ expense: expenseView(saved) });
  }),
);

adminBusinessRouter.delete(
  '/finance/expenses/:id',
  asyncHandler(async (req, res) => {
    const cur = getOps('expense', req.params.id);
    if (!cur) throw fail(404, 'NOT_FOUND', 'No such expense.');
    await removeOps('expense', cur.id);
    await recordAction({
      staff: req.staff,
      action: 'EXPENSE_DELETED',
      target: cur.id,
      details: { amountPaise: cur.amountPaise },
    });
    res.json({ ok: true });
  }),
);

adminBusinessRouter.post(
  '/finance/expenses/import',
  validateBody(z.object({ rows: z.array(ExpenseBody).min(1).max(500) })),
  asyncHandler(async (req, res) => {
    const saved = [];
    for (const row of req.body.rows)
      saved.push(expenseView(await saveExpense(newId('exp', 8), row, req.staff)));
    await recordAction({
      staff: req.staff,
      action: 'EXPENSES_IMPORTED',
      details: { rows: saved.length },
    });
    res.status(201).json({ imported: saved.length, expenses: saved });
  }),
);

adminBusinessRouter.get(
  '/finance/settings',
  asyncHandler(async (_req, res) => res.json({ settings: getSettings('finance') })),
);

adminBusinessRouter.put(
  '/finance/settings',
  validateBody(z.object({ incomeTaxPct: z.number().min(0).max(60) })),
  asyncHandler(async (req, res) => {
    const settings = await saveSettings('finance', req.body);
    await recordAction({ staff: req.staff, action: 'FINANCE_SETTINGS_CHANGED', details: req.body });
    res.json({ settings });
  }),
);

// ── buffer & wastage (procurement role may use these) ───────────────────────

adminBusinessRouter.get(
  '/procurement/wastage',
  asyncHandler(async (req, res) =>
    res.json({ range: rangeOf(req.query), ...buffer(rangeOf(req.query)) }),
  ),
);

adminBusinessRouter.put(
  '/procurement/wastage/:date/:productId',
  validateBody(
    z.object({
      usedQty: z.number().min(0).max(100000),
      wastedQty: z.number().min(0).max(100000),
      note: z.string().trim().max(200).optional().nullable(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { date, productId } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail(422, 'VALIDATION', 'Bad date.');
    if (!getProduct(productId)) throw fail(404, 'NOT_FOUND', 'No such product.');
    const saved = await putOps('wastage', `${date}:${productId}`, {
      date,
      productId,
      usedQty: req.body.usedQty,
      wastedQty: req.body.wastedQty,
      note: req.body.note || null,
      by: req.staff?.email || req.staff?.name || 'staff',
      at: new Date().toISOString(),
    });
    res.json({ wastage: saved });
  }),
);

adminBusinessRouter.delete(
  '/procurement/wastage/:date/:productId',
  asyncHandler(async (req, res) => {
    await removeOps('wastage', `${req.params.date}:${req.params.productId}`);
    res.json({ ok: true });
  }),
);

// ── reviews ─────────────────────────────────────────────────────────────────

const reviewView = (r) => {
  const o = getOrder(r.id);
  return {
    orderId: r.id,
    orderNumber: o?.orderNumber || r.orderNumber || null,
    communityName: o?.address?.communityName || null,
    rating: r.rating,
    comment: r.comment || null,
    tags: r.tags || [],
    at: r.at,
    reply: r.reply || null,
    repliedAt: r.repliedAt || null,
    repliedBy: r.repliedBy || null,
    hidden: !!r.hidden,
    customer: nameOf(r.customerId),
  };
};

adminBusinessRouter.get(
  '/feedback/reviews',
  asyncHandler(async (req, res) => {
    let list = listOps('review').sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const rating = Number(req.query.rating);
    if (rating >= 1 && rating <= 5) list = list.filter((r) => r.rating === rating);
    if (req.query.unreplied === '1') list = list.filter((r) => !r.reply);
    const all = listOps('review');
    const avg = all.length
      ? Math.round((all.reduce((n, r) => n + r.rating, 0) / all.length) * 10) / 10
      : null;
    res.json({
      reviews: list.map(reviewView),
      totals: {
        count: all.length,
        average: avg,
        unreplied: all.filter((r) => !r.reply).length,
        byRating: [5, 4, 3, 2, 1].map((n) => ({
          rating: n,
          count: all.filter((r) => r.rating === n).length,
        })),
      },
    });
  }),
);

adminBusinessRouter.put(
  '/feedback/reviews/:orderId',
  validateBody(
    z.object({
      reply: z.string().trim().max(500).optional().nullable(),
      hidden: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const cur = getOps('review', req.params.orderId);
    if (!cur) throw fail(404, 'NOT_FOUND', 'No review on that order.');
    const next = { ...cur };
    if (req.body.reply !== undefined) {
      next.reply = req.body.reply || null;
      next.repliedAt = req.body.reply ? new Date().toISOString() : null;
      next.repliedBy = req.body.reply
        ? req.staff?.email || req.staff?.name || 'Fooducia team'
        : null;
    }
    if (req.body.hidden !== undefined) next.hidden = req.body.hidden;
    const saved = await putOps('review', cur.id, next);
    res.json({ review: reviewView(saved) });
  }),
);

/** Admin view of one order's source, for the order drawer. */
adminBusinessRouter.get(
  '/orders/:id/source',
  asyncHandler(async (req, res) => {
    const o = getOrder(req.params.id);
    if (!o) throw fail(404, 'NOT_FOUND', 'Order not found.');
    const attr = o.customerId ? getOps('attribution', o.customerId) : null;
    res.json({
      promoterCode: getOps('orderAttr', o.id)?.promoterCode || null,
      heardFrom: attr?.heardFrom ? HEARD_FROM[attr.heardFrom] : null,
      invitedBy: attr?.referrerId ? nameOf(attr.referrerId) : null,
      review: getOps('review', o.id) ? reviewView(getOps('review', o.id)) : null,
    });
  }),
);
