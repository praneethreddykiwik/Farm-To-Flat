/**
 * Builds apps/api/src/data/composition.json — micronutrients per 100 g raw edible portion for the
 * foods we sell — from USDA FoodData Central "SR Legacy" (public domain, CC0).
 *
 * Why USDA and not a number typed from memory: every nutrition statement the app makes ("naturally
 * high in vitamin C") is a regulated claim in India (FSS Advertising & Claims Regulations, 2018) and
 * has to be substantiated. So every value here is traceable to one row of a published table, and the
 * file records which row. A food with no trustworthy match gets NO entry — and the claims engine then
 * says nothing about it. Silence is compliant; a guessed number is not.
 *
 *   1. Download + unzip  https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
 *   2. node apps/api/scripts/build-composition.mjs /path/to/FoodData_Central_sr_legacy_food_csv_2018-04
 *
 * `exact: false` marks a nearest-relative match (a different species or cut). Those rows are kept
 * for reference but the claims engine ignores them.
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node build-composition.mjs <SR Legacy csv directory>');
  process.exit(1);
}

/** food key → the USDA row that describes it. Keys are ours; see data/knowledge.js for the mapping from products. */
// One row per entry, on purpose: a table reads as a table. prettier-ignore keeps it one.
// prettier-ignore
const REFS = {
  spinach: { fdcId: 168462, exact: true },
  amaranth_leaves: { fdcId: 168385, exact: true },
  coriander_leaves: { fdcId: 169997, exact: true },
  mint: { fdcId: 173475, exact: true },
  okra: { fdcId: 169260, exact: true },
  tomato: { fdcId: 170457, exact: true },
  spring_onion: { fdcId: 170005, exact: true },
  ginger: { fdcId: 169231, exact: true },
  garlic: { fdcId: 169230, exact: true },
  green_chilli: { fdcId: 170497, exact: true },
  onion: { fdcId: 170000, exact: true },
  lemon: { fdcId: 167746, exact: true },
  brinjal: { fdcId: 169228, exact: true },
  carrot: { fdcId: 170393, exact: true },
  beetroot: { fdcId: 169145, exact: true },
  cabbage: { fdcId: 169975, exact: true },
  radish: { fdcId: 169276, exact: true },
  cucumber: { fdcId: 168409, exact: true },
  pumpkin: { fdcId: 168448, exact: true },
  drumstick_pods: { fdcId: 170483, exact: true },
  drumstick_leaves: { fdcId: 168416, exact: true },
  bitter_gourd: { fdcId: 168393, exact: true },
  potato: { fdcId: 170026, exact: true },
  cauliflower: { fdcId: 169986, exact: true },
  bottle_gourd: { fdcId: 169232, exact: true },
  french_beans: { fdcId: 169961, exact: true },
  banana: { fdcId: 173944, exact: true },
  papaya: { fdcId: 169926, exact: true },
  guava: { fdcId: 173044, exact: true },
  grapes: { fdcId: 174683, exact: true },
  pomegranate: { fdcId: 169134, exact: true },
  kale: { fdcId: 168421, exact: true },
  bathua: { fdcId: 169244, exact: true },
  colocasia_leaves: { fdcId: 168487, exact: true },
  green_peas: { fdcId: 170419, exact: true },
  purslane: { fdcId: 169274, exact: true },
  dill: { fdcId: 172233, exact: true },
  mustard_greens: { fdcId: 169256, exact: true },
  malabar_spinach: { fdcId: 170474, exact: true },
  lettuce: { fdcId: 169249, exact: true },
  capsicum: { fdcId: 170427, exact: true },
  sweet_corn: { fdcId: 169998, exact: true },
  raw_banana: { fdcId: 168215, exact: true },
  jackfruit: { fdcId: 174687, exact: true },
  chicken: { fdcId: 171052, exact: true },
  goat_meat: { fdcId: 175303, exact: true },
  prawns: { fdcId: 175179, exact: true },
  egg: { fdcId: 171287, exact: true },
  // nearest relatives — reference only, never used for a claim
  ridge_gourd: { fdcId: 168414, exact: false, note: 'USDA row is sponge gourd (Luffa aegyptiaca)' },
  broad_beans: { fdcId: 169234, exact: false, note: 'USDA row is hyacinth-bean seeds, not whole pods' },
  sorrel_dock: { fdcId: 170076, exact: false, note: 'USDA row is dock (Rumex spp.)' },
  rohu: { fdcId: 171952, exact: false, note: 'USDA row is common carp' },
};

/** USDA nutrient id → our field (unit as published). */
const NUTRIENTS = {
  1008: ['kcal', 'kcal'],
  1003: ['protein', 'g'],
  1004: ['fat', 'g'],
  1258: ['satFat', 'g'],
  1005: ['carbs', 'g'],
  1079: ['fibre', 'g'],
  1087: ['calcium', 'mg'],
  1089: ['iron', 'mg'],
  1090: ['magnesium', 'mg'],
  1092: ['potassium', 'mg'],
  1093: ['sodium', 'mg'],
  1095: ['zinc', 'mg'],
  1106: ['vitaminA', 'µg RAE'],
  1162: ['vitaminC', 'mg'],
  1177: ['folate', 'µg'],
  1178: ['vitaminB12', 'µg'],
};

const parseCsvLine = (line) => {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') ((cur += '"'), i++);
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') (out.push(cur), (cur = ''));
    else cur += c;
  }
  out.push(cur);
  return out;
};

const wanted = new Map(Object.entries(REFS).map(([key, r]) => [String(r.fdcId), key]));
const descriptions = {};
const values = {};

const eachLine = async (file, fn) => {
  const rl = createInterface({ input: createReadStream(join(dir, file)), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    const cols = parseCsvLine(line);
    if (!header) header = cols;
    else fn(Object.fromEntries(header.map((h, i) => [h, cols[i]])));
  }
};

await eachLine('food.csv', (r) => {
  if (wanted.has(r.fdc_id)) descriptions[r.fdc_id] = r.description;
});
await eachLine('food_nutrient.csv', (r) => {
  const key = wanted.get(r.fdc_id);
  const n = NUTRIENTS[r.nutrient_id];
  if (!key || !n) return;
  (values[key] ||= {})[n[0]] = Number(r.amount);
});

const foods = {};
for (const [key, ref] of Object.entries(REFS)) {
  const v = values[key];
  if (!v) throw new Error(`No nutrient rows for ${key} (fdc ${ref.fdcId})`);
  foods[key] = {
    fdcId: ref.fdcId,
    description: descriptions[String(ref.fdcId)],
    exact: ref.exact,
    ...(ref.note ? { note: ref.note } : {}),
    per100g: Object.fromEntries(Object.values(NUTRIENTS).map(([f]) => [f, v[f] ?? null])),
  };
}

const out = {
  source: 'USDA FoodData Central, SR Legacy (April 2018 release), public domain',
  url: 'https://fdc.nal.usda.gov/',
  basis: 'per 100 g raw edible portion',
  units: Object.fromEntries(Object.values(NUTRIENTS)),
  generatedBy: 'apps/api/scripts/build-composition.mjs',
  foods,
};
const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'src', 'data', 'composition.json');
writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${Object.keys(foods).length} foods → ${target}`);
