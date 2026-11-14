/**
 * Meal tracking — "what did I actually eat today?"
 *
 *   POST   /meals/log                  log one meal: a photo, foods picked from the list, "I had my
 *                                      planned meal", or "skipped"                       ← the main door
 *   PATCH  /meals/:id                  correct it: bigger/smaller portion, how much oil, drop an item
 *   DELETE /meals/:id                  remove it, photo included
 *   GET    /meals/day?date=            that day's logs, with totals and the range around them
 *   GET    /meals/streak?today=        logging streak, this week's days, weekly goal
 *   GET    /meals/foods?q=             the food list behind "search food"
 *   GET    /meals/adherence?from&to    planned-vs-actual over a range
 *   POST   /meals/checkin, /meals/:id/photo      the original two-step flow, kept for older app builds
 *
 * A photo goes to a vision model, which names the dishes and guesses the portions. Nothing it says
 * is stored as-is: lib/meal-analysis.js checks every item against a reference table of Indian
 * dishes, corrects the implausible, and attaches a range — because a single photograph cannot
 * measure a meal, and the oil in it least of all.
 *
 * WHO CAN USE THIS: super-admin accounts only, for now (requireMealAccess — the same gate as the
 * planner). The feature is written for everyone, but two things must exist before the gate opens
 * to customers, and neither is a code flip:
 *   1. a server-side record of the customer's consent to keeping their food history and photos, and
 *      to those photos being sent to the vision provider (DPDP Act 2023: specific, informed,
 *      withdrawable consent, with the processor disclosed) — the app already asks; the server does
 *      not yet store the answer;
 *   2. a qualified nutrition professional's review of data/dishes.js and of the wording shown.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateBody, validateQuery } from '../validate.js';
import {
  deleteMealLog,
  getCustomer,
  getMealLog,
  listMealLogs,
  upsertMealLog,
} from '../customer-store.js';
import { findStaffByMobile } from '../access-store.js';
import { hasAi } from '../lib/roles.js';
import { analyseMealPhoto } from '../lib/meal-vision.js';
import {
  applyOil,
  applyScale,
  daySummary,
  finaliseAnalysis,
  itemsFromPicks,
  searchFoods,
  streakFrom,
  totalsOf,
} from '../lib/meal-analysis.js';
import { startMealRetention } from '../lib/meal-retention.js';
import { addDaysISO, todayISO } from '../lib/dates.js';
import {
  allowedImageTypes,
  assertRealImage,
  deleteMealPhotos,
  uploadMealPhoto,
} from '../lib/storage.js';

export const mealsRouter = Router();

/** How long a meal photograph is kept. The numbers stay; the picture does not. */
export const MEAL_PHOTO_RETENTION_DAYS = Number(process.env.MEAL_PHOTO_RETENTION_DAYS) || 35;
startMealRetention(MEAL_PHOTO_RETENTION_DAYS);

/** Super-admin only, mirroring the planner's gate. See the note at the top before widening it. */
function requireMealAccess(req, _res, next) {
  const cust = getCustomer(req.customerId);
  const staff = cust && findStaffByMobile(cust.mobile);
  if (!staff || !hasAi(staff.role, staff.aiAccess))
    return next(fail(403, 'FORBIDDEN', 'Meal tracking is not available on this account.'));
  next();
}
mealsRouter.use(requireMealAccess);

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.');
/**
 * The day a meal was eaten — never more than a day ahead (a phone in another timezone can be one
 * ahead of IST). The retention sweep deletes photos by this date, so a log dated 2099 would keep
 * its photo for ever.
 */
const MEAL_DATE = DATE.refine((d) => d <= addDaysISO(todayISO(), 1), {
  message: 'That day has not happened yet.',
});
const SLOT = z.enum(['breakfast', 'lunch', 'snack', 'dinner']);
const IMAGE_TYPE = z.enum(/** @type {[string, ...string[]]} */ (allowedImageTypes));
const MAX_BASE64 = 9_000_000; // ~6.5 MB image after base64 — matches the storage limit

/** A log as the app sees it: the stored row plus the totals and range computed from its items. */
function present(log) {
  if (!log) return log;
  const items = Array.isArray(log.items) ? log.items : [];
  const analysed = items.length > 0 || log.actualKcal != null;
  return {
    ...log,
    source: log.photoKey
      ? 'photo'
      : items.length
        ? 'picked'
        : log.status === 'SKIPPED'
          ? 'skipped'
          : 'plan',
    totals: analysed ? totalsOf(items, log.photoKey ? log.confidence || 'low' : 'high') : null,
  };
}

