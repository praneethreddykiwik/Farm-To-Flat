/**
 * The shape of one dish in the cookbook, and the rules every dish must pass.
 *
 * A dish:
 *   id      unique snake_case id, e.g. 'paneer_butter_masala'.
 *   name    English display name, e.g. 'Paneer butter masala'.
 *   te, hi  optional: the dish's name in Telugu and Devanagari script, so a shopper can type it
 *           in their own script. Leave out rather than guess.
 *   say     lower-case, romanised words a shopper might type for THIS dish (English, Telugu, Hindi,
 *           Tamil…). Include common spellings ("paneer makhani", "butter paneer"). Never a bare
 *           ingredient name alone unless the dish IS that ingredient ("palak paneer" yes, "paneer"
 *           no — the ingredient search handles single products).
 *   diet    'veg' | 'egg' | 'nonveg'.
 *   meal    when it is eaten: any of 'breakfast','lunch','dinner','snack','sweet','side','drink'.
 *   region  'telangana','andhra','south','north','west','east','pan' (all-India / Indo-Chinese).
 *   main    the ING key the dish is ABOUT (paneer for palak paneer? no — spinach AND paneer: pick
 *           the one whose absence ruins it; for palak paneer that is 'paneer'). null if none.
 *   needs   the fresh ingredients the dish cannot do without, most important first.
 *   better  fresh ingredients that make it better, optional.
 *           Each part: { key, why, g? }
 *             key  an ING key (see ingredients.js).
 *             why  one short line (≤ 70 chars) on what it does in THIS dish — taste, texture,
 *                  technique. NEVER health, nutrition, vitamins, weight, cures.
 *             g    grams of it per ONE adult portion of this dish. Give it for every vegetable,
 *                  meat, fish, egg (50 g each), fruit, paneer and leafy green. Leave it out for
 *                  herbs and aromatics (coriander, mint, curry leaves, chilli, ginger, garlic,
 *                  lemon) — the engine uses a sensible per-dish amount for those.
 *   pantry  kitchen staples the dish uses that we usually do NOT sell: ING keys with pantry:true
 *           (rice, toorDal, oil, salt, turmeric, chilliPowder, tamarind, garamMasala, curd…).
 *           List what the cook must have; skip only water.
 */

export const DIETS = ['veg', 'egg', 'nonveg'];
export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'sweet', 'side', 'drink'];
export const REGIONS = ['telangana', 'andhra', 'south', 'north', 'west', 'east', 'pan'];
export const BANNED_WHY =
  /calcium|vitamin|protein|iron\b|immun|health|nutri|diabet|cure|weight|detox|cholesterol|fibre|fiber|antioxid|digest|blood|heart|sugar level|low[- ]fat|calorie/i;

const MEAT_KINDS = new Set(['meat', 'fish']);

/**
 * Check a list of dishes against the rules. Returns a list of problems (empty when all good).
 * @param {any[]} dishes
 * @param {Record<string, any>} ING
 */
export function checkDishes(dishes, ING) {
  const problems = [];
  const ids = new Set();
  const sayOwner = new Map();
  for (const d of dishes) {
    const at = d?.id || JSON.stringify(d).slice(0, 40);
    if (!d || typeof d !== 'object') {
      problems.push(`${at}: not an object`);
      continue;
    }
    if (!/^[a-z0-9_]+$/.test(d.id || '')) problems.push(`${at}: bad id`);
    if (ids.has(d.id)) problems.push(`${at}: duplicate id`);
    ids.add(d.id);
    if (!d.name || typeof d.name !== 'string') problems.push(`${at}: missing name`);
    if (!DIETS.includes(d.diet)) problems.push(`${at}: diet must be one of ${DIETS}`);
    if (!REGIONS.includes(d.region)) problems.push(`${at}: region must be one of ${REGIONS}`);
    if (!Array.isArray(d.meal) || !d.meal.length || d.meal.some((m) => !MEALS.includes(m)))
      problems.push(`${at}: meal must be a non-empty list of ${MEALS}`);
    if (!Array.isArray(d.say) || !d.say.length)
      problems.push(`${at}: say must be a non-empty list`);
    for (const s of d.say || []) {
      if (s !== s.toLowerCase() || s !== s.trim() || /\s{2}/.test(s))
        problems.push(`${at}: say "${s}" must be lower-case and trimmed`);
      if (s.length < 3) problems.push(`${at}: say "${s}" too short`);
      const prev = sayOwner.get(s);
      if (prev && prev !== d.id) problems.push(`${at}: say "${s}" also used by ${prev}`);
      sayOwner.set(s, d.id);
    }
    if (d.main != null && !ING[d.main]) problems.push(`${at}: main "${d.main}" is not an ING key`);
    if (!Array.isArray(d.needs) || !d.needs.length) problems.push(`${at}: needs must be non-empty`);
    const seen = new Set();
    let hasMeat = false;
    let hasEgg = false;
    for (const role of ['needs', 'better']) {
      for (const p of d[role] || []) {
        const ing = ING[p?.key];
        if (!ing) {
          problems.push(`${at}/${role}: unknown key "${p?.key}"`);
          continue;
        }
        if (seen.has(p.key)) problems.push(`${at}: "${p.key}" listed twice`);
        seen.add(p.key);
        if (!p.why || typeof p.why !== 'string') problems.push(`${at}/${p.key}: missing why`);
        else {
          if (p.why.length > 70) problems.push(`${at}/${p.key}: why longer than 70 chars`);
          if (BANNED_WHY.test(p.why))
            problems.push(`${at}/${p.key}: health wording in why: "${p.why}"`);
        }
        if (p.g != null && !(Number(p.g) > 0 && Number(p.g) <= 600))
          problems.push(`${at}/${p.key}: g must be 1–600 grams per adult portion`);
        if (MEAT_KINDS.has(ing.kind)) hasMeat = true;
        if (ing.kind === 'egg') hasEgg = true;
      }
    }
    for (const k of d.pantry || []) {
      if (!ING[k]) problems.push(`${at}/pantry: unknown key "${k}"`);
      else if (!ING[k].pantry)
        problems.push(`${at}/pantry: "${k}" is not a pantry item — put it in needs/better`);
      if (seen.has(k)) problems.push(`${at}: "${k}" in pantry and needs/better`);
    }
    // Diet must match what is in the NEEDS (a 'better' meat add-on is fine on a veg dish).
    const needKinds = (d.needs || []).map((p) => ING[p.key]?.kind);
    const needMeat = needKinds.some((k) => MEAT_KINDS.has(k));
    const needEgg = needKinds.includes('egg');
    if (needMeat && d.diet !== 'nonveg')
      problems.push(`${at}: needs meat/fish but diet is ${d.diet}`);
    if (!needMeat && needEgg && d.diet !== 'egg')
      problems.push(`${at}: needs egg but diet is ${d.diet}`);
    if (d.diet === 'nonveg' && !needMeat)
      problems.push(`${at}: diet nonveg but no meat/fish in needs`);
    if (d.diet === 'egg' && !needEgg) problems.push(`${at}: diet egg but no egg in needs`);
    void hasMeat;
    void hasEgg;
  }
  return problems;
}
