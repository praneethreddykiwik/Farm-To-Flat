/**
 * Nutrition reference for every catalog product, per 100 g EDIBLE portion, raw.
 * Values are rounded from USDA FoodData Central (SR Legacy / FNDDS) and the Indian Food
 * Composition Tables (IFCT 2017, NIN Hyderabad). They are reference averages, not lab values for
 * a specific harvest: real produce varies ±10–15%. The app computes every calorie and protein
 * figure from THIS table, never from the language model, so the numbers shown are traceable.
 *
 * gramsPerUnit: typical weight of one sale unit (as sold), used to convert plan grams into
 * order quantities. edibleFraction: portion left after peeling/trimming (IFCT convention).
 */

export const NUTRITION_SOURCE = 'USDA FoodData Central & IFCT 2017 (NIN), rounded reference values';

/** @type {Record<string, {kcal:number, protein:number, carbs:number, fat:number, fibre:number, gramsPerUnit:number, edibleFraction:number, tags:string[]}>} */
export const NUTRITION = {
  // leafy greens (per 100 g raw leaves)
  p_palak: {
    kcal: 23,
    protein: 2.9,
    carbs: 3.6,
    fat: 0.4,
    fibre: 2.2,
    gramsPerUnit: 250,
    edibleFraction: 0.8,
    tags: ['leafy', 'iron', 'low-cal', 'veg'],
  },
  p_menthi: {
    kcal: 49,
    protein: 4.4,
    carbs: 6.0,
    fat: 0.9,
    fibre: 1.1,
    gramsPerUnit: 200,
    edibleFraction: 0.7,
    tags: ['leafy', 'veg', 'diabetic-friendly'],
  },
  p_thota: {
    kcal: 23,
    protein: 2.5,
    carbs: 4.0,
    fat: 0.3,
    fibre: 2.2,
    gramsPerUnit: 250,
    edibleFraction: 0.75,
    tags: ['leafy', 'veg', 'calcium'],
  },
  p_gongura: {
    kcal: 43,
    protein: 3.3,
    carbs: 8.0,
    fat: 0.6,
    fibre: 2.4,
    gramsPerUnit: 250,
    edibleFraction: 0.7,
    tags: ['leafy', 'veg', 'vitamin-c'],
  },
  p_coriander: {
    kcal: 23,
    protein: 2.1,
    carbs: 3.7,
    fat: 0.5,
    fibre: 2.8,
    gramsPerUnit: 100,
    edibleFraction: 0.8,
    tags: ['herb', 'veg'],
  },
  p_mint: {
    kcal: 44,
    protein: 3.3,
    carbs: 8.4,
    fat: 0.7,
    fibre: 6.8,
    gramsPerUnit: 100,
    edibleFraction: 0.7,
    tags: ['herb', 'veg'],
  },
  p_curry: {
    kcal: 108,
    protein: 6.1,
    carbs: 18.7,
    fat: 1.0,
    fibre: 6.4,
    gramsPerUnit: 50,
    edibleFraction: 0.9,
    tags: ['herb', 'veg'],
  },
  p_spring: {
    kcal: 32,
    protein: 1.8,
    carbs: 7.3,
    fat: 0.2,
    fibre: 2.6,
    gramsPerUnit: 150,
    edibleFraction: 0.9,
    tags: ['veg'],
  },
  p_ginger: {
    kcal: 80,
    protein: 1.8,
    carbs: 17.8,
    fat: 0.8,
    fibre: 2.0,
    gramsPerUnit: 1000,
    edibleFraction: 0.9,
    tags: ['aromatic', 'veg'],
  },
  p_garlic: {
    kcal: 149,
    protein: 6.4,
    carbs: 33.1,
    fat: 0.5,
    fibre: 2.1,
    gramsPerUnit: 1000,
    edibleFraction: 0.85,
    tags: ['aromatic', 'veg'],
  },
  p_chilli: {
    kcal: 40,
    protein: 2.0,
    carbs: 9.5,
    fat: 0.2,
    fibre: 1.5,
    gramsPerUnit: 1000,
    edibleFraction: 0.95,
    tags: ['aromatic', 'veg'],
  },
  p_lemon: {
    kcal: 29,
    protein: 1.1,
    carbs: 9.3,
    fat: 0.3,
    fibre: 2.8,
    gramsPerUnit: 60,
    edibleFraction: 0.45,
    tags: ['citrus', 'vitamin-c', 'veg'],
  },
  // vegetables
  p_tomato: {
    kcal: 18,
    protein: 0.9,
    carbs: 3.9,
    fat: 0.2,
    fibre: 1.2,
    gramsPerUnit: 1000,
    edibleFraction: 0.95,
    tags: ['veg', 'low-cal', 'salad'],
  },
  p_onion: {
    kcal: 40,
    protein: 1.1,
    carbs: 9.3,
    fat: 0.1,
    fibre: 1.7,
    gramsPerUnit: 1000,
    edibleFraction: 0.9,
    tags: ['veg', 'salad'],
  },
  p_potato: {
    kcal: 77,
    protein: 2.0,
    carbs: 17.5,
    fat: 0.1,
    fibre: 2.2,
    gramsPerUnit: 1000,
    edibleFraction: 0.85,
    tags: ['veg', 'starch'],
  },
  p_brinjal: {
    kcal: 25,
    protein: 1.0,
    carbs: 5.9,
    fat: 0.2,
    fibre: 3.0,
    gramsPerUnit: 1000,
    edibleFraction: 0.9,
    tags: ['veg', 'low-cal'],
  },
  p_okra: {
    kcal: 33,
    protein: 1.9,
    carbs: 7.5,
    fat: 0.2,
    fibre: 3.2,
    gramsPerUnit: 1000,
    edibleFraction: 0.9,
    tags: ['veg', 'fibre'],
  },
  p_carrot: {
    kcal: 41,
    protein: 0.9,
    carbs: 9.6,
    fat: 0.2,
    fibre: 2.8,
    gramsPerUnit: 1000,
    edibleFraction: 0.9,
    tags: ['veg', 'salad', 'vitamin-a'],
  },
  p_beet: {
    kcal: 43,
    protein: 1.6,
    carbs: 9.6,
    fat: 0.2,
    fibre: 2.8,
    gramsPerUnit: 1000,
    edibleFraction: 0.85,
    tags: ['veg', 'salad'],
  },
  p_cabbage: {
    kcal: 25,
    protein: 1.3,
    carbs: 5.8,
    fat: 0.1,
    fibre: 2.5,
    gramsPerUnit: 800,
    edibleFraction: 0.85,
    tags: ['veg', 'low-cal', 'salad'],
  },
  p_cauli: {
    kcal: 25,
    protein: 1.9,
    carbs: 5.0,
    fat: 0.3,
    fibre: 2.0,
    gramsPerUnit: 600,
    edibleFraction: 0.6,
    tags: ['veg', 'low-cal'],
  },
  p_capsicum: {
    kcal: 20,
    protein: 0.9,
    carbs: 4.6,
    fat: 0.2,
    fibre: 1.7,
    gramsPerUnit: 1000,
    edibleFraction: 0.85,
    tags: ['veg', 'salad', 'vitamin-c'],
  },
  p_corn: {
    kcal: 86,
    protein: 3.3,
    carbs: 18.7,
    fat: 1.4,
    fibre: 2.0,
    gramsPerUnit: 250,
    edibleFraction: 0.6,
    tags: ['veg', 'starch'],
  },
  p_radish: {
    kcal: 16,
    protein: 0.7,
    carbs: 3.4,
    fat: 0.1,
    fibre: 1.6,
    gramsPerUnit: 1000,
    edibleFraction: 0.9,
    tags: ['veg', 'low-cal', 'salad'],
  },
  p_cucumber: {
    kcal: 15,
    protein: 0.7,
    carbs: 3.6,
    fat: 0.1,
    fibre: 0.5,
    gramsPerUnit: 1000,
    edibleFraction: 0.95,
    tags: ['veg', 'low-cal', 'salad', 'hydrating'],
  },
  p_pumpkin: {
    kcal: 26,
    protein: 1.0,
    carbs: 6.5,
    fat: 0.1,
    fibre: 0.5,
    gramsPerUnit: 1000,
    edibleFraction: 0.75,
    tags: ['veg', 'low-cal'],
  },
  p_drumstick: {
    kcal: 37,
    protein: 2.1,
    carbs: 8.5,
    fat: 0.2,
    fibre: 3.2,
    gramsPerUnit: 1000,
    edibleFraction: 0.5,
    tags: ['veg'],
  },
  p_rawbanana: {
    kcal: 122,
    protein: 1.3,
    carbs: 31.9,
    fat: 0.4,
    fibre: 2.3,
    gramsPerUnit: 150,
    edibleFraction: 0.65,
    tags: ['veg', 'starch'],
  },
  // gourds & beans
  p_karela: {
    kcal: 17,
    protein: 1.0,
    carbs: 3.7,
    fat: 0.2,
    fibre: 2.8,
    gramsPerUnit: 1000,
    edibleFraction: 0.9,
    tags: ['veg', 'low-cal', 'diabetic-friendly'],
  },
  p_bottle: {
    kcal: 14,
    protein: 0.6,
    carbs: 3.4,
    fat: 0.0,
    fibre: 0.5,
    gramsPerUnit: 800,
    edibleFraction: 0.85,
    tags: ['veg', 'low-cal', 'hydrating'],
  },
  p_ridge: {
    kcal: 20,
    protein: 1.2,
    carbs: 4.4,
    fat: 0.2,
    fibre: 1.1,
    gramsPerUnit: 1000,
    edibleFraction: 0.8,
    tags: ['veg', 'low-cal'],
  },
  p_ivy: {
    kcal: 18,
    protein: 1.4,
    carbs: 3.1,
    fat: 0.1,
    fibre: 1.6,
    gramsPerUnit: 1000,
    edibleFraction: 0.95,
    tags: ['veg', 'low-cal'],
  },
  p_snake: {
    kcal: 18,
    protein: 0.5,
    carbs: 3.3,
    fat: 0.3,
    fibre: 0.8,
    gramsPerUnit: 1000,
    edibleFraction: 0.85,
    tags: ['veg', 'low-cal'],
  },
  p_cluster: {
    kcal: 46,
    protein: 3.2,
    carbs: 10.8,
    fat: 0.4,
    fibre: 3.2,
    gramsPerUnit: 1000,
    edibleFraction: 0.9,
    tags: ['veg', 'fibre', 'protein-veg'],
  },
  p_frenchbean: {
    kcal: 31,
    protein: 1.8,
    carbs: 7.0,
    fat: 0.2,
    fibre: 2.7,
    gramsPerUnit: 1000,
    edibleFraction: 0.9,
    tags: ['veg', 'fibre'],
  },
  p_broadbean: {
    kcal: 72,
    protein: 5.6,
    carbs: 11.7,
    fat: 0.6,
    fibre: 4.2,
    gramsPerUnit: 1000,
    edibleFraction: 0.7,
    tags: ['veg', 'protein-veg', 'fibre'],
  },
  // fruits
  p_banana: {
    kcal: 89,
    protein: 1.1,
    carbs: 22.8,
    fat: 0.3,
    fibre: 2.6,
    gramsPerUnit: 1200,
    edibleFraction: 0.65,
    tags: ['fruit', 'energy', 'potassium'],
  },
  p_papaya: {
    kcal: 43,
    protein: 0.5,
    carbs: 10.8,
    fat: 0.3,
    fibre: 1.7,
    gramsPerUnit: 900,
    edibleFraction: 0.7,
    tags: ['fruit', 'digestion', 'vitamin-c'],
  },
  p_guava: {
    kcal: 68,
    protein: 2.6,
    carbs: 14.3,
    fat: 1.0,
    fibre: 5.4,
    gramsPerUnit: 1000,
    edibleFraction: 0.9,
    tags: ['fruit', 'fibre', 'vitamin-c'],
  },
  p_pomegranate: {
    kcal: 83,
    protein: 1.7,
    carbs: 18.7,
    fat: 1.2,
    fibre: 4.0,
    gramsPerUnit: 1000,
    edibleFraction: 0.55,
    tags: ['fruit', 'antioxidant'],
  },
  p_grapes: {
    kcal: 69,
    protein: 0.7,
    carbs: 18.1,
    fat: 0.2,
    fibre: 0.9,
    gramsPerUnit: 1000,
    edibleFraction: 0.95,
    tags: ['fruit', 'energy'],
  },
  // meat, fish, eggs (raw)
  p_chicken: {
    kcal: 180,
    protein: 19.0,
    carbs: 0,
    fat: 11.0,
    fibre: 0,
    gramsPerUnit: 1000,
    edibleFraction: 0.75,
    tags: ['non-veg', 'protein', 'chicken'],
  },
  p_mutton: {
    kcal: 143,
    protein: 18.5,
    carbs: 0,
    fat: 7.5,
    fibre: 0,
    gramsPerUnit: 1000,
    edibleFraction: 0.75,
    tags: ['non-veg', 'protein', 'red-meat'],
  },
  p_prawns: {
    kcal: 85,
    protein: 20.1,
    carbs: 0.2,
    fat: 0.5,
    fibre: 0,
    gramsPerUnit: 1000,
    edibleFraction: 0.55,
    tags: ['non-veg', 'protein', 'seafood', 'lean'],
  },
  p_eggs: {
    kcal: 155,
    protein: 12.6,
    carbs: 1.1,
    fat: 10.6,
    fibre: 0,
    gramsPerUnit: 600,
    edibleFraction: 0.88,
    tags: ['egg', 'protein'],
  },
};

