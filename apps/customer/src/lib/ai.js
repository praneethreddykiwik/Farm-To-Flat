/**
 * AI diet planner client. Two providers behind one function, chosen by EXPO_PUBLIC_AI_PROVIDER:
 *   groq   → OpenAI-compatible chat completions, JSON mode
 *   gemini → generateContent with responseMimeType application/json
 *
 * Grounding rules (this is how the plan cannot "lie"):
 *  1. The model only ever sees OUR catalog with per-100 g nutrition from src/lib/nutrition.js.
 *  2. It returns structure only: which product, how many grams, in which meal, plus short steps.
 *  3. Every calorie / protein number displayed is recomputed by the app from the nutrition table.
 *     Unknown product ids are dropped; grams are clamped to sane ranges.
 *
 * Dev builds call the providers directly with keys from .env (EXPO_PUBLIC_*, which ship in the
 * bundle, so only ever use test keys there). Production goes through POST /api/v1/ai/plan on the
 * server so the real key never leaves the backend (see docs/api-contract.md).
 */
import { env } from './env';
import { NUTRITION, dailyTargets, totalsFor } from './nutrition';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const HORIZON_DAYS = { meal: 1, day: 1, week: 7, month: 30 };
// The model writes a rotation; long horizons are tiled from it so the response stays small and reliable.
const TEMPLATE_DAYS = { meal: 1, day: 1, week: 7, month: 7 };
const SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'];

/** @returns {{ provider: 'groq'|'gemini', model: string, key: string|null }} */
export function aiConfig(override) {
  const provider = override || env.aiProvider;
  if (provider === 'gemini') return { provider, model: env.geminiModel, key: env.geminiKey };
  return { provider: 'groq', model: env.groqModel, key: env.groqKey };
}

export const aiAvailable = () => !!aiConfig().key || !env.useMocks;

function catalogForPrompt(products) {
  return products
    .filter((p) => NUTRITION[p.id])
    .map((p) => {
      const n = NUTRITION[p.id];
      return `${p.id} | ${p.name} | ${n.kcal} kcal, ${n.protein} g protein, ${n.carbs} g carbs, ${n.fat} g fat, ${n.fibre} g fibre per 100 g | tags: ${n.tags.join(',')}`;
    })
    .join('\n');
}

