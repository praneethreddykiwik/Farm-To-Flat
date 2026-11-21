/**
 * "What are you cooking?" — from the name of a dish to the things on our shelf that go into it,
 * how much of each for this family, and what to have ready in the kitchen.
 *
 * A written cookbook, not a model asked to improvise (version 2, 21 Nov 2026):
 *  - it answers at once, with the phone offline, and costs nothing per question;
 *  - it can only ever suggest what is actually in today's catalogue, because it works by matching
 *    its ingredients against the catalogue it is handed;
 *  - every line a shopper reads here was written down and can be checked. A model asked why
 *    spinach is good for you will happily say things no food business is allowed to say.
 *
 * The book itself lives in ./cookbook-data: an ingredient dictionary (ingredients.js — every
 * vegetable, green, herb, meat, fish, egg, dairy and pantry staple, with its English, Telugu and
 * Hindi names) and a few hundred dishes from across India (dishes/*.js). Each dish says what it
 * NEEDS, what makes it BETTER, how many grams per adult, and which pantry staples it uses.
 *
 * What this file adds on top:
 *  - matching that works on whole words (so "kheer" is never "kheera", the cucumber), forgives a
 *    typo, and reads Telugu and Devanagari script;
 *  - quantities for the family ("about 750 g for 2 adults and a child"), rounded up to what the
 *    product is sold in;
 *  - a kitchen list of pantry staples we don't sell, and a plain note when the dish's main
 *    ingredient isn't on our shelf ("We don't sell fish yet").
 *
 * The words about NUTRITION are not here at all: they are the product's own computed badge
 * ("Naturally high in vitamin A"), worked out on the server, and shown as-is beside the line.
 *
 * Pure. No React, no network.
 */
import { ALL_DISHES, ING } from './cookbook-data/index.js';
import { appetites, cleanHousehold, householdLabel } from './household';

/**
 * @typedef {{ key: string, why: string, g?: number }} Part
 * @typedef {{ id: string, name: string, te?: string, hi?: string, say: string[],
 *   diet: 'veg'|'egg'|'nonveg', meal: string[], region: string, main: string|null,
 *   needs: Part[], better: Part[], pantry: string[] }} Dish
 */

/** @type {Dish[]} */
export const DISHES = ALL_DISHES;
export { ING };

// ── text ─────────────────────────────────────────────────────────────────────────────────────────

/** Lower-case, punctuation to spaces, one space between words. Keeps Telugu and Devanagari. */
export const norm = (s) =>
  String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9ऀ-ॿఀ-౿' ]+/g, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Spellings that mean the same word, folded so either one matches. */
const FOLD = {
  koora: 'kura',
  kooralu: 'kura',
  curri: 'curry',
  currie: 'curry',
  biriyani: 'biryani',
  biriani: 'biryani',
  briyani: 'biryani',
  pulav: 'pulao',
  pulaav: 'pulao',
  panner: 'paneer',
  paner: 'paneer',
  chiken: 'chicken',
  chikken: 'chicken',
  muttan: 'mutton',
  pakoda: 'pakora',
  bajji: 'bajji',
  bhaji: 'bhaji',
  dhal: 'dal',
  daal: 'dal',
  sambhar: 'sambar',
  rasm: 'rasam',
  dosai: 'dosa',
  iddli: 'idli',
  upmaa: 'upma',
};
const words = (s) =>
  norm(s)
    .split(' ')
    .filter(Boolean)
    .map((w) => FOLD[w] || w);

/** Does `phrase` (words) appear in `query` (words) as whole, consecutive words? */
function containsWords(query, phrase) {
  if (!phrase.length || phrase.length > query.length) return false;
  outer: for (let i = 0; i + phrase.length <= query.length; i += 1) {
    for (let j = 0; j < phrase.length; j += 1) if (query[i + j] !== phrase[j]) continue outer;
    return true;
  }
  return false;
}

