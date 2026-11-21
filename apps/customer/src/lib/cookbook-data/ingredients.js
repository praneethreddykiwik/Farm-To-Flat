/**
 * Every ingredient the cookbook can name, and how to recognise it on our shelf.
 *
 * `is`   lower-case names a product may be called by (English, then romanised Telugu and Hindi).
 *        Matched as WHOLE WORDS against the product's name and aliases, so "kheer" never finds
 *        "kheera" (cucumber), and "egg" never finds "eggplant".
 * `not`  words that mean it is something else ("onion" is not "spring onion").
 * `kind` what sort of thing it is. Decides the default amount per person when a dish gives none,
 *        and which ingredients a family-size note is worth making for.
 * `each` grams in one PIECE / BUNCH / PACK of it, when we sell it that way, so a recipe written
 *        in grams can be turned into "2 bunches" or "1 piece". `dozen` for things sold by the dozen.
 * `pantry` usually already in an Indian kitchen (rice, dal, oil, spices…). Offered from the shelf
 *        if we ever sell it; otherwise listed under "From your kitchen" — never silently dropped.
 *
 * Names here are written by hand and checked; nothing about health or nutrition belongs here
 * (that comes only from each product's own computed badge).
 */

/** @typedef {'veg'|'leafy'|'herb'|'aromatic'|'fruit'|'sprout'|'meat'|'fish'|'egg'|'dairy'|'grain'|'pulse'|'spice'|'fat'|'other'} Kind */
/** @typedef {{ name: string, is: string[], not?: string[], kind: Kind, each?: number, dozen?: number, pantry?: boolean }} Ingredient */

