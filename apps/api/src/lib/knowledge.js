/**
 * Everything the product page says about a product beyond its price: what it naturally contains
 * (computed, under the FSS claims thresholds — lib/claims.js), its story, how to keep it, and a dish
 * to cook.
 *
 * TWO SOURCES, ONE RULE.
 *   • The WORDS — story, when it is best, how to keep it, a caution, a recipe — come from the
 *     operator's own edit in the admin console when there is one (the ProductKnowledge table), and
 *     from the built-in text in data/knowledge.js when there is not. An edit replaces the built-in
 *     words whole: what the operator sees in the editor is what the customer sees in the app.
 *   • The NUTRIENT STATEMENTS are never typed by anyone. They are computed from the reference row
 *     for the food, under the claims thresholds. The operator may choose which reference row a
 *     product uses, or switch the statements off — not write one.
 * Whatever the operator writes passes the same banned-wording check as the built-in text before it
 * is saved (checkKnowledgeDraft, below). A health claim cannot be typed into a product page.
 */
import { readFileSync } from 'node:fs';
import { claimsFor, lintCopy } from './claims.js';
import { KEEP, KNOWLEDGE, knowledgeKeyFor } from '../data/knowledge.js';

const COMPOSITION = JSON.parse(
  readFileSync(new URL('../data/composition.json', import.meta.url), 'utf8'),
);

/** The line that has to travel with any nutrition statement (regulation 7(1)(d),(e)). */
export const NUTRITION_FOOTNOTE =
  'Reference values for the raw edible portion; real produce varies with the harvest. Part of a varied, balanced diet. This is general information, not medical advice.';

const TABLE_ROWS = [
  ['kcal', 'Energy', 'kcal'],
  ['protein', 'Protein', 'g'],
  ['carbs', 'Carbohydrate', 'g'],
  ['fat', 'Fat', 'g'],
  ['fibre', 'Fibre', 'g'],
];

// ───────────────────────── the operator's edits ─────────────────────────

/**
 * productId → { data, updatedAt, updatedBy }. Filled from the ProductKnowledge table at boot and
 * kept in step by the admin route; read on every product page. Held here rather than in store.js so
 * this module stays the one place that knows how the two sources combine.
 * @type {Map<string, { data: any, updatedAt: string|null, updatedBy: string|null }>}
 */
const OVERRIDES = new Map();

/**
 * Whether there is somewhere durable to keep an edit. False only when a database is connected but
 * the ProductKnowledge table has not been created — then the console must refuse to save rather
 * than accept text that would be gone at the next restart.
 */
let tableReady = true;
export const setKnowledgeTableReady = (ready) => {
  tableReady = !!ready;
};
export const knowledgeTableReady = () => tableReady;

/** Replace every edit with what the database holds (boot, and each re-hydration). */
export function replaceKnowledgeOverrides(rows) {
  OVERRIDES.clear();
  for (const r of rows || []) {
    if (r?.productId && r.data && typeof r.data === 'object')
      OVERRIDES.set(r.productId, {
        data: r.data,
        updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
        updatedBy: r.updatedBy || null,
      });
  }
}
export const getKnowledgeOverride = (productId) => OVERRIDES.get(productId) || null;
export function setKnowledgeOverride(productId, data, by) {
  const row = { data, updatedAt: new Date().toISOString(), updatedBy: by || null };
  OVERRIDES.set(productId, row);
  return row;
}
export const clearKnowledgeOverride = (productId) => OVERRIDES.delete(productId);

/** Foods eaten a spoonful at a time — herbs, garlic, chillies — however a product came to use them. */
const SMALL_FOODS = new Set(
  Object.values(KNOWLEDGE)
    .filter((e) => e.small && e.food)
    .map((e) => e.food),
);

