/**
 * Meal-plan adherence — the "did you actually eat it?" loop that makes the AI plan objective.
 *
 *   GET  /meals/day?date=YYYY-MM-DD      the check-ins logged for that day
 *   POST /meals/checkin                  record a response to one planned meal (Yes/No/deviated)
 *   POST /meals/:id/photo                attach a meal photo → vision estimates what was eaten
 *   GET  /meals/adherence?from&to        planned-vs-actual summary over a date range
 *
 * GATED TO SUPER-ADMIN for now (requireAiAccess, same gate as the AI planner). The feature itself is
 * audience-agnostic — widening it to customers later is flipping this one guard, not a rewrite. The
 * client supplies the PLANNED calories (it holds the plan); the server adds the ACTUAL calories from
 * the photo, and the two are what the analytics compare.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateBody, validateQuery } from '../validate.js';
import { getCustomer } from '../customer-store.js';
import { findStaffByMobile } from '../access-store.js';
import { hasAi } from '../lib/roles.js';
import { upsertMealLog, getMealLog, listMealLogs } from '../customer-store.js';
import { analyseMealPhoto } from '../lib/meal-vision.js';
import { uploadMealPhoto, assertRealImage, allowedImageTypes } from '../lib/storage.js';

export const mealsRouter = Router();

/** Super-admin only, mirroring the AI planner's gate. */
function requireAiAccess(req, _res, next) {
  const cust = getCustomer(req.customerId);
  const staff = cust && findStaffByMobile(cust.mobile);
  if (!staff || !hasAi(staff.role, staff.aiAccess))
    return next(fail(403, 'FORBIDDEN', 'Meal tracking is not available on this account.'));
  next();
}
mealsRouter.use(requireAiAccess);

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.');
const SLOT = z.enum(['breakfast', 'lunch', 'snack', 'dinner']);

mealsRouter.get(
  '/day',
  validateQuery(z.object({ date: DATE })),
  asyncHandler(async (req, res) => {
    const date = req.query.date;
    res.json({ date, logs: listMealLogs(req.customerId, { from: date, to: date }) });
  }),
);

mealsRouter.post(
  '/checkin',
  validateBody(
    z.object({
      date: DATE,
      slot: SLOT,
      mealName: z.string().max(80).optional(),
      status: z.enum(['FOLLOWED', 'SKIPPED', 'DEVIATED']),
      plannedKcal: z.number().int().min(0).max(10000).optional(),
      note: z.string().max(300).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const log = upsertMealLog(req.customerId, req.body);
    res.status(201).json({ log });
  }),
);

const MAX_BASE64 = 9_000_000; // ~6.5 MB image after base64 — matches the storage limit

mealsRouter.post(
  '/:id/photo',
  validateBody(
    z.object({
      imageBase64: z.string().min(32).max(MAX_BASE64),
      contentType: z.enum(/** @type {[string, ...string[]]} */ (allowedImageTypes)),
    }),
  ),
  asyncHandler(async (req, res) => {
    const existing = getMealLog(req.customerId, req.params.id);
    if (!existing) throw fail(404, 'NOT_FOUND', 'Meal check-in not found.');

    const key = process.env.GROQ_API_KEY;
    if (!key) throw fail(501, 'NOT_IMPLEMENTED', 'Meal photos need GROQ_API_KEY on the server.');

    // Verify the bytes really are the declared image type before trusting or storing them.
    const buffer = Buffer.from(req.body.imageBase64, 'base64');
    try {
      assertRealImage(buffer, req.body.contentType);
    } catch {
      throw fail(422, 'VALIDATION', 'That file is not a valid image.');
    }

    const dataUrl = `data:${req.body.contentType};base64,${req.body.imageBase64}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20000);
    let analysis;
    try {
      analysis = await analyseMealPhoto(key, { dataUrl, signal: ac.signal });
    } catch (e) {
      if (e.name === 'AbortError')
        throw fail(504, 'UPSTREAM_TIMEOUT', 'That took too long. Please try again.');
      req.log?.error({ err: e }, '[meals] vision call failed');
      throw fail(502, 'UPSTREAM', 'Could not read that photo. Please try again.');
    } finally {
      clearTimeout(timer);
    }

    // Store the photo as objective evidence. Non-fatal if storage is not configured (dev / in-memory):
    // the analysis is the point, the photo is the receipt.
    let photoKey = null;
    try {
      photoKey = await uploadMealPhoto({
        buffer,
        contentType: req.body.contentType,
        customerId: req.customerId,
      });
    } catch (e) {
      req.log?.warn?.({ err: e?.message }, '[meals] photo not stored (storage unconfigured?)');
    }

    const log = upsertMealLog(req.customerId, {
      date: existing.date,
      slot: existing.slot,
      status: existing.status === 'SKIPPED' ? 'FOLLOWED' : existing.status, // a photo implies they ate
      actualKcal: analysis.totalKcal,
      items: analysis.items,
      confidence: analysis.confidence,
      note: analysis.note ?? existing.note ?? null,
      ...(photoKey ? { photoKey } : {}),
    });
    res.json({ log, analysis });
  }),
);

mealsRouter.get(
  '/adherence',
  validateQuery(z.object({ from: DATE.optional(), to: DATE.optional() })),
  asyncHandler(async (req, res) => {
    const logs = listMealLogs(req.customerId, { from: req.query.from, to: req.query.to });
    const byDay = {};
    const totals = {
      meals: 0,
      followed: 0,
      skipped: 0,
      deviated: 0,
      plannedKcal: 0,
      actualKcal: 0,
      withPhoto: 0,
    };
    for (const m of logs) {
      const d = (byDay[m.date] ||= {
        date: m.date,
        followed: 0,
        skipped: 0,
        deviated: 0,
        plannedKcal: 0,
        actualKcal: 0,
      });
      totals.meals += 1;
      if (m.status === 'FOLLOWED') {
        d.followed += 1;
        totals.followed += 1;
      } else if (m.status === 'SKIPPED') {
        d.skipped += 1;
        totals.skipped += 1;
      } else {
        d.deviated += 1;
        totals.deviated += 1;
      }
      if (m.plannedKcal) {
        d.plannedKcal += m.plannedKcal;
        totals.plannedKcal += m.plannedKcal;
      }
      if (m.actualKcal) {
        d.actualKcal += m.actualKcal;
        totals.actualKcal += m.actualKcal;
      }
      if (m.photoKey) totals.withPhoto += 1;
    }
    // Adherence = of the meals the user responded to, how many they followed (photo or not).
    const adherencePct = totals.meals ? Math.round((totals.followed / totals.meals) * 100) : null;
    res.json({
      range: { from: req.query.from || null, to: req.query.to || null },
      totals,
      adherencePct,
      kcalDelta: totals.actualKcal - totals.plannedKcal,
      byDay: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
    });
  }),
);