function systemPrompt({ profile, targets, horizon, products }) {
  const days = TEMPLATE_DAYS[horizon] || 1;
  const avoidList = [...(profile.excludes || []), profile.avoid]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(', ');
  const nonVegDays = profile.diet === 'non-vegetarian' ? (profile.nonVegDaysPerWeek ?? 4) : 0;
  const m = new Date().getMonth();
  const season = [10, 11, 0, 1].includes(m)
    ? 'winter'
    : [2, 3, 4, 5].includes(m)
      ? 'summer'
      : 'monsoon';
  const cheatDays =
    horizon === 'week' || horizon === 'month'
      ? Math.min(3, Math.max(0, Number(profile.cheatDaysPerWeek || 0)))
      : 0;
  const regionText =
    profile.region === 'north'
      ? 'North-Indian'
      : profile.region === 'both'
        ? 'both North-Indian and South-Indian / Telangana'
        : 'South-Indian / Telangana';
  return `You are a careful dietitian assistant for a farm-to-flat grocery in Hyderabad, India.
You plan meals ONLY from the catalog below. Every figure the customer sees is computed by the app
from the per-100 g nutrition given here, so never invent products, never add ingredients that are not
in the catalog (staples like rice, dal, oil, curd, spices may be MENTIONED in steps as pantry items but
must NOT be listed as items), and never state calorie numbers yourself.

CUSTOMER PROFILE
- age ${profile.age || 'unknown'}, sex ${profile.sex || 'unspecified'}, weight ${profile.weightKg || 'unknown'} kg, height ${profile.heightCm || 'unknown'} cm
- activity: ${profile.activity || 'moderate'} · goal: ${profile.goal || 'maintain'} · diet: ${profile.diet || 'vegetarian + eggs'}
- meals per day: EXACTLY ${profile.mealsPerDay || 3} (${Number(profile.mealsPerDay) === 1 ? 'a single main meal' : Number(profile.mealsPerDay) === 2 ? 'brunch + dinner, no separate breakfast' : Number(profile.mealsPerDay) >= 4 ? 'three meals plus one snack' : 'breakfast, lunch, dinner'})
- MUST NOT USE (allergy/dislike — never as an item AND never mentioned in any step): ${avoidList || 'none'}
- standing instructions from the customer (ALWAYS follow, including any meal-timing rule like "no acidic foods at lunch"): ${profile.customInstructions || 'none'}

DAILY TARGETS (app-computed, Mifflin–St Jeor): ${targets.kcal} kcal, ${targets.protein} g protein, ${targets.carbs} g carbs, ${targets.fat} g fat, ${targets.fibre} g fibre.
Aim for the produce in this plan to cover 35–60% of daily kcal and as much protein as the catalog realistically allows; the rest comes from pantry staples mentioned in steps. Do not exceed 1.2× the kcal target. If the goal is not achievable with this catalog, say so in "cautions" instead of inflating quantities.

HORIZON: ${horizon} → return exactly ${days} day(s)${horizon === 'month' ? ' (a 7-day rotation; the app repeats it across the month)' : ''}. ${horizon === 'meal' ? 'Return ONE meal only.' : ''}
REALISM RULES (hard): chicken, mutton or prawns in AT MOST one meal per day and on at most ${nonVegDays} day(s) in any 7 (${nonVegDays === 0 ? 'this plan is fully VEGETARIAN — no chicken/mutton/prawns at all' : 'the other days are vegetarian'}); eggs at most one meal per day; never two non-veg meals on the same day; at least one leafy-green vegetable every day; breakfast is the lightest meal; a typical Indian day is 3 meals plus an optional fruit snack, not 3 heavy dishes. Return exactly the requested number of meals per day, no more.
KEEP IT TIGHT: each meal uses 1–3 catalog ingredients only. Do NOT pad meals with items that add little to the day's calories or protein — every listed item must earn its place.
SEASON & TRADITION: it is ${season} in Hyderabad — favour vegetables that are in season now and prefer traditional ${regionText} home recipes passed down through generations (e.g. pappu, kura, pesarattu, sprout salads${profile.region !== 'south' ? ', sabzi, dal, roti-friendly dishes' : ''}), not fusion food. When a generational/seasonal special is in the catalog (e.g. raw jackfruit, ice apple, ponnaganti aaku), use it where it fits.
HEALTHY ALTERNATIVES: when a craving would normally mean a heavy dish, offer the lighter traditional swap instead and say so in the meal name — e.g. "Jackfruit pulao (lighter than biryani)", millet/veg upma instead of a fried tiffin. Keep it tasty but on-target.
SPROUTS & GRAINS (hard rule): the catalog's protein for a vegetarian/vegan plan comes mainly from SPROUTS & SOAKED GRAINS — p_moong_sprout (moong sprouts), p_chana_sprout (kala chana sprouts), p_chana_soaked (soaked chana), p_almond_soaked (soaked almonds). ${profile.diet === 'non-vegetarian' ? 'Include at least one of these on most days.' : 'Include at least one of these EVERY day (usually breakfast or a snack) — a veg high-protein day is not possible without them.'}
${cheatDays > 0 ? `CHEAT DAYS: the customer allows ${cheatDays} cheat day(s) this week. On exactly ${cheatDays} day(s), make ONE meal a relaxed, indulgent-but-still-catalog treat and start its name with "Cheat" — keep every other meal on all ${cheatDays} days and every meal on the remaining days disciplined and on-target.` : 'No cheat days: keep every meal disciplined and on-target.'}
Use variety across days (no product in more than ${Math.max(2, Math.ceil(days / 2))} days for a week/month plan). Per-item grams are EDIBLE grams for one person for that meal: leafy greens 50–150, vegetables 80–250, fruit 100–250, eggs 50 per egg, chicken/mutton/prawns 100–200.

CATALOG (id | name | per 100 g | tags)
${catalogForPrompt(products)}

RESPONSE: JSON only, matching exactly:
{
  "title": "short plan name (≤ 6 words)",
  "summary": "one plain sentence, professional, no hype",
  "days": [
    { "day": 1, "meals": [
      { "slot": "breakfast|lunch|snack|dinner", "name": "dish name (≤ 5 words)",
        "items": [ { "productId": "p_xxx", "grams": 120 } ],
        "steps": [ "≤ 12 words each, max 4 steps" ],
        "prepMinutes": 15 }
    ] }
  ],
  "cautions": [ "only real limitations, e.g. protein target needs pantry pulses; max 3" ]
}`;
}

async function callGroq({ model, key, system, user }) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 9000,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Groq ${res.status}`);
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini({ model, key, system, user }) {
  const res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4,
        maxOutputTokens: 12000,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Gemini ${res.status}`);
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
}