/** Macro totals for a list of {productId, grams} (edible grams). */
export function totalsFor(items) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
  for (const it of items || []) {
    const n = NUTRITION[it.productId];
    if (!n) continue;
    const f = (Number(it.grams) || 0) / 100;
    t.kcal += n.kcal * f;
    t.protein += n.protein * f;
    t.carbs += n.carbs * f;
    t.fat += n.fat * f;
    t.fibre += n.fibre * f;
  }
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)]));
}

/**
 * Convert edible grams to an orderable quantity in the product's sale unit and increment.
 * Rounds UP to the next increment so the customer never runs short.
 * @param {{unit:string, increment:string}} product
 * @param {string} productId
 * @param {number} edibleGrams
 */
export function orderQuantityFor(product, productId, edibleGrams) {
  const n = NUTRITION[productId];
  if (!n || !edibleGrams) return 0;
  const asSold = edibleGrams / n.edibleFraction;
  const inc = Number(product.increment) || 1;
  const units = product.unit === 'KG' ? asSold / 1000 : asSold / n.gramsPerUnit;
  return Math.max(inc, Math.ceil(units / inc - 1e-9) * inc);
}

/**
 * Daily targets from age, sex, weight, height, activity and goal (Mifflin–St Jeor for BMR,
 * ICMR-NIN 2020 style activity multipliers, protein by goal). Returns kcal + grams.
 * @param {{age?:number, sex?:'male'|'female', weightKg?:number, heightCm?:number, activity?:'sedentary'|'moderate'|'active', goal?:'lose'|'maintain'|'gain'|'muscle'}} p
 */
