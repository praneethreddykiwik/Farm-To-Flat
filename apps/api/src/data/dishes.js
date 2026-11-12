/**
 * Reference values for everyday cooked Indian dishes, per 100 g as eaten.
 *
 * Two jobs, neither of which is "be the answer":
 *   1. A PLAUSIBILITY CHECK on what the vision model says about a photo. If it calls something
 *      "sambar" and prices it at 400 kcal per 100 g, the model is wrong, and we correct it to the
 *      reference rather than show a number no sambar has ever had.
 *   2. The food list behind "search food", for logging a meal without a photo.
 *
 * SOURCE: Indian Nutrient Databank (INDB), Vijayakumar A, Dubasi HB, Awasthi A, Jaacks LM,
 * "Development of an Indian Food Composition Database", Current Developments in Nutrition 2024
 * (CC BY 4.0) — https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795 . `indb` is the recipe code in
 * that databank. Curd and buttermilk are from NIN's "Nutritive Value of Indian Foods" as commonly
 * tabulated, marked `secondary`.
 *
 * INDB recipes are computed from ingredients, not lab-measured, and recipes vary enormously from one
 * kitchen to the next (INDB itself lists two chole recipes at 69 and 163 kcal). So these are
 * mid-points to sanity-check against, never figures to present as exact. Entries the databank gets
 * plainly wrong as eaten (deep-fried items, where it counts all the frying oil; dosa and pesarattu,
 * which look like dry-batter values) are deliberately left out.
 *
 * `serve` is a typical household portion in grams with the word a cook would use for it. These are
 * working approximations for a first estimate that the customer can adjust — not measured standards.
 *
 * BEFORE THIS FEATURE IS OPENED TO CUSTOMERS: confirm with the INDB authors that this use is within
 * their licence (the paper is CC BY 4.0; the data repository carries no licence file), and have a
 * qualified nutrition professional review the table.
 *
 * @typedef {{ id: string, name: string, also: string[], kcal: number, protein: number, carbs: number, fat: number, serve: [number, string], indb?: string, secondary?: boolean }} Dish
 * @type {Dish[]}
 */
