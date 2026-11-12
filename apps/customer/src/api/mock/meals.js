/**
 * A working stand-in for the meal-tracking API (apps/api/src/routes/meals.js), so the calorie
 * tracker can be opened, logged to and corrected against mocks — no server, no model, no photos
 * leaving the machine.
 *
 * It keeps the real API's SHAPES and none of its judgement: the reference table here is a handful
 * of dishes with round numbers, and a "photo" always comes back as the same plate. The arithmetic
 * that matters — the checked reference values, the ranges, the forgiving streak — lives in
 * apps/api/src/lib/meal-analysis.js and is tested there. Nothing in this file reaches a customer.
 */

// One row per entry, on purpose: a table reads as a table. prettier-ignore keeps it one.
// prettier-ignore
const FOODS = [
  { id: 'rice-cooked', name: 'Steamed rice', also: ['annam', 'chawal'], kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, grams: 150, unit: 'katori' },
  { id: 'roti', name: 'Roti / phulka', also: ['chapati', 'pulka'], kcal: 264, protein: 8.5, carbs: 50, fat: 3.5, grams: 35, unit: 'roti' },
  { id: 'dal-tadka', name: 'Dal (pappu)', also: ['pappu', 'dal tadka'], kcal: 105, protein: 5.5, carbs: 13, fat: 3.5, grams: 150, unit: 'katori' },
  { id: 'sambar', name: 'Sambar', also: ['sambhar'], kcal: 65, protein: 3, carbs: 9, fat: 2, grams: 150, unit: 'katori' },
  { id: 'curd', name: 'Curd', also: ['perugu', 'dahi'], kcal: 62, protein: 3.3, carbs: 4.6, fat: 3.3, grams: 100, unit: 'katori' },
  { id: 'veg-curry', name: 'Vegetable curry', also: ['kura', 'sabzi'], kcal: 95, protein: 2.4, carbs: 9, fat: 5.5, grams: 120, unit: 'katori' },
  { id: 'idli', name: 'Idli', also: ['idly'], kcal: 135, protein: 4.3, carbs: 27, fat: 0.6, grams: 40, unit: 'idli' },
  { id: 'dosa', name: 'Plain dosa', also: ['dosai', 'attu'], kcal: 190, protein: 4.5, carbs: 30, fat: 5.5, grams: 80, unit: 'dosa' },
];

const SPREAD = { high: 0.15, medium: 0.25, low: 0.4 };
const OIL_TSP = { none: 0, light: 1, normal: 2, heavy: 4 };
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const ATE = (m) => m.status === 'FOLLOWED' || m.status === 'DEVIATED';
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** @type {any[]} */
let LOGS = [];
let seq = 1;

export function resetMockMeals() {
  LOGS = [];
  seq = 1;
}

function itemOf(food, grams, check) {
  const k = grams / 100;
  return {
    name: food.name,
    grams: r0(grams),
    kcal: r0(food.kcal * k),
    protein: r1(food.protein * k),
    carbs: r1(food.carbs * k),
    fat: r1(food.fat * k),
    dish: food.id,
    check,
  };
}

function totalsOf(items, confidence) {
  const sum = (f) => items.reduce((a, it) => a + (it[f] || 0), 0);
  const kcal = sum('kcal');
  const spread = SPREAD[confidence] ?? SPREAD.low;
  return {
    kcal: r0(kcal),
    protein: r1(sum('protein')),
    carbs: r1(sum('carbs')),
    fat: r1(sum('fat')),
    kcalLow: r0(kcal * (1 - spread * 0.6)),
    kcalHigh: r0(kcal * (1 + spread)),
  };
}

function present(log) {
  const items = log.items || [];
  const analysed = items.length > 0 || log.actualKcal != null;
  return {
    ...log,
    photoKey: undefined,
    hasPhoto: !!log.photoKey,
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

function daySummary(logs) {
  const eaten = logs.filter(ATE);
  const bySlot = {};
  let low = 0;
  let high = 0;
  for (const m of eaten) {
    const items = m.items || [];
    const kcal = m.actualKcal != null ? m.actualKcal : m.plannedKcal || 0;
    const spread = m.photoKey ? (SPREAD[m.confidence] ?? SPREAD.low) : 0.1;
    low += kcal * (1 - spread * 0.6);
    high += kcal * (1 + spread);
    const macro = (f) => r1(items.reduce((a, it) => a + (it[f] || 0), 0));
    bySlot[m.slot] = {
      kcal: r0(kcal),
      protein: macro('protein'),
      carbs: macro('carbs'),
      fat: macro('fat'),
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
    mealsSkipped: logs.filter((m) => m.status === 'SKIPPED').length,
  };
}

function streakFrom(today) {
  const days = new Set(LOGS.filter(ATE).map((m) => m.date));
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, logged: days.has(date) };
  });
  let current = 0;
  for (let d = days.has(today) ? today : addDays(today, -1); days.has(d); d = addDays(d, -1))
    current++;
  const daysThisWeek = week.filter((d) => d.logged).length;
  return {
    current,
    best: current,
    restDaysUsed: 0,
    loggedToday: days.has(today),
    week,
    weeklyGoal: 5,
    daysThisWeek,
    goalMet: daysThisWeek >= 5,
  };
}

function recount(log) {
  log.actualKcal = log.items.length ? r0(log.items.reduce((a, it) => a + it.kcal, 0)) : null;
}

