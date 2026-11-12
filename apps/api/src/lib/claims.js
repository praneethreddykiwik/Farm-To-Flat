/**
 * Nutrition statements a product page is allowed to make — computed, never typed.
 *
 * In India every "source of", "high in", "contains", "rich in" or "low" statement about a food is a
 * NUTRIENT CONTENT CLAIM under the FSS (Advertising and Claims) Regulations, 2018, and may only be
 * made when the food meets the condition in Schedule I of those regulations. "Contains" and
 * "provides" are listed in Schedule II as synonyms of "source", so even a chip that just says "Iron"
 * under a heading like "contains" is a claim. This module is the one place those conditions live:
 *
 *   regulation 5(3) + Schedule I   thresholds below (SCHEDULE_I)
 *   regulation 9(1)                a food that is high/low by nature says "naturally …"
 *   regulation 7(1)(a)–(c)         a health (function) statement needs: the nutrient's role, the food
 *                                  being at least a "source" of it, and the amount per 100 g
 *   regulation 8(3)                never call a food "healthy" in itself
 *   regulation 10                  no cure/prevent/treat, no "recommended by doctors", no fear, no
 *                                  running down other food  → lintCopy() below
 *
 * A statement is only produced from a composition row marked `exact`, and only when the value clears
 * the threshold by MARGIN — real produce varies harvest to harvest, and a claim that is true of the
 * reference table but not of tonight's bunch is still a false claim.
 */

/**
 * Recommended Dietary Allowances for adults, ICMR-NIN "Nutrient Requirements for Indians" (2020),
 * https://www.nin.res.in/rdabook/brief_note.pdf — regulation 2(n) makes the current ICMR values the
 * RDA for claims. Schedule I does not say which row to use, so where men and women differ the
 * HIGHER value is taken: a "source of" statement is then true for every adult reading it.
 * Potassium is the adequate intake. A nutrient whose RDA we have not verified against the published
 * table (vitamin B12, B6, K …) is deliberately absent: no verified denominator, no claim.
 * Change these only against the published tables — every percentage the app shows derives from them.
 */
export const RDA = {
  protein: { value: 54, unit: 'g', label: 'protein' },
  calcium: { value: 1000, unit: 'mg', label: 'calcium' },
  iron: { value: 29, unit: 'mg', label: 'iron' },
  magnesium: { value: 440, unit: 'mg', label: 'magnesium' },
  zinc: { value: 17, unit: 'mg', label: 'zinc' },
  vitaminA: { value: 1000, unit: 'µg', label: 'vitamin A' },
  vitaminC: { value: 80, unit: 'mg', label: 'vitamin C' },
  folate: { value: 300, unit: 'µg', label: 'folate' },
  potassium: { value: 3510, unit: 'mg', label: 'potassium' },
};

/** Schedule I, for solids, per 100 g. Fractions are of the RDA. */
export const SCHEDULE_I = {
  vitaminOrMineral: { source: 0.15, high: 0.3 },
  protein: { source: 0.1, high: 0.2 },
  fibre: { source: 3, high: 6 }, // grams per 100 g
  lowEnergyKcal: 40,
  lowFatG: 3,
};

/** A value must clear its threshold by this factor before the app says anything. */
export const MARGIN = 1.2;

/**
 * The role of each nutrient, in plain words — the first half of a regulation 7 health statement.
 * These are textbook physiology, not product benefits: nothing here says the vegetable does
 * anything, only what the nutrient is for. They are our own wording under regulation 7(2); the
 * Schedule IV sentences ("Iron fights anaemia", "Zinc supports a healthy immune system") are
 * reserved for FORTIFIED foods and must not be copied onto fresh produce.
 * Have a qualified nutrition professional sign these off; until then, or at any time, they can be
 * switched off without a code change by setting KNOWLEDGE_FUNCTION_CLAIMS=0.
 */
export const FUNCTION = {
  protein: 'Protein is what the body uses to build and maintain muscle.',
  calcium: 'Calcium is needed for normal bones and teeth.',
  iron: 'Iron is needed to make haemoglobin, which carries oxygen in the blood.',
  magnesium: 'Magnesium is needed for normal muscle and nerve function.',
  zinc: 'Zinc is needed for the normal function of the immune system.',
  vitaminA: 'Vitamin A is needed for normal vision.',
  vitaminC: 'Vitamin C helps the body absorb iron from plant foods.',
  folate: 'Folate is needed for normal blood formation.',
  potassium: 'Potassium is needed for normal muscle function.',
};

const functionClaimsOn = () => process.env.KNOWLEDGE_FUNCTION_CLAIMS !== '0';
const round = (n) =>
  n >= 100 ? Math.round(n) : n >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100;

/**
 * @param {{ exact?: boolean, per100g?: Record<string, number|null> } | null | undefined} food a row of data/composition.json
 * @returns {{ key:string, level:'high'|'source'|'low', text:string, amount:string|null, pctRda:number|null, role:string|null }[]}
 *          strongest first; empty when there is no exact, sourced composition
 */
