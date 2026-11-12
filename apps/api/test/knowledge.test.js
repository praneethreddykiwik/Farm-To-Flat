import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BANNED, MARGIN, RDA, SCHEDULE_I, claimsFor, lintCopy } from '../src/lib/claims.js';
import { KEEP, KNOWLEDGE, knowledgeKeyFor } from '../src/data/knowledge.js';
import {
  badgesFor,
  knowledgeFor,
  knowledgeStrings,
  NUTRITION_FOOTNOTE,
} from '../src/lib/knowledge.js';
import { PRODUCTS } from '../src/data/seed.js';

const COMPOSITION = JSON.parse(
  readFileSync(new URL('../src/data/composition.json', import.meta.url), 'utf8'),
);
const food = (per100g, exact = true) => ({ exact, per100g });

describe('claims engine — FSS (Advertising & Claims) Regulations 2018, Schedule I', () => {
  it('uses the Schedule I thresholds', () => {
    expect(SCHEDULE_I.vitaminOrMineral).toEqual({ source: 0.15, high: 0.3 });
    expect(SCHEDULE_I.protein).toEqual({ source: 0.1, high: 0.2 });
    expect(SCHEDULE_I.fibre).toEqual({ source: 3, high: 6 });
    expect(SCHEDULE_I.lowEnergyKcal).toBe(40);
  });

  it('says nothing below 15% of the RDA per 100 g', () => {
    // 10 mg vitamin C = 12.5% of 80 mg
    expect(claimsFor(food({ vitaminC: 10 }))).toEqual([]);
  });

  it('needs the safety margin, not just the bare threshold', () => {
    const bare = RDA.vitaminC.value * SCHEDULE_I.vitaminOrMineral.source; // exactly 15%
    expect(claimsFor(food({ vitaminC: bare }))).toEqual([]);
    expect(claimsFor(food({ vitaminC: bare * MARGIN }))[0]).toMatchObject({
      key: 'vitaminC',
      level: 'source',
    });
  });

  it('"source" from 15% and "high" from 30%, worded "naturally" (regulation 9(1))', () => {
    const source = claimsFor(food({ folate: 300 * 0.2 }))[0];
    expect(source.text).toBe('A natural source of folate');
    const high = claimsFor(food({ folate: 300 * 0.4 }))[0];
    expect(high.text).toBe('Naturally high in folate');
  });

  it('carries the quantity per 100 g with every statement (regulation 7(1)(c))', () => {
    const [c] = claimsFor(food({ vitaminC: 228.3 }));
    expect(c.amount).toBe('228 mg per 100 g');
    expect(c.pctRda).toBe(285);
  });

  it('protein uses 10% / 20% of the RDA', () => {
    expect(claimsFor(food({ protein: 5 }))).toEqual([]); // 9%
    expect(claimsFor(food({ protein: 8 }))[0]).toMatchObject({ key: 'protein', level: 'source' });
    expect(claimsFor(food({ protein: 21 }))[0]).toMatchObject({ key: 'protein', level: 'high' });
  });

  it('fibre uses absolute grams', () => {
    expect(claimsFor(food({ fibre: 3.2 }))).toEqual([]); // above 3 g but inside the margin
    expect(claimsFor(food({ fibre: 4 }))[0]).toMatchObject({ key: 'fibre', level: 'source' });
    expect(claimsFor(food({ fibre: 8 }))[0]).toMatchObject({ key: 'fibre', level: 'high' });
  });

  it('"low in calories" only when comfortably under 40 kcal', () => {
    expect(claimsFor(food({ kcal: 38 }))).toEqual([]);
    expect(claimsFor(food({ kcal: 23 }))[0]).toMatchObject({ key: 'energy', level: 'low' });
  });

  it('never claims from a nearest-relative (inexact) composition row, or from none', () => {
    expect(claimsFor(food({ vitaminC: 500 }, false))).toEqual([]);
    expect(claimsFor(null)).toEqual([]);
    expect(claimsFor(undefined)).toEqual([]);
  });

  it('makes no claim about a nutrient whose RDA is not in the verified table', () => {
    expect(RDA.vitaminB12).toBeUndefined();
    expect(claimsFor(food({ vitaminB12: 50 }))).toEqual([]);
  });

  it('orders high before source before low', () => {
    const levels = claimsFor(food({ kcal: 20, vitaminC: 100, folate: 60 })).map((c) => c.level);
    expect(levels).toEqual(['high', 'source', 'low']);
  });

  it('drops the nutrient-role sentence when function claims are switched off', () => {
    process.env.KNOWLEDGE_FUNCTION_CLAIMS = '0';
    expect(claimsFor(food({ vitaminC: 100 }))[0].role).toBeNull();
    delete process.env.KNOWLEDGE_FUNCTION_CLAIMS;
    expect(claimsFor(food({ vitaminC: 100 }))[0].role).toMatch(/Vitamin C/);
  });
});