/**
 * @param {string} method
 * @param {string} p        path without the query string
 * @param {Record<string,string>} query
 * @param {any} body
 * @returns {{ status: number, body: any } | null} null when the path is not a meals route
 */
export function handleMeals(method, p, query, body) {
  if (!p.startsWith('/meals')) return null;
  const json = (b, status = 200) => ({ status, body: JSON.parse(JSON.stringify(b)) });
  const bad = (status, code, message) => ({ status, body: { error: { code, message } } });

  if (method === 'GET' && p === '/meals/day') {
    const logs = LOGS.filter((m) => m.date === query.date);
    return json({
      date: query.date,
      logs: logs.map(present),
      summary: daySummary(logs),
      photoRetentionDays: 35,
    });
  }
  if (method === 'GET' && p === '/meals/streak') return json(streakFrom(query.today));
  if (method === 'GET' && p === '/meals/foods') {
    const needle = String(query.q || '')
      .trim()
      .toLowerCase();
    const foods = FOODS.filter(
      (f) => !needle || [f.name, ...f.also].some((a) => a.toLowerCase().includes(needle)),
    );
    return json({
      foods: foods.map((f) => ({
        id: f.id,
        name: f.name,
        also: f.also,
        per100g: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat },
        serving: { grams: f.grams, unit: f.unit, kcal: r0((f.kcal * f.grams) / 100) },
      })),
    });
  }

  if (method === 'POST' && p === '/meals/log') {
    const { date, slot, mode, mealName, plannedKcal, picks, append } = body || {};
    if (!date || !slot || !mode) return bad(422, 'VALIDATION', 'date, slot and mode are required.');
    let log = LOGS.find((m) => m.date === date && m.slot === slot);
    if (!log) {
      log = {
        id: `meal_${seq++}`,
        date,
        slot,
        items: [],
        status: 'PENDING',
        mealName: null,
        plannedKcal: null,
        actualKcal: null,
        confidence: null,
        note: null,
        photoKey: null,
      };
      LOGS.push(log);
    }
    if (mealName) log.mealName = mealName;
    if (plannedKcal != null) log.plannedKcal = plannedKcal;
    const keep = append ? log.items : [];

    if (mode === 'skipped') {
      Object.assign(log, {
        status: 'SKIPPED',
        items: [],
        actualKcal: null,
        photoKey: null,
        confidence: null,
        note: null,
      });
    } else if (mode === 'planned') {
      Object.assign(log, {
        status: 'FOLLOWED',
        items: [],
        actualKcal: null,
        photoKey: null,
        confidence: null,
        note: null,
      });
    } else if (mode === 'pick') {
      const added = (picks || [])
        .map((pk) => {
          const food = FOODS.find((f) => f.id === pk.foodId);
          return food ? itemOf(food, (Number(pk.servings) || 1) * food.grams, 'yours') : null;
        })
        .filter(Boolean);
      if (!added.length) return bad(422, 'VALIDATION', 'Pick at least one food.');
      Object.assign(log, { status: 'DEVIATED', items: [...keep, ...added] });
      recount(log);
    } else if (mode === 'photo') {
      // Always the same plate: rice, dal and a vegetable curry. No oil line — as on the real API,
      // that only appears once the customer answers "how much oil went in?".
      const plate = [
        itemOf(FOODS[0], 180, 'ok'),
        itemOf(FOODS[2], 150, 'ok'),
        itemOf(FOODS[5], 110, 'adjusted'),
      ];
      Object.assign(log, {
        status: 'DEVIATED',
        items: [...keep, ...plate],
        photoKey: `mock/${log.id}.jpg`,
        confidence: 'medium',
        note: 'A sample reading — the mock does not look at the photo.',
      });
      recount(log);
    } else return bad(422, 'VALIDATION', 'Unknown mode.');
    return json({ log: present(log) });
  }

  const idMatch = p.match(/^\/meals\/([^/]+)$/);
  if (idMatch && method === 'PATCH') {
    const log = LOGS.find((m) => m.id === idMatch[1]);
    if (!log) return bad(404, 'NOT_FOUND', 'Meal not found');
    const { scale, oil, removeItem } = body || {};
    if (typeof removeItem === 'number') log.items = log.items.filter((_, i) => i !== removeItem);
    if (scale) {
      const k = Math.max(0.25, Math.min(3, Number(scale)));
      log.items = log.items.map((it) =>
        it.dish === 'added-fat'
          ? it
          : {
              ...it,
              grams: r0(it.grams * k),
              kcal: r0(it.kcal * k),
              protein: r1(it.protein * k),
              carbs: r1(it.carbs * k),
              fat: r1(it.fat * k),
              check: 'yours',
            },
      );
    }
    if (oil in OIL_TSP) {
      const tsp = OIL_TSP[oil];
      log.items = log.items.filter((it) => it.dish !== 'added-fat');
      if (tsp > 0)
        log.items.push({
          name: `Cooking oil / ghee (${tsp} tsp)`,
          grams: tsp * 5,
          kcal: tsp * 45,
          protein: 0,
          carbs: 0,
          fat: tsp * 5,
          dish: 'added-fat',
          check: 'yours',
        });
    }
    recount(log);
    return json({ log: present(log) });
  }
  if (idMatch && method === 'DELETE') {
    LOGS = LOGS.filter((m) => m.id !== idMatch[1]);
    return json({ ok: true });
  }

  return bad(404, 'NOT_FOUND', `No mock route for ${method} ${p}`);
}
