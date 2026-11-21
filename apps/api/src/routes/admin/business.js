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
  heardFromLabels,
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
import { weeklyReport, weeklyExportRows, weekOf } from '../../lib/report.js';
import { listEvents, EVENT_NAMES } from '../../lib/events.js';
import { buildWorkbook, sendWorkbook } from '../../lib/xlsx.js';
import { reminderAudience, runCutoffReminder } from '../../lib/reminders.js';

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
  referralMonthlyCap: z.number().int().min(1).max(500).optional(),
  waitlistOpenAt: z.number().int().min(1).max(10000).optional(),
  askHeardFrom: z.boolean().optional(),
  mobileReferral: z.boolean().optional(),
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
      heardFrom: attr?.heardFrom ? heardFromLabels()[attr.heardFrom] || attr.heardFrom : null,
      heardFromKey: attr?.heardFrom || null,
      isFirstOrder: !!(attr && attr.firstOrderId === o.id),
      invitedBy: attr?.referrerId ? nameOf(attr.referrerId) : null,
      review: getOps('review', o.id) ? reviewView(getOps('review', o.id)) : null,
    });
  }),
);

// ── Rapture7 tracking brief (19 Nov 2026) ───────────────────────────────────

// Counter sessions — a stall at a community, with its time window and the promoters on it. The
// report counts first orders placed during a session (in that community, or with one of its
// promoters' codes) as assisted by it.
const SessionBody = z.object({
  communityId: z.string().max(40),
  date: isoDate,
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Use a time like 17:00.'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'Use a time like 20:00.'),
  promoterCodes: z.array(z.string().trim().max(12)).max(10).optional(),
  note: z.string().trim().max(200).optional().nullable(),
});

const sessionView = (s) => ({
  id: s.id,
  communityId: s.communityId,
  communityName: getCommunity(s.communityId)?.name || s.communityId,
  date: s.date,
  start: s.start,
  end: s.end,
  promoterCodes: s.promoterCodes || [],
  note: s.note || null,
});

adminBusinessRouter.get(
  '/growth/counter-sessions',
  asyncHandler(async (req, res) => {
    const range = rangeOf(req.query);
    const list = listOps('counterSession')
      .filter((s) => req.query.all === '1' || (s.date >= range.from && s.date <= range.to))
      .sort((a, b) => (a.date === b.date ? (a.start < b.start ? 1 : -1) : a.date < b.date ? 1 : -1))
      .map(sessionView);
    res.json({ range, sessions: list });
  }),
);

async function saveSession(sid, body, prev = null) {
  if (!getCommunity(body.communityId))
    throw fail(422, 'VALIDATION', 'That community does not exist.');
  if (body.end <= body.start)
    throw fail(422, 'VALIDATION', 'The session must end after it starts.');
  const codes = (body.promoterCodes || []).map(normaliseCode).filter(Boolean);
  for (const c of codes)
    if (!getOps('promoter', c)) throw fail(422, 'VALIDATION', `No promoter with the code ${c}.`);
  return putOps('counterSession', sid, {
    ...(prev || {}),
    ...body,
    promoterCodes: codes,
    updatedAt: new Date().toISOString(),
  });
}

adminBusinessRouter.post(
  '/growth/counter-sessions',
  validateBody(SessionBody),
  asyncHandler(async (req, res) => {
    const saved = await saveSession(newId('cs', 8), req.body);
    res.status(201).json({ session: sessionView(saved) });
  }),
);

adminBusinessRouter.patch(
  '/growth/counter-sessions/:id',
  validateBody(SessionBody.partial()),
  asyncHandler(async (req, res) => {
    const cur = getOps('counterSession', req.params.id);
    if (!cur) throw fail(404, 'NOT_FOUND', 'No such session.');
    const saved = await saveSession(cur.id, { ...cur, ...req.body }, cur);
    res.json({ session: sessionView(saved) });
  }),
);

adminBusinessRouter.delete(
  '/growth/counter-sessions/:id',
  asyncHandler(async (req, res) => {
    if (!getOps('counterSession', req.params.id)) throw fail(404, 'NOT_FOUND', 'No such session.');
    await removeOps('counterSession', req.params.id);
    res.json({ ok: true });
  }),
);

