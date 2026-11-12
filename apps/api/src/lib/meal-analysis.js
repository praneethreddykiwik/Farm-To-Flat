/**
 * Everything that turns "what the camera thought it saw" into a meal log the customer can trust —
 * and nothing that talks to a network. Pure functions, fully unit-tested.
 *
 * WHAT THIS IS HONEST ABOUT
 * Estimating a meal from one photograph is approximate. An NIH metabolic-kitchen comparison of
 * photo-logging apps (NUTRITION 2026) found they UNDER-count by about a third on average, and that
 * almost all of the miss is fat: the oil, ghee and tadka a camera cannot see. So this module
 *   • checks every item against a reference table of Indian dishes and corrects implausible ones,
 *   • always returns a RANGE with the estimate, wider when the model was unsure,
 *   • lets the customer say how much oil went in, and adds it as its own visible line, and
 *   • lets them scale a portion up or down in one tap.
 * The number is for building a habit and seeing a trend. It is not a measurement, and the app says so.
 */
import { DISHES, FAT_KCAL_PER_G, TSP_OIL_G } from '../data/dishes.js';

/** @typedef {import('../data/dishes.js').Dish} Dish */

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const num = (v) => (Number.isFinite(+v) && +v >= 0 ? +v : null);

// longest alias first, so "masala dosa" beats "dosa" and "curd rice" beats "rice"
const ALIASES = DISHES.flatMap((d) =>
  [d.name, ...d.also].map((a) => /** @type {[string, Dish]} */ ([norm(a), d])),
).sort((a, b) => b[0].length - a[0].length);

/** The reference dish a free-text name refers to, or null. Whole-word match. */
export function matchDish(name) {
  const text = ` ${norm(name)} `;
  for (const [alias, dish] of ALIASES) if (alias && text.includes(` ${alias} `)) return dish;
  return null;
}

/** How far the true figure may plausibly sit from the estimate, by the model's own confidence. */
export const SPREAD = { high: 0.15, medium: 0.25, low: 0.4 };

/** A model density this far outside the reference is treated as a mistake and corrected. */
const TOO_LOW = 0.5;
const TOO_HIGH = 1.7;

/**
 * Check one item from the vision model against the reference table.
 * @param {{ name:string, grams?:number|null, kcal?:number|null, protein?:number|null, carbs?:number|null, fat?:number|null, count?:number|null, unit?:string|null }} raw
 */
export function checkItem(raw) {
  const name = String(raw?.name || 'item').slice(0, 60);
  const dish = matchDish(name);
  let grams = num(raw?.grams);
  const count = num(raw?.count);
  // "2 roti" with no weight: use the household portion
  if (!grams && dish && count) grams = count * dish.serve[0];
  if (!grams && dish) grams = dish.serve[0];

  let kcal = num(raw?.kcal);
  let protein = num(raw?.protein);
  let carbs = num(raw?.carbs);
  let fat = num(raw?.fat);
  let check = dish ? 'ok' : 'unverified';

  if (dish && grams) {
    const ref = (per100) => (per100 * grams) / 100;
    const density = kcal != null ? (kcal / grams) * 100 : null;
    if (density == null || density < dish.kcal * TOO_LOW || density > dish.kcal * TOO_HIGH) {
      // implausible (or missing) for this dish — use the reference for the portion shown
      kcal = ref(dish.kcal);
      protein = ref(dish.protein);
      carbs = ref(dish.carbs);
      fat = ref(dish.fat);
      check = 'adjusted';
    } else {
      // plausible calories: fill any macro the model left out, in proportion to the reference
      const k = kcal / ref(dish.kcal);
      if (protein == null) protein = ref(dish.protein) * k;
      if (carbs == null) carbs = ref(dish.carbs) * k;
      if (fat == null) fat = ref(dish.fat) * k;
    }
  }

  return {
    name,
    grams: grams ? r0(grams) : null,
    kcal: kcal != null ? r0(kcal) : null,
    protein: protein != null ? r1(protein) : null,
    carbs: carbs != null ? r1(carbs) : null,
    fat: fat != null ? r1(fat) : null,
    ...(dish ? { dish: dish.id } : {}),
    check,
  };
}