/** "ridge_gourd" → "Ridge gourd". The rows are keyed for code; an operator reads this. */
const foodLabel = (key) => {
  const t = String(key).replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Every reference row an operator may point a product at, for the picker in the admin console. */
export function referenceFoods() {
  return Object.entries(COMPOSITION.foods)
    .filter(([, f]) => f.exact)
    .map(([key, f]) => ({
      key,
      label: foodLabel(key),
      // what the figures were actually measured on, so "Spinach" is not mistaken for cooked spinach
      description: f.description || null,
      small: SMALL_FOODS.has(key),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const builtInText = (entry) =>
  entry
    ? {
        story: entry.story || null,
        best: entry.best || null,
        keep: entry.keep || KEEP[entry.kind] || null,
        careful: entry.careful || null,
        recipe: entry.recipe
          ? {
              name: entry.recipe.name,
              mins: entry.recipe.mins,
              serves: entry.recipe.serves,
              needs: [...entry.recipe.needs],
              steps: [...entry.recipe.steps],
            }
          : null,
      }
    : null;

/**
 * Everything decided about one product in one place: which built-in entry matched, the operator's
 * edit if any, the words to show, and the reference row behind the nutrient statements.
 */
function resolve(product, draft) {
  const key = knowledgeKeyFor(product);
  const entry = key ? KNOWLEDGE[key] : null;
  // A draft stands in for the saved edit, so the console can show "what the app would say" for
  // text that has not been saved yet — through this same function, not a copy of it.
  const edit = draft ? { data: draft } : product?.id ? OVERRIDES.get(product.id) || null : null;
  const data = edit?.data || null;

  // 'auto' (or nothing saved) follows the built-in match; 'off' makes no statements; anything else
  // names a reference row — ignored unless it is one we actually hold.
  const choice = data?.nutrition || 'auto';
  const foodKey =
    choice === 'off'
      ? null
      : choice === 'auto'
        ? entry?.food || null
        : COMPOSITION.foods[choice]
          ? choice
          : null;
  const food = foodKey ? COMPOSITION.foods[foodKey] || null : null;
  const small = choice === 'auto' ? !!entry?.small : SMALL_FOODS.has(foodKey);

  return { key, entry, edit, text: data || builtInText(entry), foodKey, food, small };
}

/** The composition row for a product, if we hold a trustworthy one. */
export function compositionFor(product) {
  return resolve(product).food;
}

/** Claims for a food — none at all for things eaten a spoonful at a time (see `small`). */
const claimsOf = (r) => (r.small || !r.food ? [] : claimsFor(r.food));

/**
 * Two short badges for a catalog tile or the seasonal rail ("Naturally high in vitamin C").
 * Cheap enough to ship with every product in the list.
 * @returns {string[]}
 */
export function badgesFor(product) {
  return claimsOf(resolve(product))
    .filter((c) => c.level !== 'low')
    .slice(0, 2)
    .map((c) => c.text);
}

/**
 * The full knowledge card for one product, or null when we have nothing to say about it yet.
 * @param {{ id?: string, name?: string, aliases?: string[], isSeasonal?: boolean, farm?: string|null }} product
 * @param {object} [draft] an unsaved edit to preview instead of the saved one (admin console only)
 */
export function knowledgeFor(product, draft) {
  const r = resolve(product, draft);
  if (!r.entry && !r.edit) return null;
  const { food, text } = r;
  const claims = claimsOf(r);

  // A plain nutrition table is information, not a claim (regulation 5(2)); shown only from an exact row.
  const table =
    food && food.exact
      ? TABLE_ROWS.filter(([f]) => food.per100g[f] != null).map(([f, label, unit]) => ({
          label,
          value: `${Math.round(food.per100g[f] * 10) / 10} ${unit}`,
        }))
      : [];

  const recipe = text?.recipe?.name
    ? {
        name: text.recipe.name,
        mins: text.recipe.mins ?? null,
        serves: text.recipe.serves ?? null,
        needs: text.recipe.needs || [],
        steps: text.recipe.steps || [],
      }
    : null;
  const card = {
    key: r.key || `product:${product.id}`,
    goodToKnow: claims.map((c) => ({
      text: c.text,
      level: c.level,
      amount: c.amount,
      pctDaily: c.pctRda, // % of the adult daily requirement in 100 g
      role: c.role,
    })),
    nutrition: table.length
      ? { per: '100 g, raw edible portion', rows: table, source: COMPOSITION.source }
      : null,
    footnote: claims.length || table.length ? NUTRITION_FOOTNOTE : null,
    story: text?.story || null,
    best: text?.best || null,
    keep: text?.keep || null,
    careful: text?.careful || null,
    recipe,
  };
  // An edit that blanks everything, on a product with no reference row, leaves nothing to show.
  const empty =
    !card.goodToKnow.length &&
    !card.nutrition &&
    !card.story &&
    !card.best &&
    !card.keep &&
    !card.careful &&
    !card.recipe;
  return empty ? null : card;
}

// ───────────────────────── what the admin console needs ─────────────────────────

/** The built-in words for a product — what "reset" goes back to. Null when we wrote none. */
export function builtInKnowledgeFor(product) {
  const key = knowledgeKeyFor(product);
  return key ? builtInText(KNOWLEDGE[key]) : null;
}

/** The reference row a product would use if left on "auto", for the editor's picker. */
export function autoReferenceFor(product) {
  const key = knowledgeKeyFor(product);
  const foodKey = key ? KNOWLEDGE[key].food || null : null;
  const food = foodKey ? COMPOSITION.foods[foodKey] : null;
  return food ? { key: foodKey, label: foodLabel(foodKey), exact: !!food.exact } : null;
}

const clean = (v) => {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return t || null;
};
const cleanList = (v) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);

/**
 * Tidy what the editor sent into the shape that is stored: trimmed, empty strings to null, empty
 * list rows dropped, a recipe with no name and no content dropped altogether.
 */
export function normaliseKnowledgeDraft(draft) {
  const d = draft || {};
  const rc = d.recipe || {};
  const needs = cleanList(rc.needs);
  const steps = cleanList(rc.steps);
  const name = clean(rc.name);
  const recipe =
    name || needs.length || steps.length
      ? {
          name,
          mins:
            Number.isFinite(Number(rc.mins)) && Number(rc.mins) > 0 ? Math.round(rc.mins) : null,
          serves:
            Number.isFinite(Number(rc.serves)) && Number(rc.serves) > 0
              ? Math.round(rc.serves)
              : null,
          needs,
          steps,
        }
      : null;
  return {
    story: clean(d.story),
    best: clean(d.best),
    keep: clean(d.keep),
    careful: clean(d.careful),
    recipe,
    nutrition: typeof d.nutrition === 'string' && d.nutrition ? d.nutrition : 'auto',
  };
}

const FIELD_LABEL = {
  story: 'Its story',
  best: 'At its best',
  keep: 'How to keep it',
  careful: 'Worth knowing',
  'recipe.name': 'Recipe name',
};

/**
 * Everything wrong with a (normalised) draft, in words an operator can act on. Empty = save it.
 *
 * Two kinds of problem: a recipe that is half-written, and wording the food rules do not allow on
 * a product page. The second is the same check the built-in text has to pass — an operator cannot
 * type "boosts immunity" into the app any more than a developer can commit it.
 *
 * @returns {{ field: string, label: string, message: string, match?: string }[]}
 */
export function checkKnowledgeDraft(data) {
  const problems = [];
  const say = (field, label, message, match) =>
    problems.push({ field, label, message, ...(match ? { match } : {}) });

  if (data.nutrition !== 'auto' && data.nutrition !== 'off' && !COMPOSITION.foods[data.nutrition])
    say('nutrition', 'Nutrition figures', 'That reference food is not one we hold figures for.');
  else if (
    data.nutrition !== 'auto' &&
    data.nutrition !== 'off' &&
    !COMPOSITION.foods[data.nutrition].exact
  )
    say(
      'nutrition',
      'Nutrition figures',
      'The figures we hold for that food are not an exact match, so no statements can be made from them.',
    );

  if (data.recipe) {
    if (!data.recipe.name) say('recipe.name', 'Recipe name', 'Give the recipe a name.');
    if (!data.recipe.steps.length)
      say('recipe.steps', 'Recipe steps', 'Add at least one step, or clear the recipe.');
  }

  /** @type {[string, string, string|null][]} */
  const strings = [
    ['story', FIELD_LABEL.story, data.story],
    ['best', FIELD_LABEL.best, data.best],
    ['keep', FIELD_LABEL.keep, data.keep],
    ['careful', FIELD_LABEL.careful, data.careful],
    ['recipe.name', FIELD_LABEL['recipe.name'], data.recipe?.name || null],
    ...(data.recipe?.needs || []).map(
      (t, i) =>
        /** @type {[string, string, string]} */ ([`recipe.needs.${i}`, `Ingredient ${i + 1}`, t]),
    ),
    ...(data.recipe?.steps || []).map(
      (t, i) => /** @type {[string, string, string]} */ ([`recipe.steps.${i}`, `Step ${i + 1}`, t]),
    ),
  ];
  for (const [field, label, text] of strings) {
    if (!text) continue;
    for (const hit of lintCopy(text)) {
      // The rule is recorded as "reg 10(1): no treatment or cure language"; the operator needs
      // the second half.
      const why = hit.rule.replace(/^[^:]*:\s*/, '');
      say(field, label, `“${hit.match}” cannot be used on a product page — ${why}.`, hit.match);
    }
  }
  return problems;
}

/** Every string a knowledge card can show, for the lint in the test suite and the admin report. */
export function knowledgeStrings(key) {
  const e = KNOWLEDGE[key];
  if (!e) return [];
  return [
    e.story,
    e.best,
    e.keep,
    e.careful,
    e.recipe?.name,
    ...(e.recipe?.needs || []),
    ...(e.recipe?.steps || []),
  ].filter(Boolean);
}

export const KNOWLEDGE_SOURCE = COMPOSITION.source;