/** @type {Record<string, Ingredient>} */
// prettier-ignore
export const ING = {
  // ── everyday vegetables ──────────────────────────────────────────────────────────────────────
  tomato:        { name: 'Tomato', kind: 'veg', is: ['tomato', 'tomatoes', 'tamata', 'tamatar', 'thakkali'] },
  onion:         { name: 'Onion', kind: 'veg', is: ['onion', 'onions', 'ullipaya', 'ullipayalu', 'pyaz', 'pyaaz', 'kanda'], not: ['spring', 'green onion', 'ullikadalu', 'hara pyaz', 'shallot', 'sambar onion', 'small onion'] },
  smallOnion:    { name: 'Small onion', kind: 'veg', is: ['small onion', 'sambar onion', 'shallot', 'shallots', 'chinna ullipaya'] },
  springOnion:   { name: 'Spring onion', kind: 'herb', each: 100, is: ['spring onion', 'green onion', 'ullikadalu', 'hara pyaz', 'scallion'] },
  potato:        { name: 'Potato', kind: 'veg', is: ['potato', 'potatoes', 'bangaladumpa', 'aloo', 'alu', 'urlaikizhangu'], not: ['sweet potato', 'chilagada'] },
  sweetPotato:   { name: 'Sweet potato', kind: 'veg', is: ['sweet potato', 'chilagada dumpa', 'shakarkandi'] },
  carrot:        { name: 'Carrot', kind: 'veg', is: ['carrot', 'carrots', 'gajar'] },
  beetroot:      { name: 'Beetroot', kind: 'veg', is: ['beetroot', 'beet', 'chukandar'] },
  radish:        { name: 'Radish', kind: 'veg', is: ['radish', 'mullangi', 'mooli'] },
  cucumber:      { name: 'Cucumber', kind: 'veg', is: ['cucumber', 'dosakaya', 'kheera', 'kakdi'] },
  cabbage:       { name: 'Cabbage', kind: 'veg', each: 800, is: ['cabbage', 'patta gobi', 'band gobi', 'kosu'] },
  cauliflower:   { name: 'Cauliflower', kind: 'veg', each: 600, is: ['cauliflower', 'gobi', 'phool gobi'], not: ['patta', 'band gobi'] },
  capsicum:      { name: 'Capsicum', kind: 'veg', is: ['capsicum', 'shimla mirch', 'bell pepper', 'bell peppers'] },
  corn:          { name: 'Sweet corn', kind: 'veg', each: 250, is: ['sweet corn', 'corn', 'mokkajonna', 'bhutta', 'makka'], not: ['baby corn', 'cornflour', 'corn flour'] },
  babyCorn:      { name: 'Baby corn', kind: 'veg', is: ['baby corn'] },
  peas:          { name: 'Green peas', kind: 'veg', is: ['green peas', 'peas', 'matar', 'mutter', 'batani', 'pachi batani'] },
  frenchBeans:   { name: 'French beans', kind: 'veg', is: ['french beans', 'beans', 'farasbi'], not: ['broad', 'cluster', 'chikkudukaya', 'goru', 'kidney', 'rajma'] },
  broadBeans:    { name: 'Broad beans', kind: 'veg', is: ['broad beans', 'chikkudukaya', 'sem', 'avarakkai'] },
  clusterBeans:  { name: 'Cluster beans', kind: 'veg', is: ['cluster beans', 'goruchikkudu', 'gawar', 'guar'] },
  drumstick:     { name: 'Drumstick', kind: 'veg', is: ['drumstick', 'drumsticks', 'munakkaya', 'munagakaya', 'sahjan', 'moringa'], not: ['leaves', 'aaku'] },
  brinjal:       { name: 'Brinjal', kind: 'veg', is: ['brinjal', 'vankaya', 'baingan', 'eggplant', 'aubergine', 'kathirikai'] },
  okra:          { name: 'Okra', kind: 'veg', is: ['okra', "lady's finger", 'ladies finger', 'ladyfinger', 'bendakaya', 'bhindi', 'vendakkai'] },
  pumpkin:       { name: 'Pumpkin', kind: 'veg', is: ['pumpkin', 'gummadikaya', 'kaddu', 'sitaphal', 'yellow pumpkin'], not: ['ash', 'boodida'] },
  ashGourd:      { name: 'Ash gourd', kind: 'veg', is: ['ash gourd', 'boodida gummadikaya', 'petha', 'winter melon'] },
  bottleGourd:   { name: 'Bottle gourd', kind: 'veg', each: 1000, is: ['bottle gourd', 'sorakaya', 'anapakaya', 'lauki', 'dudhi', 'ghiya'] },
  ridgeGourd:    { name: 'Ridge gourd', kind: 'veg', is: ['ridge gourd', 'beerakaya', 'turai', 'tori'] },
  bitterGourd:   { name: 'Bitter gourd', kind: 'veg', is: ['bitter gourd', 'kakarakaya', 'karela', 'pavakkai'] },
  snakeGourd:    { name: 'Snake gourd', kind: 'veg', is: ['snake gourd', 'potlakaya', 'chichinda', 'padwal'] },
  ivyGourd:      { name: 'Ivy gourd', kind: 'veg', is: ['ivy gourd', 'dondakaya', 'tindora', 'tendli', 'kundru'] },
  rawBanana:     { name: 'Raw banana', kind: 'veg', each: 150, is: ['raw banana', 'aratikaya', 'kaccha kela', 'plantain', 'vazhakkai'] },
  jackfruit:     { name: 'Raw jackfruit', kind: 'veg', is: ['raw jackfruit', 'jackfruit', 'panasakaya', 'kathal'] },
  colocasia:     { name: 'Colocasia', kind: 'veg', is: ['colocasia', 'arbi', 'chamadumpa', 'taro', 'seppankizhangu'] },
  yam:           { name: 'Yam', kind: 'veg', is: ['yam', 'elephant yam', 'kanda gadda', 'suran', 'jimikand'] },
  rawMango:      { name: 'Raw mango', kind: 'veg', each: 250, is: ['raw mango', 'mamidikaya', 'kairi', 'green mango'] },
  mushroom:      { name: 'Mushroom', kind: 'veg', is: ['mushroom', 'mushrooms', 'putta godugulu'] },
  coconut:       { name: 'Coconut', kind: 'other', each: 400, pantry: true, is: ['coconut', 'kobbari', 'nariyal', 'thengai', 'fresh coconut', 'grated coconut'], not: ['oil', 'milk'] },

  // ── leafy greens ─────────────────────────────────────────────────────────────────────────────
  spinach:       { name: 'Spinach', kind: 'leafy', each: 250, is: ['spinach', 'palakura', 'palak'], not: ['malabar', 'bachali'] },
  methi:         { name: 'Fenugreek leaves', kind: 'leafy', each: 150, is: ['fenugreek leaves', 'fenugreek', 'menthikura', 'methi'], not: ['seeds', 'kasuri', 'menthulu'] },
  amaranth:      { name: 'Amaranth', kind: 'leafy', each: 250, is: ['amaranth', 'thotakura', 'chaulai', 'cheera', 'keerai'] },
  gongura:       { name: 'Gongura', kind: 'leafy', each: 200, is: ['gongura', 'sorrel', 'sorrel leaves', 'roselle', 'ambadi', 'pulicha keerai'] },
  ponnaganti:    { name: 'Ponnaganti', kind: 'leafy', each: 200, is: ['ponnaganti', 'ponnaganti aaku', 'sessile joyweed', 'ponnanganni'] },
  malabarSpinach:{ name: 'Malabar spinach', kind: 'leafy', each: 250, is: ['malabar spinach', 'bachali', 'bachali kura', 'poi'] },
  drumstickLeaves:{ name: 'Drumstick leaves', kind: 'leafy', each: 150, is: ['drumstick leaves', 'moringa leaves', 'munaga aaku', 'munagaku', 'murungai keerai'] },
  mustardGreens: { name: 'Mustard greens', kind: 'leafy', each: 250, is: ['mustard greens', 'sarson', 'sarson ka saag', 'avalu aaku'] },
  dill:          { name: 'Dill', kind: 'herb', each: 100, is: ['dill', 'sabsige', 'shepu', 'soya'] },
  lettuce:       { name: 'Lettuce', kind: 'leafy', each: 250, is: ['lettuce'] },

  // ── herbs and aromatics ──────────────────────────────────────────────────────────────────────
  coriander:     { name: 'Coriander', kind: 'herb', each: 100, is: ['coriander', 'coriander leaves', 'kothimeera', 'kothimira', 'dhania', 'dhaniya', 'cilantro', 'kothamalli'], not: ['powder', 'seeds', 'dhaniyalu'] },
  mint:          { name: 'Mint', kind: 'herb', each: 100, is: ['mint', 'pudina', 'pudhina'] },
  curryLeaves:   { name: 'Curry leaves', kind: 'herb', each: 50, is: ['curry leaves', 'curry leaf', 'karivepaku', 'kadi patta', 'kadi patta', 'karuveppilai'] },
  chilli:        { name: 'Green chilli', kind: 'aromatic', is: ['green chilli', 'green chillies', 'green chili', 'chilli', 'chillies', 'pachimirchi', 'pachi mirchi', 'hari mirch', 'mirchi'], not: ['red', 'powder', 'dry', 'endu mirchi', 'capsicum', 'shimla', 'bajji mirchi'] },
  bajjiChilli:   { name: 'Bajji chilli', kind: 'veg', is: ['bajji mirchi', 'bajji chilli', 'banana pepper', 'mirchi bajji chilli'] },
  ginger:        { name: 'Ginger', kind: 'aromatic', is: ['ginger', 'allam', 'adrak', 'inji'] },
  garlic:        { name: 'Garlic', kind: 'aromatic', is: ['garlic', 'velluli', 'vellulli', 'lehsun', 'lahsun', 'poondu'] },
  lemon:         { name: 'Lemon', kind: 'aromatic', each: 50, is: ['lemon', 'lemons', 'nimmakaya', 'nimbu', 'lime', 'elumichai'] },

  // ── fruit ────────────────────────────────────────────────────────────────────────────────────
  banana:        { name: 'Banana', kind: 'fruit', dozen: 1400, is: ['banana', 'bananas', 'arati pandu', 'aratipandu', 'kela'], not: ['raw', 'aratikaya', 'kaccha'] },
  papaya:        { name: 'Papaya', kind: 'fruit', each: 1000, is: ['papaya', 'boppayi', 'papita'] },
  guava:         { name: 'Guava', kind: 'fruit', is: ['guava', 'jama', 'amrood', 'jama pandu'] },
  pomegranate:   { name: 'Pomegranate', kind: 'fruit', is: ['pomegranate', 'danimma', 'anar'] },
  grapes:        { name: 'Grapes', kind: 'fruit', is: ['grapes', 'green grapes', 'black grapes', 'draksha', 'angoor'] },
  mango:         { name: 'Mango', kind: 'fruit', each: 300, is: ['mango', 'mangoes', 'mamidi pandu', 'aam', 'banganapalli', 'alphonso'], not: ['raw', 'mamidikaya', 'kairi', 'green mango'] },
  apple:         { name: 'Apple', kind: 'fruit', each: 180, is: ['apple', 'apples', 'seb'], not: ['ice apple', 'custard', 'sitaphal', 'pine'] },
  orange:        { name: 'Orange', kind: 'fruit', each: 180, is: ['orange', 'oranges', 'santra', 'mosambi', 'sweet lime', 'battaya'] },
  pineapple:     { name: 'Pineapple', kind: 'fruit', each: 1200, is: ['pineapple', 'ananas'] },
  watermelon:    { name: 'Watermelon', kind: 'fruit', each: 3000, is: ['watermelon', 'puchakaya', 'tarbooz'] },
  muskmelon:     { name: 'Muskmelon', kind: 'fruit', each: 1000, is: ['muskmelon', 'kharbooja', 'kharbuja', 'cantaloupe'] },
  sapota:        { name: 'Sapota', kind: 'fruit', is: ['sapota', 'chikoo', 'chiku', 'sapota pandu'] },
  custardApple:  { name: 'Custard apple', kind: 'fruit', is: ['custard apple', 'sitaphal', 'seetha phalam'] },
  iceApple:      { name: 'Ice apple', kind: 'fruit', each: 250, is: ['ice apple', 'nungu', 'tadgola', 'munjalu', 'thati munjalu'] },
  dates:         { name: 'Dates', kind: 'fruit', pantry: true, is: ['dates', 'khajur', 'kharjuram'] },

  // ── sprouts, soaked ──────────────────────────────────────────────────────────────────────────
  moongSprouts:  { name: 'Moong sprouts', kind: 'sprout', each: 250, is: ['moong sprouts', 'green gram sprouts', 'molakalu', 'pesalu', 'pesara molakalu', 'sprouts'], not: ['chana', 'sanagalu'] },
  chanaSprouts:  { name: 'Kala chana sprouts', kind: 'sprout', each: 250, is: ['kala chana sprouts', 'black chana sprouts', 'chana sprouts', 'sanaga molakalu'] },
  soakedChana:   { name: 'Soaked chana', kind: 'sprout', each: 250, is: ['soaked chana', 'kabuli chana', 'chickpea', 'chickpeas', 'chole', 'chana', 'sanagalu'], not: ['sprouts', 'dal', 'pappu', 'flour', 'besan'] },
  soakedAlmonds: { name: 'Soaked almonds', kind: 'sprout', each: 100, is: ['soaked almonds', 'almonds', 'almond', 'badam'], not: ['milk', 'oil'] },

  // ── meat, fish, eggs ─────────────────────────────────────────────────────────────────────────
  chicken:       { name: 'Chicken', kind: 'meat', is: ['chicken', 'chicken curry cut', 'kodi', 'kodi mamsam', 'murgi', 'murgh'], not: ['egg', 'guddu', 'boneless', 'breast', 'mince', 'keema', 'liver', 'wings', 'drumsticks', 'leg'] },
  chickenBoneless:{ name: 'Boneless chicken', kind: 'meat', is: ['boneless chicken', 'chicken boneless', 'chicken breast', 'boneless'] },
  mutton:        { name: 'Mutton', kind: 'meat', is: ['mutton', 'mutton curry cut', 'mamsam', 'goat meat', 'goat', 'gosht', 'lamb'], not: ['keema', 'mince', 'paya', 'trotters', 'liver', 'boti', 'brain', 'kodi'] },
  keema:         { name: 'Keema', kind: 'meat', is: ['keema', 'kheema', 'mince', 'minced meat', 'mutton keema', 'chicken keema'] },
  paya:          { name: 'Paya', kind: 'meat', is: ['paya', 'trotters', 'kaalu', 'goat trotters'] },
  liver:         { name: 'Liver', kind: 'meat', is: ['liver', 'kaleja', 'kaarjam', 'boti'] },
  fish:          { name: 'Fish', kind: 'fish', is: ['fish', 'chepa', 'chepalu', 'machli', 'meen', 'rohu', 'katla', 'seer', 'vanjaram', 'pomfret', 'murrel', 'korameenu', 'mackerel', 'sardine', 'tilapia', 'basa', 'surmai', 'bangda'], not: ['dry fish', 'endu chepa'] },
  prawns:        { name: 'Prawns', kind: 'fish', is: ['prawns', 'prawn', 'shrimp', 'royyalu', 'jhinga', 'eral'] },
  crab:          { name: 'Crab', kind: 'fish', is: ['crab', 'crabs', 'peetha', 'peethalu', 'kekda', 'nandu'] },
  eggs:          { name: 'Eggs', kind: 'egg', dozen: 600, is: ['egg', 'eggs', 'guddu', 'gudlu', 'kodi guddu', 'natu kodi guddu', 'anda', 'ande', 'desi ande', 'muttai'], not: ['eggplant', 'egg plant'] },

  // ── dairy (often in the fridge; offered from the shelf if we sell it) ───────────────────────
  paneer:        { name: 'Paneer', kind: 'dairy', each: 200, pantry: true, is: ['paneer', 'cottage cheese', 'chhena'] },
  curd:          { name: 'Curd', kind: 'dairy', pantry: true, is: ['curd', 'yogurt', 'yoghurt', 'perugu', 'dahi', 'thayir'] },
  milk:          { name: 'Milk', kind: 'dairy', pantry: true, is: ['milk', 'palu', 'doodh', 'paal'], not: ['coconut milk', 'almond milk', 'condensed'] },
  cream:         { name: 'Fresh cream', kind: 'dairy', pantry: true, is: ['fresh cream', 'cream', 'malai'] },
  butter:        { name: 'Butter', kind: 'fat', pantry: true, is: ['butter', 'venna', 'makhan'], not: ['buttermilk', 'peanut'] },
  ghee:          { name: 'Ghee', kind: 'fat', pantry: true, is: ['ghee', 'neyyi', 'nei'] },
  buttermilk:    { name: 'Buttermilk', kind: 'dairy', pantry: true, is: ['buttermilk', 'majjiga', 'chaas', 'mor'] },
  khoya:         { name: 'Khoya', kind: 'dairy', pantry: true, is: ['khoya', 'khova', 'mawa', 'palakova'] },
  condensedMilk: { name: 'Condensed milk', kind: 'dairy', pantry: true, is: ['condensed milk', 'milkmaid'] },
  coconutMilk:   { name: 'Coconut milk', kind: 'dairy', pantry: true, is: ['coconut milk', 'kobbari palu'] },
  cheese:        { name: 'Cheese', kind: 'dairy', pantry: true, is: ['cheese', 'cheddar', 'mozzarella'], not: ['cottage'] },

  // ── grains, flours, breads ───────────────────────────────────────────────────────────────────
  rice:          { name: 'Rice', kind: 'grain', pantry: true, is: ['rice', 'biyyam', 'chawal', 'sona masoori', 'raw rice'], not: ['basmati', 'flour', 'rava', 'poha', 'atukulu', 'puffed', 'idli rice', 'parboiled'] },
  basmati:       { name: 'Basmati rice', kind: 'grain', pantry: true, is: ['basmati', 'basmati rice', 'biryani rice'] },
  idliRice:      { name: 'Idli rice', kind: 'grain', pantry: true, is: ['idli rice', 'parboiled rice', 'boiled rice'] },
  poha:          { name: 'Poha', kind: 'grain', pantry: true, is: ['poha', 'atukulu', 'aval', 'flattened rice', 'beaten rice'] },
  puffedRice:    { name: 'Puffed rice', kind: 'grain', pantry: true, is: ['puffed rice', 'murmura', 'borugulu', 'mandakki', 'pori'] },
  atta:          { name: 'Wheat flour', kind: 'grain', pantry: true, is: ['atta', 'wheat flour', 'godhuma pindi', 'chapati flour'] },
  maida:         { name: 'Maida', kind: 'grain', pantry: true, is: ['maida', 'all purpose flour', 'refined flour'] },
  rava:          { name: 'Rava', kind: 'grain', pantry: true, is: ['rava', 'sooji', 'suji', 'semolina', 'bombay rava', 'upma rava'], not: ['idli rava', 'rice rava'] },
  idliRava:      { name: 'Idli rava', kind: 'grain', pantry: true, is: ['idli rava', 'rice rava'] },
  besan:         { name: 'Besan', kind: 'grain', pantry: true, is: ['besan', 'gram flour', 'senaga pindi', 'chickpea flour'] },
  riceFlour:     { name: 'Rice flour', kind: 'grain', pantry: true, is: ['rice flour', 'biyyam pindi', 'chawal ka atta'] },
  cornflour:     { name: 'Cornflour', kind: 'grain', pantry: true, is: ['cornflour', 'corn flour', 'cornstarch', 'corn starch'] },
  ragi:          { name: 'Ragi flour', kind: 'grain', pantry: true, is: ['ragi', 'finger millet', 'nachni', 'ragi flour'] },
  jowar:         { name: 'Jowar flour', kind: 'grain', pantry: true, is: ['jowar', 'jonna', 'jonna pindi', 'sorghum'] },
  vermicelli:    { name: 'Vermicelli', kind: 'grain', pantry: true, is: ['vermicelli', 'semiya', 'sevai', 'seviyan'] },
  sago:          { name: 'Sago', kind: 'grain', pantry: true, is: ['sago', 'sabudana', 'saggubiyyam', 'javvarisi'] },
  bread:         { name: 'Bread / pav', kind: 'grain', pantry: true, is: ['bread', 'pav', 'bun', 'buns', 'ladi pav'] },
  oats:          { name: 'Oats', kind: 'grain', pantry: true, is: ['oats', 'rolled oats'] },

  // ── dals and pulses ──────────────────────────────────────────────────────────────────────────
  toorDal:       { name: 'Toor dal', kind: 'pulse', pantry: true, is: ['toor dal', 'tur dal', 'arhar', 'kandi pappu', 'kandipappu', 'pigeon pea'] },
  moongDal:      { name: 'Moong dal', kind: 'pulse', pantry: true, is: ['moong dal', 'pesara pappu', 'pesarapappu', 'green gram dal', 'yellow moong'], not: ['sprouts', 'molakalu'] },
  wholeMoong:    { name: 'Whole moong', kind: 'pulse', pantry: true, is: ['whole moong', 'green gram', 'pesalu', 'sabut moong'], not: ['sprouts', 'molakalu', 'dal', 'pappu'] },
  chanaDal:      { name: 'Chana dal', kind: 'pulse', pantry: true, is: ['chana dal', 'senaga pappu', 'bengal gram dal', 'kadalai paruppu'] },
  uradDal:       { name: 'Urad dal', kind: 'pulse', pantry: true, is: ['urad dal', 'minapappu', 'minappappu', 'black gram', 'ulundu'] },
  masoorDal:     { name: 'Masoor dal', kind: 'pulse', pantry: true, is: ['masoor dal', 'red lentils', 'masoor', 'erra kandi pappu'] },
  rajma:         { name: 'Rajma', kind: 'pulse', pantry: true, is: ['rajma', 'kidney beans', 'red kidney beans'] },
  kabuliChana:   { name: 'Kabuli chana (dry)', kind: 'pulse', pantry: true, is: ['kabuli chana dry', 'dry chickpeas', 'white chana', 'tella sanagalu'] },
  blackChana:    { name: 'Kala chana (dry)', kind: 'pulse', pantry: true, is: ['kala chana', 'black chana', 'nalla sanagalu', 'brown chana'], not: ['sprouts'] },
  horseGram:     { name: 'Horse gram', kind: 'pulse', pantry: true, is: ['horse gram', 'ulavalu', 'kulthi', 'kollu'] },
  peanuts:       { name: 'Peanuts', kind: 'pulse', pantry: true, is: ['peanuts', 'peanut', 'groundnut', 'groundnuts', 'palli', 'pallilu', 'verusenaga', 'moongphali'], not: ['oil', 'butter'] },
  roastedChana:  { name: 'Roasted chana', kind: 'pulse', pantry: true, is: ['roasted chana', 'putnalu', 'pottukadalai', 'roasted gram'] },

  // ── oils and fats ────────────────────────────────────────────────────────────────────────────
  oil:           { name: 'Cooking oil', kind: 'fat', pantry: true, is: ['oil', 'cooking oil', 'sunflower oil', 'groundnut oil', 'refined oil', 'nune'], not: ['coconut oil', 'mustard oil', 'sesame oil', 'gingelly'] },
  mustardOil:    { name: 'Mustard oil', kind: 'fat', pantry: true, is: ['mustard oil', 'sarson ka tel'] },
  coconutOil:    { name: 'Coconut oil', kind: 'fat', pantry: true, is: ['coconut oil', 'kobbari nune'] },
  sesameOil:     { name: 'Sesame oil', kind: 'fat', pantry: true, is: ['sesame oil', 'gingelly oil', 'nuvvula nune', 'til ka tel'] },

  // ── spices and seasonings ────────────────────────────────────────────────────────────────────
  salt:          { name: 'Salt', kind: 'spice', pantry: true, is: ['salt', 'uppu', 'namak'] },
  turmeric:      { name: 'Turmeric', kind: 'spice', pantry: true, is: ['turmeric', 'pasupu', 'haldi', 'manjal'] },
  chilliPowder:  { name: 'Red chilli powder', kind: 'spice', pantry: true, is: ['red chilli powder', 'chilli powder', 'karam', 'lal mirch', 'mirchi powder'] },
  dryChilli:     { name: 'Dry red chillies', kind: 'spice', pantry: true, is: ['dry red chilli', 'dry red chillies', 'dry chilli', 'endu mirchi', 'endu mirapakayalu', 'sukhi lal mirch', 'red chillies'] },
  corianderPowder:{ name: 'Coriander powder', kind: 'spice', pantry: true, is: ['coriander powder', 'dhaniya powder', 'dhaniyala podi'] },
  corianderSeeds:{ name: 'Coriander seeds', kind: 'spice', pantry: true, is: ['coriander seeds', 'dhaniyalu', 'sabut dhania'] },
  cumin:         { name: 'Cumin', kind: 'spice', pantry: true, is: ['cumin', 'jeera', 'jeelakarra', 'jeera seeds'] },
  mustardSeeds:  { name: 'Mustard seeds', kind: 'spice', pantry: true, is: ['mustard seeds', 'avalu', 'rai', 'sarson seeds', 'kadugu'] },
  fenugreekSeeds:{ name: 'Fenugreek seeds', kind: 'spice', pantry: true, is: ['fenugreek seeds', 'menthulu', 'methi seeds', 'methi dana'] },
  kasuriMethi:   { name: 'Kasuri methi', kind: 'spice', pantry: true, is: ['kasuri methi', 'dried fenugreek leaves'] },
  hing:          { name: 'Hing', kind: 'spice', pantry: true, is: ['hing', 'asafoetida', 'inguva', 'perungayam'] },
  garamMasala:   { name: 'Garam masala', kind: 'spice', pantry: true, is: ['garam masala'] },
  biryaniMasala: { name: 'Biryani masala', kind: 'spice', pantry: true, is: ['biryani masala', 'shahi masala'] },
  sambarPowder:  { name: 'Sambar powder', kind: 'spice', pantry: true, is: ['sambar powder', 'sambar masala'] },
  rasamPowder:   { name: 'Rasam powder', kind: 'spice', pantry: true, is: ['rasam powder', 'charu podi'] },
  chaatMasala:   { name: 'Chaat masala', kind: 'spice', pantry: true, is: ['chaat masala'] },
  pavBhajiMasala:{ name: 'Pav bhaji masala', kind: 'spice', pantry: true, is: ['pav bhaji masala'] },
  cholePowder:   { name: 'Chole masala', kind: 'spice', pantry: true, is: ['chole masala', 'chana masala powder'] },
  pepper:        { name: 'Black pepper', kind: 'spice', pantry: true, is: ['black pepper', 'pepper', 'miriyalu', 'kali mirch', 'peppercorns'], not: ['bell pepper', 'banana pepper'] },
  cardamom:      { name: 'Cardamom', kind: 'spice', pantry: true, is: ['cardamom', 'elaichi', 'yalakulu', 'elakkai'] },
  cloves:        { name: 'Cloves', kind: 'spice', pantry: true, is: ['cloves', 'clove', 'lavangalu', 'laung'] },
  cinnamon:      { name: 'Cinnamon', kind: 'spice', pantry: true, is: ['cinnamon', 'dalchini', 'dalchina chekka'] },
  bayLeaf:       { name: 'Bay leaf', kind: 'spice', pantry: true, is: ['bay leaf', 'bay leaves', 'tej patta', 'biryani aaku'] },
  fennel:        { name: 'Fennel seeds', kind: 'spice', pantry: true, is: ['fennel', 'fennel seeds', 'saunf', 'sompu'] },
  ajwain:        { name: 'Ajwain', kind: 'spice', pantry: true, is: ['ajwain', 'carom seeds', 'vamu'] },
  sesame:        { name: 'Sesame seeds', kind: 'spice', pantry: true, is: ['sesame seeds', 'sesame', 'nuvvulu', 'til'], not: ['oil'] },
  poppySeeds:    { name: 'Poppy seeds', kind: 'spice', pantry: true, is: ['poppy seeds', 'khus khus', 'gasagasalu', 'posto'] },
  saffron:       { name: 'Saffron', kind: 'spice', pantry: true, is: ['saffron', 'kesar', 'kumkuma puvvu'] },
  amchur:        { name: 'Amchur', kind: 'spice', pantry: true, is: ['amchur', 'dry mango powder'] },
  kashmiriChilli:{ name: 'Kashmiri chilli powder', kind: 'spice', pantry: true, is: ['kashmiri chilli', 'kashmiri chilli powder', 'kashmiri mirch'] },
  panchPhoron:   { name: 'Panch phoron', kind: 'spice', pantry: true, is: ['panch phoron', 'five spice'] },
  kalonji:       { name: 'Nigella seeds', kind: 'spice', pantry: true, is: ['kalonji', 'nigella seeds', 'onion seeds'] },
  rosewater:     { name: 'Rose water', kind: 'spice', pantry: true, is: ['rose water', 'gulab jal'] },
  kewra:         { name: 'Kewra water', kind: 'spice', pantry: true, is: ['kewra', 'kewra water'] },

  // ── sweeteners, sours, nuts, others ──────────────────────────────────────────────────────────
  tamarind:      { name: 'Tamarind', kind: 'other', pantry: true, is: ['tamarind', 'chintapandu', 'imli', 'puli'] },
  jaggery:       { name: 'Jaggery', kind: 'other', pantry: true, is: ['jaggery', 'bellam', 'gur', 'vellam'] },
  sugar:         { name: 'Sugar', kind: 'other', pantry: true, is: ['sugar', 'panchadara', 'cheeni', 'chini'] },
  cashews:       { name: 'Cashews', kind: 'other', pantry: true, is: ['cashew', 'cashews', 'kaju', 'jeedipappu', 'munthiri'] },
  raisins:       { name: 'Raisins', kind: 'other', pantry: true, is: ['raisins', 'kishmish', 'kismis', 'endu draksha'] },
  driedCoconut:  { name: 'Dry coconut', kind: 'other', pantry: true, is: ['dry coconut', 'desiccated coconut', 'copra', 'endu kobbari'] },
  gingerGarlicPaste: { name: 'Ginger-garlic paste', kind: 'other', pantry: true, is: ['ginger garlic paste', 'allam vellulli paste'] },
  vinegar:       { name: 'Vinegar', kind: 'other', pantry: true, is: ['vinegar'] },
  soySauce:      { name: 'Soy sauce', kind: 'other', pantry: true, is: ['soy sauce', 'soya sauce'] },
  tomatoKetchup: { name: 'Tomato ketchup', kind: 'other', pantry: true, is: ['ketchup', 'tomato ketchup', 'tomato sauce'] },
  noodles:       { name: 'Noodles', kind: 'grain', pantry: true, is: ['noodles', 'hakka noodles'] },
  pickle:        { name: 'Pickle', kind: 'other', pantry: true, is: ['pickle', 'avakaya', 'achar', 'pachadi pickle'] },
  papad:         { name: 'Papad', kind: 'other', pantry: true, is: ['papad', 'appadam', 'papadum'] },
  bakingSoda:    { name: 'Baking soda', kind: 'other', pantry: true, is: ['baking soda', 'soda', 'cooking soda', 'eno'] },
  yeast:         { name: 'Yeast', kind: 'other', pantry: true, is: ['yeast'] },
};

/** Every ingredient key, for authors and tests. */
export const ING_KEYS = Object.keys(ING);