/** Sum of the items, with the range the true total plausibly lies in. */
export function totalsOf(items, confidence = 'low') {
  const sum = (f) => (items || []).reduce((a, it) => a + (it[f] || 0), 0);
  const kcal = r0(sum('kcal'));
  const spread = SPREAD[confidence] ?? SPREAD.low;
  return {
    kcal,
    protein: r1(sum('protein')),
    carbs: r1(sum('carbs')),
    fat: r1(sum('fat')),
    // Photo estimates miss LOW far more often than high (hidden fat), so the range leans upward.
    kcalLow: r0(kcal * (1 - spread * 0.6)),
    kcalHigh: r0(kcal * (1 + spread)),
  };
}

/**
 * Turn the vision model's parsed reply into the analysis we store and show.
 * @param {{ items?: any[], confidence?: string, note?: string|null }} parsed
 */
export function finaliseAnalysis(parsed) {
  const items = (Array.isArray(parsed?.items) ? parsed.items : [])
    .slice(0, 12)
    .map(checkItem)
    .filter((it) => it.kcal != null || it.grams != null);
  const confidence = ['low', 'medium', 'high'].includes(parsed?.confidence)
    ? parsed.confidence
    : 'low';
  // A plate we had to correct, or could not check at all, is not a high-confidence plate.
  const shaky = items.some((it) => it.check !== 'ok');
  const settled = shaky && confidence === 'high' ? 'medium' : confidence;
  return {
    items,
    confidence: settled,
    note: typeof parsed?.note === 'string' ? parsed.note.slice(0, 200) : null,
    totals: totalsOf(items, settled),
  };
}

const OIL_ID = 'added-fat';
/** Teaspoons of oil/ghee for the whole plate, per answer to "how much oil went in?". */
export const OIL_TSP = { none: 0, light: 1, normal: 2, heavy: 4 };

/**
 * The customer's answer to "how much oil or ghee?" becomes its own visible line, replacing any
 * earlier answer. `none` removes the line. Never hidden inside another item's number.
 */
export function applyOil(items, level) {
  const rest = (items || []).filter((it) => it.dish !== OIL_ID);
  const tsp = OIL_TSP[level];
  if (!tsp) return rest;
  const grams = tsp * TSP_OIL_G;
  return [
    ...rest,
    {
      name: `Cooking oil / ghee (${tsp} tsp)`,
      grams,
      kcal: r0(grams * FAT_KCAL_PER_G),
      protein: 0,
      carbs: 0,
      fat: grams,
      dish: OIL_ID,
      check: 'yours',
    },
  ];
}

/** "That was a bigger / smaller portion": scale every item (not the oil line) by a factor. */
export function applyScale(items, factor) {
  const f = Math.min(3, Math.max(0.25, Number(factor) || 1));
  return (items || []).map((it) =>
    it.dish === OIL_ID
      ? it
      : {
          ...it,
          grams: it.grams != null ? r0(it.grams * f) : null,
          kcal: it.kcal != null ? r0(it.kcal * f) : null,
          protein: it.protein != null ? r1(it.protein * f) : null,
          carbs: it.carbs != null ? r1(it.carbs * f) : null,
          fat: it.fat != null ? r1(it.fat * f) : null,
          check: 'yours',
        },
  );
}

/**
 * Items for a meal logged by picking foods from the list ("2 roti, a katori of dal").
 * @param {{ foodId: string, servings?: number, grams?: number }[]} picks
 */
export function itemsFromPicks(picks) {
  const out = [];
  for (const p of picks || []) {
    const dish = DISHES.find((d) => d.id === p.foodId);
    if (!dish) continue;
    const grams = num(p.grams) || (num(p.servings) || 1) * dish.serve[0];
    const k = grams / 100;
    out.push({
      name: dish.name,
      grams: r0(grams),
      kcal: r0(dish.kcal * k),
      protein: r1(dish.protein * k),
      carbs: r1(dish.carbs * k),
      fat: r1(dish.fat * k),
      dish: dish.id,
      check: 'yours',
    });
  }
  return out;
}

/** "Search food": dishes whose name or any regional name contains the query. */
export function searchFoods(q, limit = 20) {
  const needle = norm(q);
  const hit = (d) => !needle || [d.name, ...d.also].some((a) => norm(a).includes(needle));
  return DISHES.filter(hit)
    .slice(0, limit)
    .map((d) => ({
      id: d.id,
      name: d.name,
      also: d.also.slice(0, 3),
      per100g: { kcal: d.kcal, protein: d.protein, carbs: d.carbs, fat: d.fat },
      serving: { grams: d.serve[0], unit: d.serve[1], kcal: r0((d.kcal * d.serve[0]) / 100) },
    }));
}