describe('copy lint — what we may not write about a food', () => {
  it.each([
    ['Gongura cures a cold', 'reg 10(1)'],
    ['Helps prevent heart trouble', 'reg 10(1)'],
    ['Good for diabetics', 'reg 10(1)'],
    ['Boosts your immunity', 'reg 7 & 10'],
    ['A real superfood', 'reg 7 & 10'],
    ['Recommended by nutritionists', 'reg 10(2)'],
    ['A healthy choice for the family', 'reg 8(3)'],
    ['Chemical-free, unlike the market', 'reg 10(5)/(7)'],
    ['Never waxed', 'reg 10(5)/(7)'],
    ['100% pure and organic', 'Schedule V'],
    ['A traditional home-made pickle', 'Schedule V'],
    ['Always fresh, guaranteed', 'no absolute'],
  ])('rejects %j', (text, rule) => {
    const hits = lintCopy(text);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.rule).join(' | ')).toContain(rule);
  });

  it.each([
    'Pressure-cook the dal with turmeric until soft.',
    'Lower the heat and simmer for ten minutes.',
    'Reduce the heat once the oil rises.',
    'Wrap loosely in a cotton cloth and refrigerate.',
    'Harvested after you order and delivered the next morning.',
    'Fresh coriander goes on at the very end.',
  ])('accepts %j', (text) => {
    expect(lintCopy(text)).toEqual([]);
  });

  it('every rule names the regulation it protects', () => {
    for (const [, rule] of BANNED) expect(rule.length).toBeGreaterThan(8);
  });
});

describe('product knowledge content', () => {
  it('every sentence we publish passes the lint', () => {
    const bad = [];
    for (const key of Object.keys(KNOWLEDGE))
      for (const s of knowledgeStrings(key))
        for (const h of lintCopy(s)) bad.push(`${key}: "${h.match}" — ${h.rule}`);
    for (const s of [...Object.values(KEEP), NUTRITION_FOOTNOTE])
      for (const h of lintCopy(s)) bad.push(`"${h.match}" — ${h.rule}`);
    expect(bad).toEqual([]);
  });

  it('every entry has a story and a complete recipe', () => {
    for (const [key, e] of Object.entries(KNOWLEDGE)) {
      expect(e.story?.length, key).toBeGreaterThan(40);
      expect(e.recipe?.name, key).toBeTruthy();
      expect(e.recipe.mins, key).toBeGreaterThan(0);
      expect(e.recipe.needs.length, key).toBeGreaterThanOrEqual(2);
      expect(e.recipe.steps.length, key).toBeGreaterThanOrEqual(2);
      expect(KEEP[e.kind] || e.keep, key).toBeTruthy();
    }
  });

  it('every composition reference points at a real row', () => {
    for (const [key, e] of Object.entries(KNOWLEDGE))
      if (e.food) expect(COMPOSITION.foods[e.food], key).toBeTruthy();
  });

  it('covers every product in the seed catalog', () => {
    const missing = PRODUCTS.filter((p) => !knowledgeKeyFor(p)).map((p) => p.id);
    expect(missing).toEqual([]);
  });

  it('matches console-created products by name, most specific first', () => {
    const k = (name, aliases = []) => knowledgeKeyFor({ id: 'p_AbC123', name, aliases });
    expect(k('Drumstick Leaves')).toBe('drumstick_leaves');
    expect(k('Drumstick')).toBe('drumstick');
    expect(k('Mutton Keema', ['keema', 'qeema'])).toBe('keema');
    expect(k('Mutton paya', ['paya', 'trotters'])).toBe('paya');
    expect(k('Mutton curry cut')).toBe('mutton');
    expect(k('Rohu Fish', ['chepalu'])).toBe('rohu');
    expect(k('Raw banana')).toBe('raw_banana');
    expect(k('Banana')).toBe('banana');
    expect(k('Green Peas')).toBe('green_peas');
    expect(k('Something we have never heard of')).toBeNull();
  });

  it('makes no nutrition statement for herbs and aromatics eaten a spoonful at a time', () => {
    for (const id of [
      'p_coriander',
      'p_mint',
      'p_garlic',
      'p_ginger',
      'p_chilli',
      'p_lemon',
      'p_curry',
    ]) {
      const k = knowledgeFor({ id });
      expect(k.goodToKnow, id).toEqual([]);
      expect(badgesFor({ id }), id).toEqual([]);
    }
  });

  it('makes no nutrition statement where we hold no exact composition data', () => {
    for (const id of ['p_gongura', 'p_ponnaganti', 'p_menthi', 'p_ridge', 'p_broadbean']) {
      const k = knowledgeFor({ id });
      expect(k.goodToKnow, id).toEqual([]);
      expect(k.nutrition, id).toBeNull();
      expect(k.story, id).toBeTruthy();
      expect(k.recipe, id).toBeTruthy();
    }
  });

  it('guava: high in vitamin C, with the amount, the role and the footnote', () => {
    const k = knowledgeFor({ id: 'p_guava' });
    expect(k.goodToKnow[0]).toMatchObject({
      text: 'Naturally high in vitamin C',
      amount: '228 mg per 100 g',
      pctDaily: 285,
    });
    expect(k.goodToKnow[0].role).toMatch(/Vitamin C/);
    expect(k.nutrition.rows[0]).toEqual({ label: 'Energy', value: '68 kcal' });
    expect(k.nutrition.source).toMatch(/USDA/);
    expect(k.footnote).toBe(NUTRITION_FOOTNOTE);
    expect(badgesFor({ id: 'p_guava' })).toEqual([
      'Naturally high in vitamin C',
      'A natural source of fibre',
    ]);
  });

  it('unknown product → null card, no badges', () => {
    expect(knowledgeFor({ id: 'p_zzz', name: 'Mystery' })).toBeNull();
    expect(badgesFor({ id: 'p_zzz', name: 'Mystery' })).toEqual([]);
  });
});