export function claimsFor(food) {
  if (!food || food.exact !== true || !food.per100g) return [];
  const v = food.per100g;
  /** @type {ReturnType<typeof claimsFor>} */
  const out = [];

  for (const [key, rda] of Object.entries(RDA)) {
    const amount = v[key];
    if (amount == null || !(amount > 0)) continue;
    const rule = key === 'protein' ? SCHEDULE_I.protein : SCHEDULE_I.vitaminOrMineral;
    const frac = amount / rda.value;
    const level =
      frac >= rule.high * MARGIN ? 'high' : frac >= rule.source * MARGIN ? 'source' : null;
    if (!level) continue;
    out.push({
      key,
      level,
      // regulation 9(1): naturally high / a natural source
      text:
        level === 'high' ? `Naturally high in ${rda.label}` : `A natural source of ${rda.label}`,
      // regulation 7(1)(c): the quantity, per 100 g
      amount: `${round(amount)} ${rda.unit} per 100 g`,
      pctRda: Math.round(frac * 100),
      role: functionClaimsOn() ? FUNCTION[key] || null : null,
    });
  }

  if (v.fibre != null) {
    const level =
      v.fibre >= SCHEDULE_I.fibre.high * MARGIN
        ? 'high'
        : v.fibre >= SCHEDULE_I.fibre.source * MARGIN
          ? 'source'
          : null;
    if (level)
      out.push({
        key: 'fibre',
        level,
        text: level === 'high' ? 'Naturally high in fibre' : 'A natural source of fibre',
        amount: `${round(v.fibre)} g per 100 g`,
        pctRda: null,
        role: null,
      });
  }

  // "Low" statements run the other way: the value must sit BELOW the limit by the same margin.
  if (v.kcal != null && v.kcal <= SCHEDULE_I.lowEnergyKcal / MARGIN)
    out.push({
      key: 'energy',
      level: 'low',
      text: 'Naturally low in calories',
      amount: `${round(v.kcal)} kcal per 100 g`,
      pctRda: null,
      role: null,
    });

  const rank = { high: 0, source: 1, low: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || (b.pctRda || 0) - (a.pctRda || 0));
}

/**
 * Words and phrases that must not appear in anything we write about a food. Each entry names the
 * rule it protects, so a failing lint explains itself. Deliberately strict: this checks OUR copy
 * (stories, tips, recipes, anything an operator types into the console), where a blunt rule that
 * occasionally rejects an innocent sentence is far cheaper than one unlawful claim on a product page.
 * @type {[RegExp, string][]}
 */
export const BANNED = [
  // regulation 10(1) — prevention, alleviation, treatment or cure of a disease or condition
  [
    /\b(cure[sd]?|curing|heal(s|ed|ing)?|remed(y|ies)|medicin(e|al)|therap(y|eutic)|treat(s|ed|ing|ment)?)\b/i,
    'reg 10(1): no treatment or cure language',
  ],
  [
    /\b(prevent(s|ed|ing|ion)?|fight(s|ing)?|protect(s|ed|ing)? against|reduce(s|d)? the risk|lower(s|ed|ing)? (your |the )?(risk|blood|cholesterol|sugar))\b/i,
    'reg 10(1): no disease-prevention or risk-reduction language',
  ],
  [
    /\b(diabet\w*|blood sugar|blood pressure|hypertension|cholesterol|heart disease|cancer|an[a]?emi\w*|arthritis|thyroid|pcos|pcod|kidney stone\w*|obesity|constipation|infection\w*)\b/i,
    'reg 10(1): no naming of diseases or conditions',
  ],
  [
    /\b(detox\w*|cleans(e|es|ing)|immunity|immune[- ]boost\w*|boost(s|ed|ing)?|superfood\w*|miracle|anti[- ]?(oxidant|ageing|aging|inflammatory|cancer)\w*|weight[- ]loss|fat[- ]burn\w*|slimming)\b/i,
    'reg 7 & 10: unsubstantiated health-benefit language',
  ],
  // regulation 10(2) — recommended or approved by professionals
  [
    /\b(doctor\w*|physician\w*|dietiti?an\w*|nutritionist\w*|clinical\w*|prescri\w*|recommended by)\b/i,
    'reg 10(2): no professional endorsement',
  ],
  // regulation 8(3) — a food is not "healthy" in itself
  [
    /\b(health(y|ier|iest|ful)|wholesome|good for you|nutritious)\b/i,
    'reg 8(3): a food may not be described as healthy in itself',
  ],
  // regulation 10(5), 10(7) — fear, and running down other food
  [
    /\b(chemical[- ]free|pesticide[- ]free|residue[- ]free|toxin\w*|poison\w*|adulterat\w*|unlike (the )?(market|shop|supermarket|others?)|safer than|better than|never waxed|not waxed)\b/i,
    'reg 10(5)/(7): no fear, no disparaging other food',
  ],
  // Schedule V — restricted adjectives
  [
    /\b(natural goodness|naturally better|nature'?s way|100 ?% (natural|pure|safe)|pure|organic|authentic|genuine|traditional|original|home[- ]?made|home[- ]cooked)\b/i,
    'Schedule V: restricted word (needs proof we cannot give on a product page)',
  ],
  // absolute promises
  [
    /\b(guarantee\w*|always fresh|freshest|best in|number one|no\.? ?1)\b/i,
    'no absolute or superlative promises',
  ],
];

/**
 * @param {string} text
 * @returns {{ match: string, rule: string }[]} empty when the text is clean
 */
export function lintCopy(text) {
  const hits = [];
  for (const [re, rule] of BANNED) {
    const m = String(text || '').match(re);
    if (m) hits.push({ match: m[0], rule });
  }
  return hits;
}