// ───────────────────────────── the day, and the streak ─────────────────────────────

const ATE = (m) => m.status === 'FOLLOWED' || m.status === 'DEVIATED';
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** One day's totals and per-meal breakdown, from that day's logs. */
export function daySummary(logs) {
  const eaten = (logs || []).filter(ATE);
  const itemsOf = (m) => (Array.isArray(m.items) ? m.items : []);
  const macro = (m, f) => itemsOf(m).reduce((a, it) => a + (it[f] || 0), 0);
  const kcalOf = (m) => (m.actualKcal != null ? m.actualKcal : m.plannedKcal || 0);
  const bySlot = {};
  let low = 0;
  let high = 0;
  for (const m of eaten) {
    const kcal = kcalOf(m);
    // a photo carries its own uncertainty; a plan figure or a hand-picked food is taken as given
    const spread = m.photoKey || m.confidence ? (SPREAD[m.confidence] ?? SPREAD.low) : 0.1;
    low += kcal * (1 - spread * 0.6);
    high += kcal * (1 + spread);
    bySlot[m.slot] = {
      kcal: r0(kcal),
      protein: r1(macro(m, 'protein')),
      carbs: r1(macro(m, 'carbs')),
      fat: r1(macro(m, 'fat')),
      estimated: m.actualKcal != null,
    };
  }
  const sum = (f) => Object.values(bySlot).reduce((a, s) => a + s[f], 0);
  return {
    totals: {
      kcal: r0(sum('kcal')),
      protein: r1(sum('protein')),
      carbs: r1(sum('carbs')),
      fat: r1(sum('fat')),
      kcalLow: r0(low),
      kcalHigh: r0(high),
    },
    bySlot,
    mealsLogged: eaten.length,
    mealsSkipped: (logs || []).filter((m) => m.status === 'SKIPPED').length,
  };
}

/** Days a week we ask of someone. Five, not seven: a goal that survives a wedding and a fever. */
export const WEEKLY_GOAL = 5;

/**
 * The logging streak — built to encourage, not to punish.
 *
 * A day counts when at least one meal was logged as eaten. One missed day in any seven is forgiven
 * automatically (a "rest day"), so a single bad day does not wipe out weeks. Today never breaks a
 * streak before it is over. Alongside it, a weekly goal of five days, which is the number that
 * actually matters: clinicians warn that an unbroken daily count can turn into anxiety, and a habit
 * that tolerates real life lasts longer.
 *
 * @param {{ date: string, status: string }[]} logs  any range that includes the recent past
 * @param {string} today  YYYY-MM-DD in the customer's (IST) day
 */
export function streakFrom(logs, today) {
  const days = new Set((logs || []).filter(ATE).map((m) => m.date));
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, logged: days.has(date) };
  });

  // walk back from today (or yesterday, if today is not logged yet)
  let cursor = days.has(today) ? today : addDays(today, -1);
  let current = 0;
  let restDaysUsed = 0;
  let lastRest = null;
  for (let guard = 0; guard < 400; guard++) {
    if (days.has(cursor)) {
      current++;
    } else {
      // forgive one gap per rolling seven days, but only if the streak carries on behind it
      const canRest =
        (lastRest === null || daysBetween(cursor, lastRest) >= 7) && days.has(addDays(cursor, -1));
      if (!canRest) break;
      restDaysUsed++;
      lastRest = cursor;
    }
    cursor = addDays(cursor, -1);
  }

  // best ever, by the same rule, over what we were given
  let best = current;
  const sorted = [...days].sort();
  let run = 0;
  let prev = null;
  let runRest = null;
  for (const d of sorted) {
    if (prev === null) run = 1;
    else {
      const gap = daysBetween(prev, d);
      if (gap === 1) run++;
      else if (gap === 2 && (runRest === null || daysBetween(runRest, d) >= 7)) {
        run++;
        runRest = d;
      } else {
        run = 1;
        runRest = null;
      }
    }
    if (run > best) best = run;
    prev = d;
  }

  const daysThisWeek = week.filter((d) => d.logged).length;
  return {
    current,
    best,
    restDaysUsed,
    loggedToday: days.has(today),
    week,
    weeklyGoal: WEEKLY_GOAL,
    daysThisWeek,
    goalMet: daysThisWeek >= WEEKLY_GOAL,
  };
}

function daysBetween(a, b) {
  const t = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.abs(Math.round((t(b) - t(a)) / 86400000));
}