/** Edit distance with transpositions, stopping early once it passes `max`. */
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** How many typos a phrase of this length can carry and still be the same phrase. */
const typoBudget = (len) => (len >= 9 ? 2 : len >= 5 ? 1 : 0);

// ── the dish index ───────────────────────────────────────────────────────────────────────────────

/** Every phrase a dish answers to, as words. Built once. */
const INDEX = DISHES.flatMap((d) =>
  [d.name, ...(d.say || []), d.te, d.hi]
    .filter(Boolean)
    .map((p) => ({ dish: d, words: words(p), text: words(p).join(' ') }))
    .filter((x) => x.words.length),
);

/**
 * Rank the dishes for what was typed. Best first; each dish once.
 *   exact phrase  >  phrase inside the sentence (longer wins)  >  typed the start of it  >  typo
 * @returns {{ dish: Dish, score: number, len: number }[]}
 */
function rankDishes(text) {
  const q = words(text);
  const qText = q.join(' ');
  if (!qText) return [];
  const best = new Map();
  const consider = (dish, score, len) => {
    const prev = best.get(dish.id);
    if (!prev || score > prev.score) best.set(dish.id, { dish, score, len });
  };
  for (const { dish, words: ph, text: pt } of INDEX) {
    if (pt === qText) consider(dish, 1000 + pt.length, pt.length);
    else if (containsWords(q, ph)) consider(dish, 500 + pt.length, pt.length);
    else if (
      qText.length >= 4 &&
      pt.startsWith(qText) &&
      /^\s|^$/.test(pt.slice(qText.length, qText.length + 1) || ' ')
    )
      consider(dish, 300 + qText.length - pt.length / 100, qText.length);
    else if (qText.length >= 4 && pt.startsWith(qText))
      consider(dish, 250 + qText.length - pt.length / 100, qText.length);
    else {
      const budget = typoBudget(Math.min(qText.length, pt.length));
      if (budget) {
        const dist = distance(qText, pt, budget);
        if (dist <= budget) consider(dish, 150 - dist * 20 + pt.length / 100, pt.length);
      }
    }
  }
  // A word for a KIND of dish ("soup", "chutney", "breakfast", "kura"): every dish of that kind,
  // the everyday favourites first, so the answer is one of them and the rest are offered beside it.
  // "biryni", "soupp": a one-word kind of dish, typed with a slip.
  let kind = q.length === 1 ? q[0] : null;
  if (kind && !GENERIC[kind] && !best.size)
    kind =
      Object.keys(GENERIC).find(
        (g) => distance(kind, g, typoBudget(g.length)) <= typoBudget(g.length),
      ) || null;
  if (kind && GENERIC[kind]) {
    const test = GENERIC[kind];
    const first = GENERIC_FIRST[kind] || FAVOURITES;
    DISHES.filter(test).forEach((d, i) => {
      const pref = first.indexOf(d.id);
      // The classic of the kind first, then vegetarian dishes, then the rest in book order.
      const rank = pref >= 0 ? 10 - pref / 10 : d.diet === 'veg' ? 5 : 0;
      consider(d, 350 + rank - i / 10000, kind.length);
    });
  }
  // "veg biryani", "vegetarian curry": never answer with meat because a shared word matched.
  const wantsVeg = q.some((w) => VEG_WORDS.has(w));
  const wantsEgg = q.some((w) => EGG_WORDS.has(w));
  for (const x of best.values()) {
    if (wantsVeg && x.dish.diet !== 'veg') x.score -= 600;
    if (!wantsEgg && x.dish.diet === 'egg' && q.some((w) => VEG_WORDS.has(w))) x.score -= 600;
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

const VEG_WORDS = new Set([
  'veg',
  'vegetable',
  'vegetables',
  'vegetarian',
  'sabzi',
  'sabji',
  'paneer',
]);
const EGG_WORDS = new Set(['egg', 'eggs', 'anda', 'guddu']);

/** For a word naming a kind of dish, the ones to offer first, classic first. */
const GENERIC_FIRST = {
  breakfast: ['idli', 'masala_dosa', 'rava_upma', 'kanda_poha', 'pesarattu'],
  tiffin: ['idli', 'masala_dosa', 'pesarattu', 'rava_upma', 'kanda_poha'],
  sweet: ['rice_kheer', 'gajar_ka_halwa', 'double_ka_meetha'],
  sweets: ['rice_kheer', 'gajar_ka_halwa', 'double_ka_meetha'],
  dessert: ['rice_kheer', 'gajar_ka_halwa', 'double_ka_meetha'],
  soup: ['tomato_soup'],
  snack: ['onion_pakoda', 'samosa', 'mirchi_bajji'],
  snacks: ['onion_pakoda', 'samosa', 'mirchi_bajji'],
  drink: ['nimbu_pani', 'mango_lassi', 'masala_chaas', 'watermelon_juice'],
  drinks: ['nimbu_pani', 'mango_lassi', 'masala_chaas', 'watermelon_juice'],
  juice: ['watermelon_juice'],
  chutney: ['coconut_chutney', 'tomato_pachadi'],
  pachadi: ['tomato_pachadi'],
  rice: ['lemon_rice', 'veg_pulao_north'],
  fry: ['bendakaya_fry'],
  vepudu: ['bendakaya_fry'],
  salad: ['kachumber_salad'],
  biryani: [
    'hyderabadi_chicken_dum_biryani',
    'chicken_biryani',
    'hyderabadi_mutton_dum_biryani',
    'hyderabadi_veg_dum_biryani',
  ],
};

/** Words that name a kind of dish rather than one dish. */
const nameHas = (w) => (d) =>
  words(d.name).includes(w) || (d.say || []).some((x) => words(x).includes(w));
const GENERIC = {
  curry: nameHas('curry'),
  kura: (d) => nameHas('kura')(d) || nameHas('curry')(d),
  sabzi: nameHas('sabzi'),
  dal: nameHas('dal'),
  pappu: nameHas('pappu'),
  pulusu: nameHas('pulusu'),
  fry: (d) => nameHas('fry')(d) || nameHas('vepudu')(d),
  vepudu: (d) => nameHas('vepudu')(d) || nameHas('fry')(d),
  soup: nameHas('soup'),
  salad: nameHas('salad'),
  chutney: (d) => nameHas('chutney')(d) || nameHas('pachadi')(d),
  pachadi: (d) => nameHas('pachadi')(d) || nameHas('chutney')(d),
  rice: (d) => nameHas('rice')(d) || nameHas('annam')(d) || nameHas('pulao')(d),
  paratha: nameHas('paratha'),
  juice: (d) => nameHas('juice')(d) || nameHas('sharbat')(d),
  biryani: nameHas('biryani'),
  breakfast: (d) => d.meal.includes('breakfast'),
  tiffin: (d) => d.meal.includes('breakfast'),
  snack: (d) => d.meal.includes('snack'),
  snacks: (d) => d.meal.includes('snack'),
  sweet: (d) => d.meal.includes('sweet'),
  sweets: (d) => d.meal.includes('sweet'),
  dessert: (d) => d.meal.includes('sweet'),
  drink: (d) => d.meal.includes('drink'),
  drinks: (d) => d.meal.includes('drink'),
};

/**
 * The dish a shopper most likely means, or null.
 * @returns {Dish|null}
 */
export function findDish(text) {
  return rankDishes(text)[0]?.dish || null;
}

// ── ingredients on the shelf ─────────────────────────────────────────────────────────────────────

/** Every name a product goes by, as words. */
const namesOf = (p) => [p?.name, ...(p?.aliases || [])].map(words).filter((w) => w.length);

/** Does this product count as that ingredient? Whole words only, both ways. */
export function isIngredient(product, key) {
  const def = ING[key];
  if (!def) return false;
  const names = namesOf(product);
  if (def.not && names.some((n) => def.not.some((x) => containsWords(n, words(x))))) return false;
  return names.some((n) => def.is.some((x) => containsWords(n, words(x))));
}

/**
 * When the exact thing isn't sold, the nearest thing that does the same job in the pot: chicken 65
 * is usually made boneless, but a curry cut works and is what we sell.
 */
const STAND_IN = {
  chickenBoneless: 'chicken',
  smallOnion: 'onion',
  babyCorn: 'corn',
};

/** The best product on the shelf for this ingredient: one whose name IS it beats one that mentions it. */
function shelfFor(key, products) {
  const def = ING[key];
  if (!def) return null;
  const hits = products.filter((p) => isIngredient(p, key));
  if (!hits.length) return STAND_IN[key] ? shelfFor(STAND_IN[key], products) : null;
  if (hits.length === 1) return hits[0];
  const exact = hits.find((p) => namesOf(p).some((n) => def.is.includes(n.join(' '))));
  return exact || hits[0];
}

/** The ingredient keys named in what was typed ("paneer", "royyalu"), longest name first. */
function ingredientsNamed(text) {
  const q = words(text);
  const found = [];
  for (const [key, def] of Object.entries(ING)) {
    let len = 0;
    for (const alias of def.is) {
      const a = words(alias);
      if (containsWords(q, a) && a.join(' ').length > len) len = a.join(' ').length;
    }
    if (len && !(def.not || []).some((x) => containsWords(q, words(x)))) found.push({ key, len });
  }
  return found.sort((a, b) => b.len - a.len).map((x) => x.key);
}

// ── amounts ──────────────────────────────────────────────────────────────────────────────────────

/** Grams per adult when a dish does not say: by what the thing is, and whether it is the star. */
function defaultGrams(key, isMain) {
  const kind = ING[key]?.kind;
  switch (kind) {
    case 'veg':
      return isMain ? 150 : 50;
    case 'leafy':
      return isMain ? 125 : 40;
    case 'meat':
    case 'fish':
      return isMain ? 175 : 75;
    case 'egg':
      return isMain ? 100 : 50;
    case 'fruit':
      return isMain ? 150 : 50;
    case 'sprout':
      return 60;
    case 'dairy':
      return isMain ? 100 : 30;
    default:
      return null;
  }
}

/** Aromatics and herbs: a small amount per person, and never less than one unit of sale. */
const AROMATIC_GRAMS = { chilli: 8, ginger: 5, garlic: 6, lemon: 15 };

/** Grams in one unit of sale, for products not sold by weight. */
function gramsPerUnit(product, key) {
  const def = /** @type {any} */ (ING[key] || {});
  switch (product?.unit) {
    case 'KG':
      return 1000;
    case 'G':
      return 1;
    case 'DOZEN':
      return def.dozen || (def.kind === 'fruit' ? 1400 : 600);
    case 'BUNCH':
      return def.each || (def.kind === 'leafy' ? 250 : 100);
    case 'PIECE':
      return def.each || 250;
    case 'PACK':
      return def.each || 250;
    default:
      return def.each || null;
  }
}

const UNIT_WORD = {
  BUNCH: ['bunch', 'bunches'],
  PIECE: ['piece', 'pieces'],
  DOZEN: ['dozen', 'dozen'],
  PACK: ['pack', 'packs'],
};

function amountLabel(product, qty) {
  if (product?.unit === 'KG') {
    const g = Math.round(qty * 1000);
    return g < 1000 ? `${g} g` : `${Number((g / 1000).toFixed(2))} kg`;
  }
  if (product?.unit === 'G') return `${Math.round(qty)} g`;
  const w = UNIT_WORD[product?.unit] || ['', ''];
  const n = Number(qty.toFixed(2));
  return `${n} ${n === 1 ? w[0] : w[1]}`.trim();
}

/**
 * How much of `product` this family needs for this part of the dish, in the product's own unit,
 * rounded UP to what can be bought. Herbs are one bunch whatever the size of the family (two for a
 * crowd); aromatics a little per person.
 * @returns {{ quantity: number, label: string } | null}
 */
export function amountFor(product, part, dish, people) {
  const key = part.key;
  const def = /** @type {any} */ (ING[key] || {});
  const isMain = dish?.main === key || dish?.needs?.[0]?.key === key;
  const step = Number(product?.increment) > 0 ? Number(product.increment) : 1;
  let units;
  if (def.kind === 'herb' && product?.unit === 'BUNCH') {
    units = people > 6 ? 2 : 1;
  } else {
    const per =
      Number(part.g) > 0 ? Number(part.g) : AROMATIC_GRAMS[key] || defaultGrams(key, isMain);
    const unitG = gramsPerUnit(product, key);
    if (!per || !unitG) return null;
    units = (per * people) / unitG;
  }
  // A hair under a step is that step, not the next one up.
  let quantity = Math.max(step, Math.ceil(units / step - 1e-6) * step);
  quantity = Math.round(quantity * 1000) / 1000;
  const cap = Number(product?.dailyCap);
  if (cap > 0 && quantity > cap) quantity = cap;
  // Ginger for one dish is 15 g, but it is sold in 250 g: say that this is the smallest pack, so
  // nobody thinks the dish needs a quarter-kilo of it.
  const smallest = product?.unit === 'KG' && quantity === step && units < step * 0.25;
  return { quantity, label: amountLabel(product, quantity) + (smallest ? ' (smallest pack)' : '') };
}

// ── the answer ───────────────────────────────────────────────────────────────────────────────────

const sellable = (p) => (p?.availability || 'AVAILABLE') === 'AVAILABLE' && p?.isActive !== false;

/** Pantry staples too obvious to list. */
const TOO_OBVIOUS = new Set(['salt']);

/** The base most everyday curries start from — offered for a dish this book does not know. */
// prettier-ignore
const BASE = [
  { key: 'onion', g: 50, why: 'Browned slowly, it is the body of the gravy.' },
  { key: 'tomato', g: 60, why: 'Cooks down into the gravy and gives it its tang.' },
  { key: 'chilli', why: 'Fresh heat — slit it and let it fry in the oil.' },
  { key: 'ginger', why: 'Pounded with garlic into the paste every gravy starts from.' },
  { key: 'garlic', why: 'Crushed into the oil first; the smell is half the dish.' },
  { key: 'curryLeaves', why: 'Crackled in hot oil for the tempering.' },
  { key: 'coriander', why: 'Torn over the top just before serving.' },
];
const BASE_PANTRY = [
  'oil',
  'turmeric',
  'chilliPowder',
  'corianderPowder',
  'mustardSeeds',
  'cumin',
  'salt',
];

const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * What to put in front of the shopper for what they typed.
 *
 * @param {string} text  what they typed
 * @param {any[]} products  today's catalogue (public product shape)
 * @param {{ inBasket?: Set<string>|string[], basketQty?: Record<string, number|string>,
 *           diet?: 'ALL'|'VEG'|'NONVEG', household?: {adults:number, children:number}|null }} [opts]
 * @returns {null | {
 *   title: string, known: boolean, note: string|null, dishId: string|null,
 *   diet: 'veg'|'egg'|'nonveg'|null,
 *   have: number, total: number,
 *   forLabel: string, people: number,
 *   picks: { product: any, why: string, badge: string|null, role: 'needs'|'better', inBasket: boolean,
 *            quantity: number|null, amount: string|null, enough: boolean }[],
 *   kitchen: string[], notSold: string[], others: { id: string, name: string }[]
 * }}
 *   `have`/`total` count the NEEDED ingredients we sell and how many are already in the basket
 *   in a big enough quantity. `kitchen`: pantry staples to have ready (ones we don't sell today).
 *   `notSold`: needed fresh things we don't have today. `others`: next-best dish matches.
 */
export function suggest(text, products, opts = {}) {
  const typed = String(text || '').trim();
  if (!typed) return null;
  const inBasket = opts.inBasket instanceof Set ? opts.inBasket : new Set(opts.inBasket || []);
  const basketQty = opts.basketQty || {};
  const veg = opts.diet === 'VEG';
  const shelf = (products || []).filter((p) => sellable(p) && (!veg || p.diet !== 'NONVEG'));
  const household = cleanHousehold(opts.household);
  const people = household ? appetites(household) : 2;
  const forLabel = household ? householdLabel(household) : '2 people';

  const q = words(typed);
  const ranked = rankDishes(typed);
  let dish = ranked[0]?.dish || null;
  const dishLen = ranked[0]?.len || 0;
  const exact = (ranked[0]?.score || 0) >= 1000;

  // "Drumstick leaves fry" names drumstick LEAVES; a drumstick dish only matched part of it.
  let named = null;
  let namedLen = 0;
  for (const p of shelf)
    for (const n of namesOf(p)) {
      const t = n.join(' ');
      if (t.length >= 3 && t.length > namedLen && containsWords(q, n)) {
        named = p;
        namedLen = t.length;
      }
    }
  if (dish && named && !exact && namedLen > dishLen) dish = null;

  let title = dish?.name || cap1(typed);
  let note = null;
  /** @type {Part[]} */
  let needs = dish?.needs || [];
  /** @type {Part[]} */
  let better = dish?.better || [];
  let pantry = dish?.pantry || [];
  const notSold = [];

  if (!dish) {
    const ingKeys = ingredientsNamed(typed);
    if (named) {
      needs = [{ key: `#${named.id}`, why: 'The one you named — the dish is built around it.' }];
      better = BASE;
      pantry = BASE_PANTRY;
      note = 'I don’t have this exact recipe, so here is what most dishes like it start with.';
    } else if (ingKeys.length) {
      // It names an ingredient we don't sell today (or one this shelf has under another name).
      const key = ingKeys[0];
      const onShelf = shelfFor(key, shelf);
      needs = [
        { key, why: 'The one you named — the dish is built around it.' },
        ...BASE.slice(0, 3),
      ];
      better = BASE.slice(3);
      pantry = BASE_PANTRY;
      note = onShelf
        ? 'I don’t have this exact recipe, so here is what most dishes like it start with.'
        : `We don’t sell ${ING[key].name.toLowerCase()} yet. Here is the rest of what most dishes like it start with.`;
    } else {
      needs = BASE.slice(0, 4);
      better = BASE.slice(4);
      pantry = BASE_PANTRY;
      note = 'I don’t know this dish yet. This is the base most everyday curries start from.';
    }
  }

  if (dish && veg && dish.diet !== 'veg')
    note = 'This dish has meat, fish or eggs. You shop vegetarian, so here are its vegetables.';

  const seen = new Set();
  const build = (parts, role) => {
    const out = [];
    for (const part of parts) {
      const product = part.key.startsWith('#')
        ? shelf.find((p) => p.id === part.key.slice(1))
        : shelfFor(part.key, shelf);
      if (!product) {
        const def = ING[part.key];
        // Something the dish needs that we don't sell today: pantry staples go to the kitchen
        // list; fresh things are named, so the shopper knows to get them elsewhere.
        if (def && role === 'needs') {
          if (def.pantry) pantry = [...pantry, part.key];
          else if (!(veg && (def.kind === 'meat' || def.kind === 'fish' || def.kind === 'egg')))
            notSold.push(def.name);
        }
        continue;
      }
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      const amount = amountFor(product, part, dish, people);
      const has =
        Number(basketQty[product.id]) ||
        (inBasket.has(product.id) ? Number(product.increment) || 1 : 0);
      const enough = has > 0 && (!amount || has >= amount.quantity - 1e-6);
      const badge = Array.isArray(product.goodToKnow) ? product.goodToKnow[0] : null;
      out.push({
        product,
        why: part.why,
        badge: typeof badge === 'string' ? badge : badge?.label || null,
        role,
        inBasket: inBasket.has(product.id) || has > 0,
        quantity: amount?.quantity ?? null,
        amount: amount?.label ?? null,
        enough,
      });
    }
    // Things still to buy come before things already bought.
    return out.sort((a, b) => Number(a.enough) - Number(b.enough));
  };
  const needed = build(needs, 'needs');
  const extra = build(better, 'better');

  // Pantry staples we happen to sell today join the list as "makes it better"; the rest are listed.
  const kitchen = [];
  for (const key of [...new Set(pantry)]) {
    if (TOO_OBVIOUS.has(key) || !ING[key]) continue;
    const product = shelfFor(key, shelf);
    if (product && !seen.has(product.id)) {
      seen.add(product.id);
      const amount = amountFor(product, { key }, dish, people);
      const has = Number(basketQty[product.id]) || (inBasket.has(product.id) ? 1 : 0);
      extra.push({
        product,
        why: 'From your kitchen list — we have it today.',
        badge: null,
        role: 'better',
        inBasket: has > 0,
        quantity: amount?.quantity ?? null,
        amount: amount?.label ?? null,
        enough: has > 0,
      });
    } else if (!product) kitchen.push(ING[key].name);
  }

  if (dish && notSold.length) {
    const mainName = dish.main ? ING[dish.main]?.name : null;
    note =
      mainName && notSold.includes(mainName)
        ? `We don’t sell ${mainName.toLowerCase()} yet — here is everything else for ${dish.name.toLowerCase()}.`
        : `Not on our shelf today: ${notSold.join(', ').toLowerCase()}.`;
  }

  // A dish made entirely from the kitchen (kheer: milk, rice, sugar) still gets its kitchen list.
  const fromKitchen = !!dish && dish.needs.every((part) => ING[part.key]?.pantry);
  // A dish we know still gets an answer when its main thing isn't sold (mango lassi without
  // mangoes): the note says so, and the kitchen list is still useful.
  const explained = !!dish && (notSold.length > 0 || fromKitchen) && (kitchen.length > 0 || !!note);
  if (!needed.length && !extra.length && !explained) return null;
  const others = ranked
    .slice(1)
    .filter(
      (x) => x.score >= 500 || (x.score >= 300 && words(x.dish.name).some((w) => q.includes(w))),
    )
    .slice(0, 3)
    .map((x) => ({ id: x.dish.id, name: x.dish.name }));
  return {
    title,
    known: !!dish,
    dishId: dish?.id || null,
    diet: dish?.diet || null,
    note,
    have: needed.filter((x) => x.enough).length,
    total: needed.length,
    forLabel,
    people,
    picks: [...needed, ...extra],
    kitchen,
    notSold,
    others,
  };
}

/** The dishes a shopper is most likely to want when they have nothing in mind yet. */
const FAVOURITES = [
  'tomato_kura',
  'tomato_pappu',
  'drumstick_sambar',
  'chicken_curry',
  'hyderabadi_chicken_dum_biryani',
  'palakura_pappu',
  'egg_curry_dhaba',
  'paneer_butter_masala',
  'aloo_gobi',
];

/**
 * A few dishes to offer as one-tap ideas: those that use what is already in the basket first, then
 * the everyday favourites.
 * @returns {{ id: string, name: string }[]}
 */
export function ideas(products, inBasketIds, limit = 6) {
  const ids = new Set(inBasketIds || []);
  const have = (products || []).filter((p) => ids.has(p.id));
  const scored = DISHES.map((d, i) => ({
    d,
    i,
    // The star ingredient counts double: chicken in the basket suggests chicken dishes, not every
    // dish with onion in it.
    n: d.needs.reduce(
      (s, part, j) => s + (have.some((p) => isIngredient(p, part.key)) ? (j === 0 ? 2 : 1) : 0),
      0,
    ),
  }));
  const fromBasket = scored
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.d);
  const favourites = FAVOURITES.map((id) => DISHES.find((d) => d.id === id)).filter(Boolean);
  const out = [];
  for (const d of [...fromBasket, ...favourites]) {
    if (!out.some((x) => x.id === d.id)) out.push({ id: d.id, name: d.name });
    if (out.length >= limit) break;
  }
  return out;
}