async function callServer({ body }) {
  const { API_BASE } = require('./env');
  const res = await fetch(`${API_BASE}/ai/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `AI ${res.status}`);
  return JSON.stringify(data.plan);
}

function extractJSON(text) {
  const t = String(text || '').trim();
  try {
    return JSON.parse(t);
  } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  // Truncated output: keep every complete day object and close the structure.
  const cut = Math.max(t.lastIndexOf('{ "day"'), t.lastIndexOf('{"day"'));
  if (cut > 0) {
    const head = t.slice(0, cut).replace(/,\s*$/, '');
    try {
      return JSON.parse(`${head}]}`);
    } catch {}
  }
  throw new Error('The planner sent an incomplete plan. Try a shorter horizon or ask again.');
}

const clampGrams = (g) => Math.min(400, Math.max(20, Math.round(Number(g) || 0)));

/**
 * Validate + enrich a raw model plan against the catalog. Numbers are computed here, not by the model.
 * @param {any} raw
 * @param {any[]} products
 * @param {{kcal:number, protein:number}} targets
 * @param {string} horizon
 */
export function normalisePlan(raw, products, /** @type {any} */ targets, horizon, profile = {}) {
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  // Allergy/dislike exclusions: drop any catalog item whose name matches a tapped or typed keyword.
  const excl = [...(profile.excludes || []), ...String(profile.avoid || '').split(/[,;]/)]
    .map((s) => String(s).trim().toLowerCase().replace(/s$/, ''))
    .filter((s) => s.length >= 3);
  const isExcludedProduct = (id) => {
    const nm = (byId[id]?.name || '').toLowerCase();
    return excl.some((k) => nm.includes(k));
  };
  // How many days a week may include meat: 0 for any vegetarian diet, else the customer's choice.
  const nonVegCap = profile.diet === 'non-vegetarian' ? Number(profile.nonVegDaysPerWeek ?? 4) : 0;
  const days = (Array.isArray(raw?.days) ? raw.days : [])
    .slice(0, TEMPLATE_DAYS[horizon] || 1)
    .map((d, di) => {
      const meals = (Array.isArray(d?.meals) ? d.meals : [])
        .map((m) => {
          const items = (Array.isArray(m?.items) ? m.items : [])
            .filter(
              (it) =>
                it &&
                byId[it.productId] &&
                NUTRITION[it.productId] &&
                !isExcludedProduct(it.productId),
            )
            .map((it) => ({ productId: it.productId, grams: clampGrams(it.grams) }));
          if (!items.length) return null;
          return {
            slot: SLOTS.includes(m.slot) ? m.slot : 'lunch',
            name: String(m.name || 'Meal').slice(0, 60),
            items,
            steps: (Array.isArray(m.steps) ? m.steps : [])
              .slice(0, 4)
              .map((s) => String(s).slice(0, 120)),
            prepMinutes: Math.min(90, Math.max(5, Number(m.prepMinutes) || 15)),
            totals: totalsFor(items),
          };
        })
        .filter(Boolean)
        .sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
      const all = meals.flatMap((m) => m.items);
      return { day: di + 1, meals, totals: totalsFor(all) };
    });
  if (!days.length || !days.some((d) => d.meals.length)) {
    throw new Error(
      'The planner could not build a plan from our catalog for that request. Try fewer restrictions.',
    );
  }
  // Realism guard, enforced in code: one non-veg meal a day, at most 4 non-veg days per 7.
  const isNonVeg = (id) => NUTRITION[id]?.tags.includes('non-veg');
  const nonVegDays = [];
  days.forEach((d, di) => {
    let seen = false;
    const inWindow = nonVegDays.filter((x) => x > di - 7).length;
    d.meals = d.meals
      .map((m) => {
        if (!m.items.some((it) => isNonVeg(it.productId))) return m;
        if (seen || inWindow >= nonVegCap) {
          const items = m.items.filter((it) => !isNonVeg(it.productId));
          if (!items.length) return null;
          const name = m.name
            .replace(/chicken|mutton|prawns?|meat/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
          return { ...m, items, totals: totalsFor(items), name: name || 'Vegetable meal' };
        }
        seen = true;
        return m;
      })
      .filter(Boolean);
    if (seen) nonVegDays.push(di);
    d.totals = totalsFor(d.meals.flatMap((m) => m.items));
  });
  // Portion scaling: the model tends to under-portion. If produce covers < 40% of the kcal target,
  // scale every portion up (max 1.8×, max 400 g per item) so the plan is a real day's food, then recompute.
  const tmplAvg = days.reduce((a, d) => a + d.totals.kcal, 0) / days.length;
  let scaled = null;
  if (tmplAvg > 0 && tmplAvg < targets.kcal * 0.4) {
    const factor = Math.min(1.8, (targets.kcal * 0.45) / tmplAvg);
    days.forEach((d) => {
      d.meals.forEach((m) => {
        m.items = m.items.map((it) => ({
          ...it,
          grams: Math.min(400, Math.round((it.grams * factor) / 10) * 10),
        }));
        m.totals = totalsFor(m.items);
      });
      d.totals = totalsFor(d.meals.flatMap((m) => m.items));
    });
    scaled = Math.round(factor * 100) / 100;
  }
  // Tile the rotation across long horizons.
  const want = HORIZON_DAYS[horizon] || 1;
  const template = days.slice();
  while (days.length < want && template.length) {
    const src = template[days.length % template.length];
    days.push({ ...src, day: days.length + 1 });
  }
  // Aggregate shopping list across the whole plan
  const agg = {};
  const shoppingDays = days.slice(0, 7); // produce is bought fresh: list the first week, it repeats
  shoppingDays.forEach((d) =>
    d.meals.forEach((m) =>
      m.items.forEach((it) => (agg[it.productId] = (agg[it.productId] || 0) + it.grams)),
    ),
  );
  const shopping = Object.entries(agg).map(([productId, grams]) => ({ productId, grams }));
  const perDay = days.map((d) => d.totals);
  const avg = Object.fromEntries(
    ['kcal', 'protein', 'carbs', 'fat', 'fibre'].map((k) => [
      k,
      Math.round(perDay.reduce((s, t) => s + t[k], 0) / perDay.length),
    ]),
  );
  return {
    id: `plan_${Date.now().toString(36)}`,
    title: String(raw?.title || 'Your plan').slice(0, 40),
    summary: String(raw?.summary || '').slice(0, 200),
    horizon,
    days,
    shopping,
    averageDay: avg,
    coverage: {
      kcal: Math.min(100, Math.round((avg.kcal / targets.kcal) * 100)),
      protein: Math.min(100, Math.round((avg.protein / targets.protein) * 100)),
      carbs: Math.min(100, Math.round((avg.carbs / targets.carbs) * 100)),
      fat: Math.min(100, Math.round((avg.fat / targets.fat) * 100)),
      fibre: Math.min(100, Math.round((avg.fibre / targets.fibre) * 100)),
    },
    targets,
    // One honest number: how much of the daily target this produce covers (protein weighted).
    score: Math.min(
      100,
      Math.round(
        0.4 * Math.min(100, (avg.kcal / targets.kcal) * 100) +
          0.4 * Math.min(100, (avg.protein / targets.protein) * 100) +
          0.2 *
            Math.min(
              100,
              ((avg.fibre / targets.fibre) * 100 +
                (avg.carbs / targets.carbs) * 100 +
                (avg.fat / targets.fat) * 100) /
                3,
            ),
      ),
    ),
    shoppingDays: shoppingDays.length,
    scaled,
    nonVegDays: days.filter((d) =>
      d.meals.some((m) => m.items.some((it) => NUTRITION[it.productId]?.tags.includes('non-veg'))),
    ).length,
    cautions: (Array.isArray(raw?.cautions) ? raw.cautions : [])
      .slice(0, 3)
      .map((c) => String(c).slice(0, 140)),
    createdAt: new Date().toISOString(),
  };
}

/**
 * @param {{ profile: object, request: string, horizon: 'meal'|'day'|'week'|'month', products: any[], provider?: 'groq'|'gemini', onProgress?: (stage: string) => void }} args
 */
export async function generatePlan({ profile, request, horizon, products, provider, onProgress }) {
  const targets = dailyTargets(profile);
  const say = (m) => onProgress?.(m);
  say(
    horizon === 'month'
      ? 'Writing a 10-day rotation…'
      : horizon === 'week'
        ? 'Planning seven days…'
        : 'Asking the planner…',
  );
  const cfg = aiConfig(provider);
  let usedCfg = cfg;
  const system = systemPrompt({ profile, targets, horizon, products });
  const user = `Customer request: ${request || 'Plan my meals.'}\nHorizon: ${horizon}. Return JSON only.`;
  let text;
  if (!env.useMocks && !cfg.key) {
    text = await callServer({ body: { profile, request, horizon } });
  } else if (!cfg.key) {
    throw new Error(
      `No ${cfg.provider} API key configured. Add EXPO_PUBLIC_${cfg.provider.toUpperCase()}_API_KEY to apps/customer/.env`,
    );
  } else {
    const call = (c) =>
      c.provider === 'gemini'
        ? callGemini({ model: c.model, key: c.key, system, user })
        : callGroq({ model: c.model, key: c.key, system, user });
    try {
      text = await call(cfg);
    } catch (e) {
      // One provider down or over quota: try the other if we have a key for it, so the customer still gets a plan.
      const other = aiConfig(cfg.provider === 'gemini' ? 'groq' : 'gemini');
      if (!other.key) throw e;
      say(`${cfg.provider} did not answer, trying ${other.provider}…`);
      text = await call(other);
      usedCfg = other;
    }
  }
  say('Checking every number against our table…');
  const raw = extractJSON(text);
  const plan = normalisePlan(raw, products, targets, horizon, profile);
  plan.provider = usedCfg.provider;
  plan.model = usedCfg.model;
  return plan;
}