export function dailyTargets(p = {}) {
  const age = Number(p.age) || 30;
  const w = Number(p.weightKg) || (p.sex === 'female' ? 58 : 70);
  const h = Number(p.heightCm) || (p.sex === 'female' ? 158 : 170);
  const bmr =
    p.sex === 'female' ? 10 * w + 6.25 * h - 5 * age - 161 : 10 * w + 6.25 * h - 5 * age + 5;
  const mult = { sedentary: 1.4, moderate: 1.6, active: 1.8 }[p.activity || 'moderate'];
  let kcal = bmr * mult;
  if (p.goal === 'lose') kcal -= 400;
  if (p.goal === 'gain') kcal += 300;
  if (p.goal === 'muscle') kcal += 200;
  const proteinPerKg = { lose: 1.6, maintain: 1.0, gain: 1.4, muscle: 1.8 }[p.goal || 'maintain'];
  const protein = Math.round(w * proteinPerKg);
  kcal = Math.round(kcal / 10) * 10;
  return {
    kcal,
    protein,
    carbs: Math.round((kcal * 0.5) / 4),
    fat: Math.round((kcal * 0.25) / 9),
    fibre: 30,
    method:
      'Mifflin–St Jeor × activity; protein by goal (1.0–1.8 g/kg). Guidance only, not medical advice.',
  };
}
