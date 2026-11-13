/**
 * "Will this be enough for my family?"
 *
 * The shopper says how many adults and children eat at home; the app says when a quantity looks
 * light for that many. It is a kitchen rule of thumb, not a nutrition target: roughly what one
 * cooked dish, or one sitting of fruit, takes per person. A child counts as half an adult.
 *
 * It only ever speaks up when a quantity is BELOW the rough figure, and it always says "about".
 * Nothing is added to a basket by it; the shopper taps if they agree.
 *
 * Per person, for one meal:
 *   vegetables and gourds   125 g      leafy greens   100 g, or a third of a bunch
 *   fruit                   150 g      meat and fish  150 g
 *   sprouts and grains       60 g      eggs           2 (sold by the dozen)
 *   a whole vegetable (cabbage, cauliflower, bottle gourd) or fruit (papaya): one serves four
 *   bananas (by the dozen): one each
 *   herbs and aromatics: never judged — nobody needs "more coriander for four"
 *
 * Pure. Where the two numbers are kept is features/household.
 */

export const MAX_ADULTS = 12;
export const MAX_CHILDREN = 12;

/** A household as entered, made safe: whole numbers, at least one adult once anything is set. */
export function cleanHousehold(h) {
  if (!h || typeof h !== 'object') return null;
  const adults = Math.min(MAX_ADULTS, Math.max(0, Math.round(Number(h.adults) || 0)));
  const children = Math.min(MAX_CHILDREN, Math.max(0, Math.round(Number(h.children) || 0)));
  if (adults + children === 0) return null;
  return { adults: Math.max(1, adults), children };
}

/** How many people are at the table. */
export const headcount = (h) => (h ? h.adults + h.children : 0);

/** How many adult-sized appetites that is: a child eats about half. */
export const appetites = (h) => (h ? h.adults + h.children * 0.5 : 0);

/** "2 adults, 1 child" */
export function householdLabel(h) {
  if (!h) return '';
  const a = `${h.adults} adult${h.adults === 1 ? '' : 's'}`;
  if (!h.children) return a;
  return `${a}, ${h.children} ${h.children === 1 ? 'child' : 'children'}`;
}

/** What one adult-sized appetite takes of this product for one meal, in the product's own unit. */
function perAppetite(product) {
  const cat = product?.categoryId || product?.category;
  const unit = product?.unit;
  const eggs = /egg|guddu|ande/i.test(product?.name || '');
  if (cat === 'cat_herb') return null;
  if (unit === 'KG') {
    if (cat === 'cat_leafy') return 0.1;
    if (cat === 'cat_fruit') return 0.15;
    if (cat === 'cat_meat') return 0.15;
    if (cat === 'cat_sprout') return 0.06;
    return 0.125;
  }
  if (unit === 'BUNCH') return cat === 'cat_leafy' ? 1 / 3 : null;
  if (unit === 'PIECE') return eggs ? 2 : 0.25;
  if (unit === 'DOZEN') return eggs ? 2 / 12 : 1 / 12;
  return null;
}

/**
 * About how much of this product one meal for this household takes, rounded UP to a quantity the
 * product can actually be bought in. Null when there is nothing sensible to say.
 */
export function mealQuantity(product, household) {
  const each = perAppetite(product);
  const n = appetites(household);
  if (!each || !n) return null;
  const step = Number(product?.increment) > 0 ? Number(product.increment) : 1;
  const raw = each * n;
  // A hair under a step is that step, not the next one up: 0.375 kg is 500 g, but 0.2500001 is 250.
  const steps = Math.max(1, Math.ceil(raw / step - 1e-6));
  let need = Math.round(steps * step * 1000) / 1000;
  const cap = Number(product?.dailyCap);
  if (cap > 0 && need > cap) need = cap;
  return need;
}

/**
 * If `quantity` looks light for this household, the quantity that would cover one meal; else null.
 * Zero is not "light" — it is not in the basket.
 */
export function topUpTo(product, quantity, household) {
  const q = Number(quantity);
  if (!(q > 0)) return null;
  const need = mealQuantity(product, household);
  if (!need || q >= need - 1e-6) return null;
  return need;
}