// Settings documents the brief adds: the launch offer (pending approval → off), the 5 PM reminder,
// and the capacity the report measures mornings against.
const SETTINGS_SCHEMAS = {
  launchOffer: z.object({
    enabled: z.boolean().optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    firstOrderPct: z.number().min(0).max(50).optional(),
    secondOrderWithinDays: z.number().int().min(1).max(60).optional(),
    secondOrderThresholdPaise: z.number().int().min(0).max(10_000_000).optional(),
    secondOrderPct: z.number().min(0).max(50).optional(),
    secondOrderCapPaise: z.number().int().min(0).max(1_000_000).optional(),
    secondOrderLowPct: z.number().min(0).max(50).optional(),
  }),
  reminders: z.object({
    enabled: z.boolean().optional(),
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    title: z.string().trim().min(3).max(60).optional(),
    body: z.string().trim().min(3).max(160).optional(),
  }),
  report: z.object({ capacityKgPerMorning: z.number().min(1).max(100000).optional() }),
  sourceQuestion: z.object({
    required: z.boolean().optional(),
    options: z
      .array(
        z.object({
          key: z
            .string()
            .regex(/^[A-Z][A-Z0-9_]{1,19}$/, 'Answer keys are 2–20 capital letters, digits or _.'),
          label: z.string().trim().min(2).max(60),
          enabled: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(12)
      .optional(),
  }),
  tracking: z.object({
    enabled: z.boolean().optional(),
    disabledEvents: z
      .array(z.enum(/** @type {[string, ...string[]]} */ (Object.keys(EVENT_NAMES))))
      .optional(),
  }),
  appNudges: z.object({
    countdown: z.boolean().optional(),
    countdownHours: z.number().int().min(1).max(24).optional(),
    repeatBasket: z.boolean().optional(),
  }),
};

adminBusinessRouter.get(
  '/business/settings/:name',
  asyncHandler(async (req, res) => {
    if (!SETTINGS_SCHEMAS[req.params.name]) throw fail(404, 'NOT_FOUND', 'No such settings.');
    res.json({ settings: getSettings(req.params.name) });
  }),
);

adminBusinessRouter.put(
  '/business/settings/:name',
  asyncHandler(async (req, res) => {
    const schema = SETTINGS_SCHEMAS[req.params.name];
    if (!schema) throw fail(404, 'NOT_FOUND', 'No such settings.');
    const r = schema.safeParse(req.body || {});
    if (!r.success)
      throw fail(422, 'VALIDATION', r.error.issues[0]?.message || 'Check the values.');
    const next = { ...getSettings(req.params.name), ...r.data };
    if (req.params.name === 'launchOffer' && next.endDate < next.startDate)
      throw fail(422, 'VALIDATION', 'The offer ends before it starts.');
    if (req.params.name === 'sourceQuestion' && r.data.options) {
      const keys = r.data.options.map((o) => o.key);
      if (new Set(keys).size !== keys.length)
        throw fail(422, 'VALIDATION', 'Two answers share a key.');
      if (!r.data.options.some((o) => o.enabled !== false))
        throw fail(422, 'VALIDATION', 'Keep at least one answer switched on.');
    }
    const settings = await saveSettings(req.params.name, r.data);
    await recordAction({
      staff: req.staff,
      action: 'SETTINGS_CHANGED',
      target: req.params.name,
      details: r.data,
    });
    res.json({ settings });
  }),
);

// The Friday report (brief §05) and the weekly export (orders, customers, events — pseudonymous).
adminBusinessRouter.get(
  '/report/weekly',
  asyncHandler(async (req, res) => res.json(weeklyReport(weekOf(req.query)))),
);

adminBusinessRouter.get(
  '/report/weekly.xlsx',
  asyncHandler(async (req, res) => {
    const week = weekOf(req.query);
    const r = weeklyReport(week);
    const rows = weeklyExportRows(week);
    const col = (keys) =>
      keys.map((k) => ({ header: k, key: k, width: Math.max(12, k.length + 2) }));
    const metric = [
      {
        metric: 'Weekly ordering households',
        value: r.northStar.households,
        cut: 'see Orders sheet by community/tower',
      },
      { metric: 'Counter sessions', value: r.assisted.sessions, cut: '' },
      {
        metric: 'Assisted first orders per counter session',
        value: r.assisted.perSession,
        cut: '',
      },
      {
        metric: 'Second order within 7 days (%)',
        value: r.secondOrder.within7Pct,
        cut: `${r.secondOrder.hit7}/${r.secondOrder.eligible7}`,
      },
      {
        metric: 'Second order within 30 days (%)',
        value: r.secondOrder.within30Pct,
        cut: `${r.secondOrder.hit30}/${r.secondOrder.eligible30}`,
      },
      { metric: 'Ordering three weeks running', value: r.threeWeeks.households, cut: '' },
      {
        metric: 'Average basket (₹), all',
        value: r.basketValue.allPaise == null ? null : r.basketValue.allPaise / 100,
        cut: '',
      },
      {
        metric: 'Average basket (₹), 1st orders',
        value: r.basketValue.firstPaise == null ? null : r.basketValue.firstPaise / 100,
        cut: '',
      },
      {
        metric: 'Average basket (₹), 2nd orders',
        value: r.basketValue.secondPaise == null ? null : r.basketValue.secondPaise / 100,
        cut: '',
      },
      {
        metric: 'Average basket (₹), later orders',
        value: r.basketValue.laterPaise == null ? null : r.basketValue.laterPaise / 100,
        cut: '',
      },
      {
        metric: 'Discount cost (₹)',
        value: r.discounts.totalPaise / 100,
        cut: r.discounts.byType.map((d) => `${d.type} ₹${d.paise / 100}`).join(', '),
      },
      {
        metric: 'Margin left after discount, packaging and delivery (%)',
        value: r.discounts.marginLeftPct,
        cut: '',
      },
      {
        metric: 'On-time delivery (%)',
        value: r.onTime.onTimePct,
        cut: `${r.onTime.onTime}/${r.onTime.delivered}`,
      },
      {
        metric: 'Refund rate (%)',
        value: r.refunds.ratePct,
        cut: r.refunds.byReason.map((x) => `${x.key} ${x.n}`).join(', '),
      },
      {
        metric: 'Referral share of first orders (%)',
        value: r.referral.sharePct,
        cut: `${r.referral.withReferrer}/${r.referral.firstOrders}`,
      },
      {
        metric: 'Waitlist votes',
        value: r.waitlist.votes,
        cut: r.waitlist.byArea.map((x) => `${x.key} ${x.n}`).join(', '),
      },
    ];
    const buf = await buildWorkbook(
      [
        { name: 'Metrics', columns: col(['metric', 'value', 'cut']), rows: metric },
        {
          name: 'Orders',
          columns: col(Object.keys(rows.orders[0] || { order_number: '' })),
          rows: rows.orders,
          filter: true,
        },
        {
          name: 'Customers',
          columns: col(Object.keys(rows.customers[0] || { household: '' })),
          rows: rows.customers,
          filter: true,
        },
        {
          name: 'Events',
          columns: col(['event', 'at', 'household', 'properties']),
          rows: rows.events,
          filter: true,
        },
      ],
      {
        title: `Fooducia weekly report ${week.from} to ${week.to}`,
        subtitle: 'Households are one-way keys — no names, numbers or flats.',
      },
    );
    await recordAction({ staff: req.staff, action: 'WEEKLY_REPORT_EXPORTED', target: week.from });
    sendWorkbook(res, buf, `fooducia-weekly-${week.from}.xlsx`);
  }),
);

adminBusinessRouter.get(
  '/events',
  asyncHandler(async (req, res) => {
    const range = rangeOf(req.query);
    const fromMs = Date.parse(`${range.from}T00:00:00+05:30`);
    const toMs = Date.parse(`${range.to}T23:59:59+05:30`);
    const name = req.query.name ? String(req.query.name) : null;
    const list = listEvents({ fromMs, toMs, name }).slice(0, 500);
    const counts = {};
    for (const e of listEvents({ fromMs, toMs })) counts[e.name] = (counts[e.name] || 0) + 1;
    res.json({
      range,
      counts,
      names: Object.keys(EVENT_NAMES),
      events: list.map((e) => ({ ...e, customerId: undefined })),
    });
  }),
);

// ── tagged links (/go) ───────────────────────────────────────────────────────
// A saved link per counter, WhatsApp post or flyer. The link is just its tag; scans and installs are
// counted by tag, so editing a saved link changes what it points at from then on — older scans stay
// with the tag they came in on.
const tagPart = (max = 40) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[A-Za-z0-9_-]*$/, 'Letters, digits, - and _ only.')
    .optional()
    .nullable();
const TagLinkBody = z.object({
  name: z.string().trim().min(2).max(80),
  src: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, - and _ only.'),
  p: tagPart(),
  c: tagPart(),
  r: tagPart(),
  note: z.string().trim().max(200).optional().nullable(),
  active: z.boolean().optional(),
});
const tagOf = (l) => ({
  src: String(l.src || '').toLowerCase(),
  p: l.p ? String(l.p).toUpperCase() : '',
  c: l.c ? String(l.c).toLowerCase() : '',
  r: l.r ? String(l.r).toUpperCase() : '',
});
function goUrlOf(l) {
  const t = tagOf(l);
  const q = new URLSearchParams();
  for (const k of ['src', 'p', 'c', 'r']) if (t[k]) q.set(k, t[k]);
  return `https://fooducia.health/go?${q.toString()}`;
}
function linkView(l) {
  const t = tagOf(l);
  const scans = listOps('linkClick')
    .filter((k) => k.src === t.src && (k.p || '') === t.p && (k.c || '') === t.c)
    .reduce((n, k) => n + (k.n || 0), 0);
  const installs = listOps('installSource').filter(
    (i) => (i.src || '') === t.src && (i.p || '') === t.p && (i.c || '') === t.c,
  ).length;
  return { ...l, url: goUrlOf(l), scans, installs };
}

adminBusinessRouter.get(
  '/growth/links',
  asyncHandler(async (_req, res) =>
    res.json({
      links: listOps('tagLink')
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map(linkView),
    }),
  ),
);

adminBusinessRouter.post(
  '/growth/links',
  validateBody(TagLinkBody),
  asyncHandler(async (req, res) => {
    if (req.body.p && !getOps('promoter', normaliseCode(req.body.p)))
      throw fail(422, 'VALIDATION', `No promoter with the code ${normaliseCode(req.body.p)}.`);
    const saved = await putOps('tagLink', newId('tl', 8), {
      ...req.body,
      active: req.body.active !== false,
      createdAt: new Date().toISOString(),
    });
    await recordAction({ staff: req.staff, action: 'TAG_LINK_CREATED', target: saved.id });
    res.status(201).json({ link: linkView(saved) });
  }),
);

adminBusinessRouter.patch(
  '/growth/links/:id',
  validateBody(TagLinkBody.partial()),
  asyncHandler(async (req, res) => {
    const cur = getOps('tagLink', req.params.id);
    if (!cur) throw fail(404, 'NOT_FOUND', 'No such link.');
    if (req.body.p && !getOps('promoter', normaliseCode(req.body.p)))
      throw fail(422, 'VALIDATION', `No promoter with the code ${normaliseCode(req.body.p)}.`);
    const saved = await putOps('tagLink', cur.id, {
      ...cur,
      ...req.body,
      updatedAt: new Date().toISOString(),
    });
    await recordAction({ staff: req.staff, action: 'TAG_LINK_UPDATED', target: cur.id });
    res.json({ link: linkView(saved) });
  }),
);

adminBusinessRouter.delete(
  '/growth/links/:id',
  asyncHandler(async (req, res) => {
    if (!getOps('tagLink', req.params.id)) throw fail(404, 'NOT_FOUND', 'No such link.');
    await removeOps('tagLink', req.params.id);
    await recordAction({ staff: req.staff, action: 'TAG_LINK_DELETED', target: req.params.id });
    res.json({ ok: true });
  }),
);

// Scan counts per day and tag (anonymous). Deleting one is for clearing test scans.
adminBusinessRouter.get(
  '/growth/link-scans',
  asyncHandler(async (req, res) => {
    const range = rangeOf(req.query);
    const rows = listOps('linkClick')
      .filter((k) => k.day >= range.from && k.day <= range.to)
      .sort((a, b) => (a.day === b.day ? b.n - a.n : a.day < b.day ? 1 : -1));
    res.json({ range, scans: rows, total: rows.reduce((n, k) => n + (k.n || 0), 0) });
  }),
);

adminBusinessRouter.delete(
  '/growth/link-scans/:id',
  asyncHandler(async (req, res) => {
    if (!getOps('linkClick', req.params.id)) throw fail(404, 'NOT_FOUND', 'No such scan count.');
    await removeOps('linkClick', req.params.id);
    await recordAction({ staff: req.staff, action: 'LINK_SCANS_DELETED', target: req.params.id });
    res.json({ ok: true });
  }),
);

// Which households arrived through an install link. Masked number only, like the Customers page.
adminBusinessRouter.get(
  '/growth/install-sources',
  asyncHandler(async (_req, res) => {
    const rows = listOps('installSource')
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .map((i) => {
        const c = getCustomer(i.id);
        return {
          id: i.id,
          at: i.at,
          src: i.src || null,
          p: i.p || null,
          c: i.c || null,
          r: i.r || null,
          customer: c ? { name: c.name || null, mobileMasked: maskMobile(c.mobile) } : null,
        };
      });
    res.json({ installs: rows });
  }),
);

adminBusinessRouter.patch(
  '/growth/install-sources/:id',
  validateBody(z.object({ src: tagPart(), p: tagPart(), c: tagPart(), r: tagPart() })),
  asyncHandler(async (req, res) => {
    const cur = getOps('installSource', req.params.id);
    if (!cur) throw fail(404, 'NOT_FOUND', 'No install source for that customer.');
    const t = tagOf({ ...cur, ...req.body });
    const saved = await putOps('installSource', cur.id, {
      ...cur,
      src: t.src || null,
      p: t.p || null,
      c: t.c || null,
      r: t.r || null,
      correctedAt: new Date().toISOString(),
    });
    await recordAction({
      staff: req.staff,
      action: 'INSTALL_SOURCE_CORRECTED',
      target: cur.id,
      details: req.body,
    });
    res.json({ install: saved });
  }),
);

adminBusinessRouter.delete(
  '/growth/install-sources/:id',
  asyncHandler(async (req, res) => {
    if (!getOps('installSource', req.params.id))
      throw fail(404, 'NOT_FOUND', 'No install source for that customer.');
    await removeOps('installSource', req.params.id);
    await recordAction({
      staff: req.staff,
      action: 'INSTALL_SOURCE_DELETED',
      target: req.params.id,
    });
    res.json({ ok: true });
  }),
);

// One event can be removed — for test traffic. Audit-logged.
adminBusinessRouter.delete(
  '/events/:id',
  asyncHandler(async (req, res) => {
    if (!getOps('event', req.params.id)) throw fail(404, 'NOT_FOUND', 'No such event.');
    await removeOps('event', req.params.id);
    await recordAction({ staff: req.staff, action: 'EVENT_DELETED', target: req.params.id });
    res.json({ ok: true });
  }),
);

// The 5 PM reminder: who it would reach now, and sending today's straight away.
adminBusinessRouter.get(
  '/business/reminders/preview',
  asyncHandler(async (_req, res) => {
    const s = getSettings('reminders');
    const today = new Date(Date.now() + 330 * 60e3).toISOString().slice(0, 10);
    res.json({
      ...reminderAudience(),
      title: s.title,
      body: s.body,
      sentToday: !!getOps('reminder', `auto-${today}`),
    });
  }),
);

adminBusinessRouter.post(
  '/business/reminders/send-now',
  asyncHandler(async (req, res) => {
    const today = new Date(Date.now() + 330 * 60e3).toISOString().slice(0, 10);
    if (getOps('reminder', `auto-${today}`) && req.query.again !== '1')
      throw fail(409, 'ALREADY_SENT', 'Today’s reminder has already gone out.');
    const sent = await runCutoffReminder(Date.now(), { force: true });
    await recordAction({ staff: req.staff, action: 'REMINDER_SENT_NOW', details: { sent } });
    res.json({ sent });
  }),
);