/** Photo → checked analysis (+ the stored photo's key). Throws the right HTTP failure for each way it can go wrong. */
async function analysePhoto(req, { imageBase64, contentType }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw fail(501, 'NOT_IMPLEMENTED', 'Meal photos need GROQ_API_KEY on the server.');

  // Verify the bytes really are the declared image type before trusting or storing them.
  const buffer = Buffer.from(imageBase64, 'base64');
  try {
    assertRealImage(buffer, contentType);
  } catch {
    throw fail(422, 'VALIDATION', 'That file is not a valid image.');
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  let parsed;
  try {
    parsed = await analyseMealPhoto(key, {
      dataUrl: `data:${contentType};base64,${imageBase64}`,
      signal: ac.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError')
      throw fail(504, 'UPSTREAM_TIMEOUT', 'That took too long. Please try again.');
    req.log?.error({ err: e }, '[meals] vision call failed');
    throw fail(502, 'UPSTREAM', 'Could not read that photo. Please try again.');
  } finally {
    clearTimeout(timer);
  }

  const analysis = finaliseAnalysis(parsed);
  if (!analysis.items.length)
    throw fail(
      422,
      'NO_FOOD_FOUND',
      analysis.note ||
        'We could not see a meal in that photo. Try again in better light, from above.',
    );

  // The photo is kept as the customer's own record, for MEAL_PHOTO_RETENTION_DAYS. Non-fatal if
  // storage is not configured (dev / in-memory): the analysis is the point.
  let photoKey = null;
  try {
    photoKey = await uploadMealPhoto({ buffer, contentType, customerId: req.customerId });
  } catch (e) {
    req.log?.warn?.({ err: e?.message }, '[meals] photo not stored (storage unconfigured?)');
  }
  return { analysis, photoKey };
}

// ───────────────────────────── log a meal ─────────────────────────────

const LogMeal = z
  .object({
    date: MEAL_DATE,
    slot: SLOT,
    mode: z.enum(['photo', 'pick', 'planned', 'skipped']),
    mealName: z.string().max(80).optional(),
    plannedKcal: z.number().int().min(0).max(10000).optional(),
    imageBase64: z.string().min(32).max(MAX_BASE64).optional(),
    contentType: IMAGE_TYPE.optional(),
    picks: z
      .array(
        z.object({
          foodId: z.string().max(40),
          servings: z.number().min(0.25).max(10).optional(),
          grams: z.number().min(1).max(2000).optional(),
        }),
      )
      .min(1)
      .max(12)
      .optional(),
    /** Add to what is already logged for this meal instead of replacing it (a second helping, a side). */
    append: z.boolean().optional(),
  })
  .refine((b) => b.mode !== 'photo' || (b.imageBase64 && b.contentType), {
    message: 'A photo is required.',
  })
  .refine((b) => b.mode !== 'pick' || b.picks?.length, { message: 'Pick at least one food.' });

mealsRouter.post(
  '/log',
  validateBody(LogMeal),
  asyncHandler(async (req, res) => {
    const { date, slot, mode, mealName, plannedKcal, append } = req.body;
    const existing = listMealLogs(req.customerId, { from: date, to: date }).find(
      (m) => m.slot === slot,
    );
    const base = { date, slot, mealName, plannedKcal };

    if (mode === 'skipped') {
      const log = upsertMealLog(req.customerId, {
        ...base,
        status: 'SKIPPED',
        actualKcal: null,
        items: null,
        confidence: null,
      });
      return res.status(201).json({ log: present(log) });
    }

    if (mode === 'planned') {
      // "I had it": they ate what the plan said. The plan's figure stands in as the actual until a
      // photo says otherwise — recorded as the plan's number, not dressed up as a measurement.
      const log = upsertMealLog(req.customerId, { ...base, status: 'FOLLOWED' });
      return res.status(201).json({ log: present(log) });
    }

    let items;
    let confidence;
    let note;
    let photoKey;
    if (mode === 'photo') {
      const r = await analysePhoto(req, req.body);
      items = r.analysis.items;
      confidence = r.analysis.confidence;
      note = r.analysis.note;
      photoKey = r.photoKey;
    } else {
      items = itemsFromPicks(req.body.picks);
      if (!items.length) throw fail(422, 'VALIDATION', 'We do not recognise those foods.');
      confidence = 'high'; // the customer told us what and how much
      note = null;
    }

    if (append && Array.isArray(existing?.items)) items = [...existing.items, ...items];
    // A new photo replaces the old one — delete the file we no longer point at. That holds when
    // appending too: the log keeps ONE photo key, so the earlier photo would otherwise be left in
    // storage with nothing pointing at it, out of reach of the retention sweep and of account
    // deletion, kept for ever.
    if (photoKey && existing?.photoKey) await deleteMealPhotos([existing.photoKey]);

    const log = upsertMealLog(req.customerId, {
      ...base,
      // a planned meal answered with a photo counts as followed; with no plan it is simply "eaten"
      status: 'FOLLOWED',
      items,
      actualKcal: totalsOf(items, confidence).kcal,
      confidence: append && existing?.confidence === 'low' ? 'low' : confidence,
      note,
      ...(photoKey ? { photoKey } : {}),
    });
    res.status(201).json({ log: present(log) });
  }),
);

// ───────────────────────────── correct a meal ─────────────────────────────

const Correct = z
  .object({
    /** "That was a bigger / smaller portion." */
    scale: z.number().min(0.25).max(3).optional(),
    /** "How much oil or ghee went in?" */
    oil: z.enum(['none', 'light', 'normal', 'heavy']).optional(),
    /** Drop one item the camera got wrong, by its position in the list. */
    removeItem: z.number().int().min(0).max(40).optional(),
  })
  .refine((b) => b.scale !== undefined || b.oil !== undefined || b.removeItem !== undefined, {
    message: 'Nothing to change.',
  });

mealsRouter.patch(
  '/:id',
  validateBody(Correct),
  asyncHandler(async (req, res) => {
    const existing = getMealLog(req.customerId, req.params.id);
    if (!existing) throw fail(404, 'NOT_FOUND', 'Meal log not found.');
    let items = Array.isArray(existing.items) ? existing.items : [];
    if (!items.length)
      throw fail(422, 'VALIDATION', 'There is nothing to adjust on this meal yet.');

    const { scale, oil, removeItem } = req.body;
    if (removeItem !== undefined) items = items.filter((_, i) => i !== removeItem);
    if (scale !== undefined) items = applyScale(items, scale);
    if (oil !== undefined) items = applyOil(items, oil);

    const log = upsertMealLog(req.customerId, {
      date: existing.date,
      slot: existing.slot,
      status: existing.status,
      items,
      actualKcal: totalsOf(items).kcal,
    });
    res.json({ log: present(log) });
  }),
);

mealsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const removed = deleteMealLog(req.customerId, req.params.id);
    if (!removed) throw fail(404, 'NOT_FOUND', 'Meal log not found.');
    await deleteMealPhotos([removed.photoKey]);
    res.json({ ok: true });
  }),
);