// One row per entry, on purpose: a table reads as a table. prettier-ignore keeps it one.
// prettier-ignore
export const DISHES = [
  { id: 'rice', name: 'Cooked rice', also: ['annam', 'chawal', 'white rice', 'steamed rice', 'plain rice', 'boiled rice'], kcal: 117, protein: 2.6, carbs: 25.7, fat: 0.2, serve: [150, 'cup'], indb: 'ASC113' },
  { id: 'roti', name: 'Roti / chapati', also: ['chapati', 'chapathi', 'phulka', 'roti'], kcal: 202, protein: 5.9, carbs: 35.6, fat: 3.6, serve: [40, 'roti'], indb: 'ASC096' },
  { id: 'paratha', name: 'Plain paratha', also: ['parotta', 'paratha', 'parantha'], kcal: 298, protein: 5.1, carbs: 30.7, fat: 16.9, serve: [80, 'paratha'], indb: 'ASC097' },
  { id: 'dal', name: 'Dal / pappu', also: ['pappu', 'dal tadka', 'dal fry', 'moong dal', 'toor dal', 'lentil', 'dal'], kcal: 63, protein: 3.2, carbs: 6.8, fat: 2.5, serve: [150, 'katori'], indb: 'BFP178' },
  { id: 'sambar', name: 'Sambar', also: ['sambhar', 'sambar'], kcal: 97, protein: 3.4, carbs: 10.6, fat: 4.4, serve: [150, 'katori'], indb: 'ASC167' },
  { id: 'rasam', name: 'Rasam / charu', also: ['charu', 'rasam', 'saaru'], kcal: 27, protein: 1.1, carbs: 3.4, fat: 0.9, serve: [150, 'katori'], indb: 'BFP176' },
  { id: 'idli', name: 'Idli', also: ['idly', 'idli'], kcal: 138, protein: 4.6, carbs: 28.2, fat: 0.3, serve: [45, 'idli'], indb: 'ASC144' },
  { id: 'masala_dosa', name: 'Masala dosa', also: ['masala dosa', 'masala dosai'], kcal: 165, protein: 3.3, carbs: 19.6, fat: 7.8, serve: [150, 'dosa'], indb: 'ASC146' },
  { id: 'upma', name: 'Upma', also: ['uppittu', 'upma', 'rava upma'], kcal: 148, protein: 3.3, carbs: 16.3, fat: 7.5, serve: [150, 'katori'], indb: 'BFP039' },
  { id: 'poha', name: 'Vegetable poha', also: ['atukulu', 'poha', 'aval'], kcal: 181, protein: 4.9, carbs: 21.5, fat: 8.1, serve: [150, 'katori'], indb: 'BFP045' },
  { id: 'curd_rice', name: 'Curd rice', also: ['daddojanam', 'perugannam', 'curd rice', 'thayir sadam'], kcal: 196, protein: 5.8, carbs: 32.9, fat: 4.3, serve: [150, 'cup'], indb: 'ASC126' },
  { id: 'khichdi', name: 'Vegetable khichdi', also: ['khichdi', 'kichdi', 'pongal', 'khichri'], kcal: 143, protein: 5.6, carbs: 19.6, fat: 4.5, serve: [200, 'cup'], indb: 'ASC487' },
  { id: 'pulao', name: 'Plain pulao', also: ['pulao', 'pulav', 'pilaf'], kcal: 140, protein: 2.3, carbs: 21.8, fat: 4.6, serve: [200, 'cup'], indb: 'ASC114' },
  { id: 'veg_biryani', name: 'Vegetable biryani', also: ['veg biryani', 'vegetable biryani'], kcal: 175, protein: 3.2, carbs: 18.6, fat: 9.5, serve: [250, 'plate'], indb: 'ASC123' },
  { id: 'meat_biryani', name: 'Mutton / chicken biryani', also: ['biryani', 'mutton biryani', 'chicken biryani', 'dum biryani'], kcal: 191, protein: 7.4, carbs: 22.5, fat: 7.7, serve: [250, 'plate'], indb: 'ASC122' },
  { id: 'veg_curry', name: 'Mixed vegetable curry', also: ['kura', 'koora', 'sabzi', 'sabji', 'vegetable curry', 'mixed veg', 'poriyal', 'vepudu', 'fry'], kcal: 83, protein: 2.8, carbs: 7.2, fat: 4.7, serve: [120, 'katori'], indb: 'BFP241' },
  { id: 'aloo_sabzi', name: 'Aloo sabzi', also: ['aloo', 'potato curry', 'bangaladumpa', 'aloo sabzi'], kcal: 90, protein: 1.5, carbs: 10.4, fat: 4.5, serve: [120, 'katori'], indb: 'BFP239' },
  { id: 'bhindi_fry', name: 'Bhindi fry', also: ['bendakaya', 'bhindi', 'okra fry', 'ladies finger fry'], kcal: 111, protein: 1.8, carbs: 4.5, fat: 9.3, serve: [100, 'katori'], indb: 'BFP269' },
  { id: 'palak_paneer', name: 'Palak paneer', also: ['palak paneer', 'saag paneer'], kcal: 78, protein: 4.0, carbs: 4.4, fat: 4.8, serve: [150, 'katori'], indb: 'ASC215' },
  { id: 'paneer_butter', name: 'Paneer butter masala', also: ['paneer butter masala', 'paneer makhani', 'butter paneer', 'paneer curry'], kcal: 146, protein: 7.0, carbs: 9.7, fat: 8.8, serve: [150, 'katori'], indb: 'ASC222' },
  { id: 'chole', name: 'Chole', also: ['chole', 'chana masala', 'senagala kura', 'chickpea curry'], kcal: 163, protein: 6.1, carbs: 20.0, fat: 6.8, serve: [150, 'katori'], indb: 'ASC162' },
  { id: 'rajma', name: 'Rajma', also: ['rajma', 'kidney bean curry'], kcal: 144, protein: 6.0, carbs: 16.4, fat: 5.8, serve: [150, 'katori'], indb: 'ASC165' },
  { id: 'chicken_curry', name: 'Chicken curry', also: ['kodi kura', 'chicken curry', 'chicken gravy', 'chicken masala'], kcal: 129, protein: 11.8, carbs: 3.4, fat: 7.6, serve: [150, 'katori'], indb: 'ASC240' },
  { id: 'egg_curry', name: 'Egg curry', also: ['guddu kura', 'egg curry', 'anda curry', 'egg pulusu'], kcal: 118, protein: 5.4, carbs: 4.0, fat: 8.8, serve: [150, 'katori'], indb: 'BFP240' },
  { id: 'fish_curry', name: 'Fish curry', also: ['chepala pulusu', 'fish curry', 'meen curry', 'fish pulusu'], kcal: 111, protein: 8.8, carbs: 3.8, fat: 6.7, serve: [150, 'katori'], indb: 'ASC246' },
  { id: 'curd', name: 'Curd', also: ['perugu', 'dahi', 'curd', 'yogurt', 'yoghurt'], kcal: 60, protein: 3, carbs: 3, fat: 4, serve: [100, 'katori'], secondary: true },
  { id: 'buttermilk', name: 'Buttermilk', also: ['majjiga', 'chaas', 'buttermilk', 'mor'], kcal: 15, protein: 1, carbs: 1, fat: 1, serve: [200, 'glass'], secondary: true },
];

/** What a spoon of cooking fat is worth — for the "how much oil?" correction. Standard value for oils and ghee. */
export const FAT_KCAL_PER_G = 9;
/** One teaspoon of oil or ghee, in grams. */
export const TSP_OIL_G = 5;