// ───────────────────────────── read ─────────────────────────────

mealsRouter.get(
  '/day',
  validateQuery(z.object({ date: DATE })),
  asyncHandler(async (req, res) => {
    const date = req.query.date;
    const logs = listMealLogs(req.customerId, { from: date, to: date });
    res.json({
      date,
      logs: logs.map(present),
      summary: daySummary(logs),
      photoRetentionDays: MEAL_PHOTO_RETENTION_DAYS,
    });
  }),
);

mealsRouter.get(
  '/streak',
  validateQuery(z.object({ today: DATE })),
  asyncHandler(async (req, res) => {
    res.json(streakFrom(listMealLogs(req.customerId), req.query.today));
  }),
);

mealsRouter.get(
  '/foods',
  validateQuery(z.object({ q: z.string().max(40).optional() })),
  asyncHandler(async (req, res) => {
    res.json({ foods: searchFoods(req.query.q) });
  }),
);

// ───────────────────────────── the original two-step flow (older builds) ─────────────────────────────

mealsRouter.post(
  '/checkin',
  validateBody(
    z.object({
      date: MEAL_DATE,
      slot: SLOT,
      mealName: z.string().max(80).optional(),
      status: z.enum(['FOLLOWED', 'SKIPPED', 'DEVIATED']),
      plannedKcal: z.number().int().min(0).max(10000).optional(),
      note: z.string().max(300).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const log = upsertMealLog(req.customerId, req.body);
    res.status(201).json({ log: present(log) });
  }),
);

mealsRouter.post(
  '/:id/photo',
  validateBody(
    z.object({ imageBase64: z.string().min(32).max(MAX_BASE64), contentType: IMAGE_TYPE }),
  ),
  asyncHandler(async (req, res) => {
    const existing = getMealLog(req.customerId, req.params.id);
    if (!existing) throw fail(404, 'NOT_FOUND', 'Meal check-in not found.');
    const { analysis, photoKey } = await analysePhoto(req, req.body);
    if (photoKey && existing.photoKey) await deleteMealPhotos([existing.photoKey]);
    const log = upsertMealLog(req.customerId, {
      date: existing.date,
      slot: existing.slot,
      status: existing.status === 'SKIPPED' ? 'FOLLOWED' : existing.status, // a photo implies they ate
      actualKcal: analysis.totals.kcal,
      items: analysis.items,
      confidence: analysis.confidence,
      note: analysis.note ?? existing.note ?? null,
      ...(photoKey ? { photoKey } : {}),
    });
    // `analysis.totalKcal` is what older builds read
    res.json({ log: present(log), analysis: { ...analysis, totalKcal: analysis.totals.kcal } });
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
