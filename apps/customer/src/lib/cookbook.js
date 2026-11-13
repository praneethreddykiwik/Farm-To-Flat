/**
 * "What are you cooking?" — from the name of a dish to the things on our shelf that go into it.
 *
 * A written cookbook, not a model asked to improvise. Three reasons:
 *  - it answers at once, with the phone offline, and costs nothing per question;
 *  - it can only ever suggest what is actually in today's catalogue, because it works by matching
 *    its ingredients against the catalogue it is handed;
 *  - every line a shopper reads here was written by a person and can be checked. A model asked why
 *    spinach is good for you will happily say things no food business is allowed to say.
 *
 * So the words about TASTE are here, one line per ingredient per dish. The words about NUTRITION
 * are not here at all: they are the product's own computed badge ("Naturally high in vitamin A"),
 * worked out on the server from published composition data against the FSSAI thresholds, and shown
 * as-is beside the line.
 *
 * Each dish lists what it NEEDS and what makes it BETTER. A dish it has never heard of is not a
 * dead end: if the words name something we sell ("beetroot fry") it builds the dish around that;
 * failing that it offers the base most everyday curries start from, and says that is what it is.
 *
 * Pure. No React, no network.
 */

/**
 * An ingredient, and how to recognise it among product names and aliases (lower-cased substrings).
 * `not` keeps "onion" from claiming "spring onion", and "spinach" from "malabar spinach".
 */
const ING = {
  tomato: { is: ['tomato', 'tamata', 'tamatar'] },
  onion: { is: ['onion', 'ullipaya', 'pyaz'], not: ['spring', 'ullikadalu'] },
  springOnion: { is: ['spring onion', 'ullikadalu'] },
  chilli: { is: ['green chilli', 'chilli', 'pachimirchi', 'mirch'] },
  ginger: { is: ['ginger', 'allam', 'adrak'] },
  garlic: { is: ['garlic', 'velluli', 'lehsun'] },
  coriander: { is: ['coriander', 'kothimeera', 'dhania'] },
  mint: { is: ['mint', 'pudina'] },
  curryLeaves: { is: ['curry leaves', 'karivepaku', 'kadi patta'] },
  lemon: { is: ['lemon', 'nimmakaya', 'nimbu'] },
  potato: { is: ['potato', 'bangaladumpa', 'aloo'] },
  carrot: { is: ['carrot', 'gajar'] },
  peas: { is: ['green peas', 'peas', 'matar', 'batani'] },
  beans: { is: ['french beans'] },
  broadBeans: { is: ['broad beans', 'chikkudukaya'] },
  clusterBeans: { is: ['cluster beans', 'goruchikkudu'] },
  drumstick: { is: ['drumstick', 'munakkaya'], not: ['leaves'] },
  brinjal: { is: ['brinjal', 'vankaya', 'baingan', 'eggplant'] },
  okra: { is: ["lady's finger", 'ladies finger', 'bendakaya', 'bhindi', 'okra'] },
  cauliflower: { is: ['cauliflower', 'gobi'], not: ['patta'] },
  cabbage: { is: ['cabbage'] },
  bottleGourd: { is: ['bottle gourd', 'sorakaya', 'lauki'] },
  ridgeGourd: { is: ['ridge gourd', 'beerakaya', 'turai'] },
  bitterGourd: { is: ['bitter gourd', 'kakarakaya', 'karela'] },
  snakeGourd: { is: ['snake gourd', 'potlakaya'] },
  pumpkin: { is: ['pumpkin', 'gummadikaya', 'kaddu'] },
  cucumber: { is: ['cucumber', 'dosakaya', 'kheera'] },
  radish: { is: ['radish', 'mullangi', 'mooli'] },
  beetroot: { is: ['beetroot', 'chukandar'] },
  spinach: { is: ['spinach', 'palakura', 'palak'], not: ['malabar'] },
  methi: { is: ['fenugreek', 'menthikura', 'methi'] },
  gongura: { is: ['roselle', 'gongura', 'sorrel'] },
  amaranth: { is: ['amaranth', 'thotakura'] },
  drumstickLeaves: { is: ['drumstick leaves', 'moringa leaves'] },
  dill: { is: ['dill'] },
  chicken: { is: ['chicken', 'kodi'], not: ['egg', 'guddu'] },
  mutton: { is: ['mutton curry', 'mamsam', 'goat meat'] },
  keema: { is: ['keema', 'mince'] },
  paya: { is: ['paya', 'trotters'] },
  fish: { is: ['fish', 'chepalu', 'rohu'] },
  prawns: { is: ['prawn', 'royyalu', 'jhinga'] },
  eggs: { is: ['egg', 'guddu', 'desi ande'], not: ['eggplant'] },
  pomegranate: { is: ['pomegranate', 'danimma', 'anar'] },
  banana: { is: ['banana', 'arati'] },
  papaya: { is: ['papaya', 'boppayi'] },
  guava: { is: ['guava', 'jama'] },
  grapes: { is: ['grapes', 'draksha'] },
  lettuce: { is: ['lettuce'] },
};

/** Lines used again and again, so the same ingredient reads the same way across dishes. */
const W = {
  onionBase: 'Browned slowly, it is the body of the gravy.',
  tomatoBase: 'Cooks down into the gravy and gives it its tang.',
  chilli: 'Fresh heat — slit it and let it fry in the oil.',
  ginger: 'A little, crushed, lifts the whole pot.',
  garlic: 'Crushed into the oil first; the smell is half the dish.',
  gg: 'Pounded with garlic into the paste every gravy starts from.',
  coriander: 'Torn over the top just before serving.',
  curryLeaves: 'Crackled in hot oil for the tempering.',
  lemon: 'A squeeze at the end wakes everything up.',
  mint: 'A handful makes it smell like a feast.',
};

/**
 * @typedef {{ key: string, why: string, alt?: boolean }} Part
 * `alt`: one of several a dish can be built on (a gourd curry is made with ONE gourd). Only the one
 * the shopper named is offered — or, if they named none, the first we have.
 * @typedef {{ id: string, name: string, say: string[], needs: Part[], better: Part[] }} Dish
 * `say`: lower-case words and phrases a shopper might type, in English or romanised Telugu/Hindi.
 * @type {Dish[]}
 */
// prettier-ignore
export const DISHES = [
  { id: 'tomato_curry', name: 'Tomato curry', say: ['tomato curry', 'tamata kura', 'tomato kura', 'tamatar sabzi', 'tomato gravy', 'tomato'],
    needs: [ { key: 'tomato', why: 'The dish itself — ripe ones, about two per person.' }, { key: 'onion', why: W.onionBase }, { key: 'chilli', why: W.chilli }, { key: 'curryLeaves', why: W.curryLeaves } ],
    better: [ { key: 'garlic', why: 'A few crushed cloves make it taste slow-cooked.' }, { key: 'ginger', why: W.ginger }, { key: 'coriander', why: W.coriander }, { key: 'drumstick', why: 'Simmered in the gravy, it soaks up the tang.' }, { key: 'eggs', why: 'Boiled and dropped in, it becomes a full meal.' } ] },
  { id: 'tomato_dal', name: 'Tomato pappu', say: ['tomato pappu', 'tamata pappu', 'tomato dal', 'pappu', 'dal', 'dal tadka', 'dal fry'],
    needs: [ { key: 'tomato', why: 'Cooked soft with the dal for its sour-sweet body.' }, { key: 'chilli', why: W.chilli }, { key: 'curryLeaves', why: W.curryLeaves }, { key: 'garlic', why: 'Fried golden in the tempering — do not skip it.' } ],
    better: [ { key: 'onion', why: 'Softened with the dal for a little sweetness.' }, { key: 'coriander', why: W.coriander }, { key: 'spinach', why: 'A bunch stirred in turns it into palak pappu.' }, { key: 'lemon', why: W.lemon } ] },
  { id: 'palak_dal', name: 'Palak pappu', say: ['palak pappu', 'palakura pappu', 'palak dal', 'spinach dal', 'dal palak', 'spinach'],
    needs: [ { key: 'spinach', why: 'A whole bunch — it cooks down to almost nothing.' }, { key: 'tomato', why: 'Gives the dal its tang.' }, { key: 'garlic', why: 'Fried golden in the tempering.' }, { key: 'chilli', why: W.chilli } ],
    better: [ { key: 'onion', why: 'Softened in for sweetness.' }, { key: 'curryLeaves', why: W.curryLeaves }, { key: 'lemon', why: W.lemon } ] },
  { id: 'gongura_dal', name: 'Gongura pappu', say: ['gongura pappu', 'gongura', 'gongura dal', 'sorrel', 'gongura pachadi', 'gongura chutney'],
    needs: [ { key: 'gongura', why: 'The sour leaf the dish is named for.' }, { key: 'chilli', why: 'Gongura wants real heat beside it.' }, { key: 'garlic', why: 'Plenty, fried in the tempering.' }, { key: 'onion', why: 'Raw on the side, the way it is eaten at home.' } ],
    better: [ { key: 'curryLeaves', why: W.curryLeaves }, { key: 'mutton', why: 'Cooked with gongura, it is the famous Andhra curry.' }, { key: 'chicken', why: 'Gongura chicken, for a Sunday.' } ] },
  { id: 'sambar', name: 'Sambar', say: ['sambar', 'sambhar', 'sambaar'],
    needs: [ { key: 'drumstick', why: 'The vegetable that makes it taste like sambar.' }, { key: 'tomato', why: 'For the sour-sweet base.' }, { key: 'onion', why: 'Small pieces, left a little firm.' }, { key: 'curryLeaves', why: W.curryLeaves } ],
    better: [ { key: 'carrot', why: 'A touch of sweetness against the tamarind.' }, { key: 'brinjal', why: 'Goes soft and drinks the sambar.' }, { key: 'pumpkin', why: 'Melts in and thickens it.' }, { key: 'radish', why: 'The classic mullangi sambar.' }, { key: 'okra', why: 'Fried first, then dropped in.' }, { key: 'coriander', why: W.coriander } ] },
  { id: 'rasam', name: 'Rasam', say: ['rasam', 'charu', 'chaaru', 'saaru', 'tomato rasam'],
    needs: [ { key: 'tomato', why: 'Crushed by hand into the water.' }, { key: 'garlic', why: 'Pounded with pepper — the heart of rasam.' }, { key: 'curryLeaves', why: W.curryLeaves }, { key: 'coriander', why: 'Stems and all, right at the end.' } ],
    better: [ { key: 'chilli', why: W.chilli }, { key: 'ginger', why: 'For a rasam that clears a cold.' }, { key: 'lemon', why: 'Instead of tamarind, for a lighter one.' } ] },
  { id: 'chicken_curry', name: 'Chicken curry', say: ['chicken curry', 'kodi kura', 'chicken', 'chicken gravy', 'chicken masala', 'kodi pulusu', 'butter chicken', 'chicken fry', 'kodi vepudu'],
    needs: [ { key: 'chicken', why: 'Curry cut, on the bone, for the best gravy.' }, { key: 'onion', why: W.onionBase }, { key: 'tomato', why: W.tomatoBase }, { key: 'ginger', why: W.gg }, { key: 'garlic', why: 'Half the ginger-garlic paste.' }, { key: 'chilli', why: W.chilli } ],
    better: [ { key: 'coriander', why: W.coriander }, { key: 'curryLeaves', why: 'Fried crisp on top, Andhra style.' }, { key: 'mint', why: W.mint }, { key: 'lemon', why: W.lemon }, { key: 'potato', why: 'Stretches the curry and drinks the gravy.' } ] },
  { id: 'mutton_curry', name: 'Mutton curry', say: ['mutton curry', 'mamsam kura', 'mutton', 'mutton gravy', 'mamsam', 'mutton fry', 'goat curry'],
    needs: [ { key: 'mutton', why: 'Curry cut — let it cook low and long.' }, { key: 'onion', why: 'A lot of it; it melts into the gravy.' }, { key: 'ginger', why: W.gg }, { key: 'garlic', why: 'Mutton can take plenty.' }, { key: 'tomato', why: W.tomatoBase } ],
    better: [ { key: 'chilli', why: W.chilli }, { key: 'mint', why: W.mint }, { key: 'coriander', why: W.coriander }, { key: 'potato', why: 'Soaks up the gravy better than the meat does.' }, { key: 'gongura', why: 'Turns it into gongura mamsam.' } ] },
  { id: 'biryani', name: 'Biryani', say: ['biryani', 'biriyani', 'chicken biryani', 'mutton biryani', 'dum biryani', 'pulao', 'pulav', 'bagara rice'],
    needs: [ { key: 'onion', why: 'Sliced thin and fried dark — the birista.' }, { key: 'mint', why: 'Layered through the rice; there is no biryani without it.' }, { key: 'coriander', why: 'Layered with the mint.' }, { key: 'ginger', why: W.gg }, { key: 'garlic', why: 'For the marinade.' }, { key: 'chilli', why: 'Slit, into the marinade.' } ],
    better: [ { key: 'chicken', why: 'For chicken dum biryani.' }, { key: 'mutton', why: 'For the real Hyderabadi one.' }, { key: 'lemon', why: 'Squeezed over each plate.' }, { key: 'tomato', why: 'A couple, for a softer masala.' }, { key: 'cucumber', why: 'For the raita on the side.' }, { key: 'eggs', why: 'Boiled, one on every plate.' } ] },
  { id: 'veg_biryani', name: 'Vegetable biryani', say: ['veg biryani', 'vegetable biryani', 'veg pulao', 'vegetable pulao', 'veg pulav', 'fried rice', 'veg fried rice'],
    needs: [ { key: 'carrot', why: 'Diced, for colour and sweetness.' }, { key: 'beans', why: 'Cut small so they stay crisp.' }, { key: 'peas', why: 'A handful through the rice.' }, { key: 'onion', why: 'Fried dark for the top.' }, { key: 'mint', why: 'Layered through the rice.' } ],
    better: [ { key: 'potato', why: 'Cubed and fried first.' }, { key: 'cauliflower', why: 'Small florets hold the masala.' }, { key: 'coriander', why: W.coriander }, { key: 'chilli', why: W.chilli }, { key: 'springOnion', why: 'For fried rice, stirred in at the end.' }, { key: 'cucumber', why: 'For the raita on the side.' } ] },
  { id: 'keema', name: 'Keema curry', say: ['keema', 'kheema', 'qeema', 'keema curry', 'keema matar', 'mince'],
    needs: [ { key: 'keema', why: 'Fresh mince — cook it until the oil comes out.' }, { key: 'onion', why: W.onionBase }, { key: 'ginger', why: W.gg }, { key: 'garlic', why: 'Half the paste.' }, { key: 'tomato', why: W.tomatoBase } ],
    better: [ { key: 'peas', why: 'Keema matar — the classic pairing.' }, { key: 'chilli', why: W.chilli }, { key: 'mint', why: W.mint }, { key: 'coriander', why: W.coriander }, { key: 'potato', why: 'Aloo keema stretches it for a crowd.' }, { key: 'lemon', why: W.lemon } ] },
  { id: 'paya', name: 'Paya soup', say: ['paya', 'paya soup', 'paya curry', 'trotters'],
    needs: [ { key: 'paya', why: 'Simmered for hours until the broth turns silky.' }, { key: 'onion', why: 'For the base of the broth.' }, { key: 'ginger', why: 'Generous — it is what makes paya warming.' }, { key: 'garlic', why: 'Pounded with the ginger.' } ],
    better: [ { key: 'chilli', why: W.chilli }, { key: 'coriander', why: W.coriander }, { key: 'mint', why: 'A few leaves in the bowl.' }, { key: 'lemon', why: 'Squeezed in at the table.' } ] },
  { id: 'fish_curry', name: 'Fish pulusu', say: ['fish curry', 'chepala pulusu', 'fish pulusu', 'fish', 'meen curry', 'fish fry', 'chepa'],
    needs: [ { key: 'fish', why: 'Thick slices, slipped in only at the end.' }, { key: 'onion', why: 'Ground or sliced, for the pulusu.' }, { key: 'tomato', why: 'With tamarind, the sour of the gravy.' }, { key: 'chilli', why: W.chilli }, { key: 'curryLeaves', why: W.curryLeaves } ],
    better: [ { key: 'garlic', why: W.garlic }, { key: 'ginger', why: 'Rubbed on the fish with turmeric first.' }, { key: 'coriander', why: W.coriander }, { key: 'lemon', why: 'For a fish fry, squeezed over while hot.' }, { key: 'drumstick', why: 'Cooked in the pulusu, coastal style.' } ] },
  { id: 'prawn_curry', name: 'Prawn curry', say: ['prawn curry', 'prawns', 'royyala kura', 'royyalu', 'prawn fry', 'prawn masala', 'shrimp'],
    needs: [ { key: 'prawns', why: 'Two minutes in the pan — no more.' }, { key: 'onion', why: W.onionBase }, { key: 'tomato', why: W.tomatoBase }, { key: 'garlic', why: 'Prawns and garlic belong together.' }, { key: 'chilli', why: W.chilli } ],
    better: [ { key: 'ginger', why: W.ginger }, { key: 'curryLeaves', why: W.curryLeaves }, { key: 'coriander', why: W.coriander }, { key: 'lemon', why: W.lemon } ] },
  { id: 'egg_curry', name: 'Egg curry', say: ['egg curry', 'guddu kura', 'anda curry', 'egg pulusu', 'egg', 'eggs', 'egg masala', 'omelette', 'omelet', 'egg burji', 'bhurji', 'egg fry'],
    needs: [ { key: 'eggs', why: 'Country eggs — boiled, scored and fried a little first.' }, { key: 'onion', why: W.onionBase }, { key: 'tomato', why: W.tomatoBase }, { key: 'chilli', why: W.chilli } ],
    better: [ { key: 'ginger', why: W.gg }, { key: 'garlic', why: W.garlic }, { key: 'coriander', why: W.coriander }, { key: 'curryLeaves', why: W.curryLeaves }, { key: 'springOnion', why: 'Chopped into an omelette or burji.' } ] },
  { id: 'aloo_curry', name: 'Aloo curry', say: ['aloo curry', 'potato curry', 'aloo', 'potato', 'bangaladumpa', 'aloo fry', 'potato fry', 'aloo sabzi', 'dum aloo', 'aloo kurma'],
    needs: [ { key: 'potato', why: 'The dish itself — waxy ones hold their shape.' }, { key: 'onion', why: W.onionBase }, { key: 'tomato', why: W.tomatoBase }, { key: 'chilli', why: W.chilli } ],
    better: [ { key: 'peas', why: 'Aloo matar — sweet against the potato.' }, { key: 'cauliflower', why: 'Makes it aloo gobi.' }, { key: 'methi', why: 'Aloo methi: a little bitter, very good.' }, { key: 'curryLeaves', why: W.curryLeaves }, { key: 'coriander', why: W.coriander }, { key: 'ginger', why: W.ginger } ] },
  { id: 'aloo_gobi', name: 'Aloo gobi', say: ['aloo gobi', 'gobi', 'cauliflower', 'cauliflower curry', 'gobi fry', 'gobi masala', 'gobi manchurian'],
    needs: [ { key: 'cauliflower', why: 'Small florets, fried until the edges brown.' }, { key: 'potato', why: 'Cubed to cook in the same time.' }, { key: 'onion', why: W.onionBase }, { key: 'tomato', why: 'Just enough to coat, not to drown.' } ],
    better: [ { key: 'ginger', why: 'Slivers on top — the proper finish.' }, { key: 'chilli', why: W.chilli }, { key: 'peas', why: 'For sweetness and colour.' }, { key: 'coriander', why: W.coriander }, { key: 'springOnion', why: 'For gobi manchurian.' } ] },
  { id: 'bhindi', name: 'Bendakaya fry', say: ['bhindi', 'bendakaya', 'bhindi fry', 'bendakaya fry', 'okra', 'ladies finger', 'lady finger', 'bendakaya vepudu', 'bhindi masala'],
    needs: [ { key: 'okra', why: 'Wiped dry before cutting, so it fries instead of going slimy.' }, { key: 'onion', why: 'Sliced, fried alongside until sweet.' }, { key: 'chilli', why: W.chilli } ],
    better: [ { key: 'curryLeaves', why: W.curryLeaves }, { key: 'garlic', why: 'Crushed in for the last minute.' }, { key: 'tomato', why: 'For a bhindi masala instead of a dry fry.' }, { key: 'lemon', why: 'A squeeze keeps it bright.' } ] },
  { id: 'brinjal', name: 'Vankaya curry', say: ['brinjal', 'vankaya', 'brinjal curry', 'vankaya kura', 'gutti vankaya', 'baingan', 'baingan bharta', 'eggplant', 'bagara baingan'],
    needs: [ { key: 'brinjal', why: 'Small ones, slit in four for the masala.' }, { key: 'onion', why: 'Ground into the stuffing or fried for the gravy.' }, { key: 'tomato', why: W.tomatoBase }, { key: 'chilli', why: W.chilli } ],
    better: [ { key: 'garlic', why: W.garlic }, { key: 'ginger', why: W.ginger }, { key: 'curryLeaves', why: W.curryLeaves }, { key: 'coriander', why: W.coriander }, { key: 'potato', why: 'Vankaya-aloo, the everyday version.' } ] },
  { id: 'mixed_veg', name: 'Mixed vegetable curry', say: ['mixed veg', 'mixed vegetable', 'vegetable curry', 'veg curry', 'kurma', 'veg kurma', 'korma', 'sabzi', 'sabji', 'curry', 'kura', 'koora'],
    needs: [ { key: 'potato', why: 'The one that holds the curry together.' }, { key: 'carrot', why: 'Sweetness and colour.' }, { key: 'beans', why: 'Cut short; they keep a little bite.' }, { key: 'onion', why: W.onionBase }, { key: 'tomato', why: W.tomatoBase } ],
    better: [ { key: 'peas', why: 'A handful near the end.' }, { key: 'cauliflower', why: 'Florets hold the masala.' }, { key: 'ginger', why: W.gg }, { key: 'garlic', why: W.garlic }, { key: 'chilli', why: W.chilli }, { key: 'coriander', why: W.coriander }, { key: 'mint', why: 'In a kurma, it is the difference.' } ] },
  { id: 'drumstick', name: 'Munakkaya curry', say: ['drumstick', 'munakkaya', 'drumstick curry', 'munakkaya kura', 'mulakkada'],
    needs: [ { key: 'drumstick', why: 'Cut finger-length; cook until you can scrape it with your teeth.' }, { key: 'tomato', why: 'Drumstick and tomato are the classic pair.' }, { key: 'onion', why: W.onionBase }, { key: 'chilli', why: W.chilli } ],
    better: [ { key: 'curryLeaves', why: W.curryLeaves }, { key: 'garlic', why: W.garlic }, { key: 'potato', why: 'Makes it a fuller curry.' }, { key: 'coriander', why: W.coriander } ] },
  { id: 'gourd', name: 'Sorakaya curry', say: ['bottle gourd', 'sorakaya', 'lauki', 'sorakaya kura', 'anapakaya', 'ridge gourd', 'beerakaya', 'turai', 'beerakaya kura', 'snake gourd', 'potlakaya'],
    needs: [ { alt: true, key: 'bottleGourd', why: 'Peeled and cubed; it cooks soft in minutes.' }, { alt: true, key: 'ridgeGourd', why: 'Beerakaya — ridges scraped, then sliced.' }, { alt: true, key: 'snakeGourd', why: 'Potlakaya — sliced into rings.' }, { key: 'onion', why: 'Softened first for sweetness.' }, { key: 'chilli', why: W.chilli }, { key: 'curryLeaves', why: W.curryLeaves } ],
    better: [ { key: 'tomato', why: 'A little, so a mild gourd has something to hold on to.' }, { key: 'garlic', why: W.garlic }, { key: 'coriander', why: W.coriander } ] },
  { id: 'karela', name: 'Kakarakaya fry', say: ['bitter gourd', 'kakarakaya', 'karela', 'kakarakaya fry', 'karela fry', 'kakarakaya vepudu'],
    needs: [ { key: 'bitterGourd', why: 'Sliced thin and salted first to draw the bitterness.' }, { key: 'onion', why: 'A lot of it — its sweetness balances the bitter.' }, { key: 'chilli', why: W.chilli } ],
    better: [ { key: 'garlic', why: W.garlic }, { key: 'curryLeaves', why: W.curryLeaves }, { key: 'lemon', why: 'Sour takes the edge off bitter.' }, { key: 'potato', why: 'Fried with it, for those who find it too bitter.' } ] },
  { id: 'cabbage', name: 'Cabbage fry', say: ['cabbage', 'cabbage fry', 'cabbage curry', 'patta gobi', 'cabbage poriyal', 'cabbage vepudu'],
    needs: [ { key: 'cabbage', why: 'Shredded fine; cook it fast so it stays crisp.' }, { key: 'chilli', why: W.chilli }, { key: 'curryLeaves', why: W.curryLeaves }, { key: 'onion', why: 'A little, for sweetness.' } ],
    better: [ { key: 'carrot', why: 'Grated in for colour.' }, { key: 'peas', why: 'The classic cabbage-matar.' }, { key: 'ginger', why: W.ginger }, { key: 'coriander', why: W.coriander }, { key: 'lemon', why: W.lemon } ] },
  { id: 'root_fry', name: 'Carrot & beetroot fry', say: ['carrot', 'carrot fry', 'beetroot', 'beetroot fry', 'beetroot curry', 'carrot curry', 'gajar', 'carrot halwa', 'gajar halwa', 'radish', 'mullangi'],
    needs: [ { alt: true, key: 'carrot', why: 'Diced small, cooked just until tender.' }, { alt: true, key: 'beetroot', why: 'Diced small — it stains everything a good colour.' }, { key: 'onion', why: 'For the base.' }, { key: 'chilli', why: W.chilli }, { key: 'curryLeaves', why: W.curryLeaves } ],
    better: [ { key: 'radish', why: 'For a sharper fry, or a mullangi sambar.' }, { key: 'peas', why: 'Carrot and peas, the lunch-box classic.' }, { key: 'ginger', why: W.ginger }, { key: 'coriander', why: W.coriander }, { key: 'lemon', why: W.lemon } ] },
  { id: 'pumpkin', name: 'Gummadikaya curry', say: ['pumpkin', 'gummadikaya', 'kaddu', 'pumpkin curry', 'gummadikaya kura', 'pumpkin soup'],
    needs: [ { key: 'pumpkin', why: 'Cubed with the skin on, so it holds together.' }, { key: 'onion', why: 'For the base.' }, { key: 'chilli', why: 'Heat against the sweetness.' }, { key: 'curryLeaves', why: W.curryLeaves } ],
    better: [ { key: 'tomato', why: 'A little sour sets off the sweet.' }, { key: 'ginger', why: 'Pumpkin and ginger suit each other.' }, { key: 'garlic', why: W.garlic }, { key: 'coriander', why: W.coriander } ] },
  { id: 'greens_fry', name: 'Thotakura fry', say: ['thotakura', 'amaranth', 'thotakura fry', 'greens', 'akukura', 'aaku kura', 'saag', 'leafy', 'methi', 'menthikura', 'methi dal', 'aloo methi'],
    needs: [ { alt: true, key: 'amaranth', why: 'Chopped fine; it wilts in two minutes.' }, { alt: true, key: 'methi', why: 'Leaves only — a little bitter, very fragrant.' }, { key: 'garlic', why: 'Greens and garlic — fry it golden first.' }, { key: 'onion', why: 'Softened before the leaves go in.' }, { key: 'chilli', why: W.chilli } ],
    better: [ { key: 'spinach', why: 'Mix two greens; it tastes rounder.' }, { key: 'drumstickLeaves', why: 'A handful of munagaku in any greens fry.' }, { key: 'tomato', why: 'For a greens pappu instead of a fry.' }, { key: 'potato', why: 'With methi, it is aloo methi.' }, { key: 'lemon', why: W.lemon } ] },
  { id: 'palak_paneer', name: 'Palak curry', say: ['palak', 'palak paneer', 'palak curry', 'saag paneer', 'palakura', 'palak soup'],
    needs: [ { key: 'spinach', why: 'Blanched and ground — two bunches for a proper gravy.' }, { key: 'onion', why: W.onionBase }, { key: 'tomato', why: 'One, so the green stays green.' }, { key: 'garlic', why: 'Fried in butter for the top.' }, { key: 'ginger', why: W.ginger } ],
    better: [ { key: 'chilli', why: 'Ground in with the spinach.' }, { key: 'potato', why: 'Aloo palak, if there is no paneer.' }, { key: 'lemon', why: 'Keeps the colour bright.' }, { key: 'methi', why: 'A few leaves deepen the flavour.' } ] },
  { id: 'khichdi', name: 'Khichdi / pongal', say: ['khichdi', 'kichdi', 'khichri', 'pongal', 'upma', 'poha', 'atukulu', 'rava upma', 'dalia'],
    needs: [ { key: 'onion', why: 'Softened in the tempering.' }, { key: 'chilli', why: W.chilli }, { key: 'ginger', why: 'Chopped fine — you should bite into it now and then.' }, { key: 'curryLeaves', why: W.curryLeaves } ],
    better: [ { key: 'carrot', why: 'Diced, for colour and sweetness.' }, { key: 'peas', why: 'A handful makes it a meal.' }, { key: 'beans', why: 'Cut small, cooked with the grain.' }, { key: 'tomato', why: 'For a tomato upma or a masala khichdi.' }, { key: 'coriander', why: W.coriander }, { key: 'lemon', why: 'Poha and upma both want it.' } ] },
  { id: 'chutney', name: 'Chutney', say: ['chutney', 'pachadi', 'pudina chutney', 'mint chutney', 'coriander chutney', 'tomato chutney', 'tomato pachadi', 'kothimeera pachadi', 'dosa', 'idli', 'idly'],
    needs: [ { key: 'tomato', why: 'Fried soft for tomato pachadi.' }, { key: 'chilli', why: 'The heat of the chutney.' }, { key: 'garlic', why: 'A clove or two, raw or fried.' }, { key: 'coriander', why: 'A whole bunch, for the green one.' } ],
    better: [ { key: 'mint', why: 'With coriander, it is the pudina chutney for dosa.' }, { key: 'ginger', why: 'For allam pachadi with pesarattu.' }, { key: 'onion', why: 'Fried with the tomato for body.' }, { key: 'curryLeaves', why: W.curryLeaves }, { key: 'lemon', why: 'Sour, and it keeps the green from darkening.' } ] },
  { id: 'lemon_rice', name: 'Lemon rice', say: ['lemon rice', 'nimmakaya pulihora', 'pulihora', 'chitrannam', 'curd rice', 'daddojanam', 'perugannam'],
    needs: [ { key: 'lemon', why: 'Two or three — squeezed over once the rice has cooled.' }, { key: 'chilli', why: W.chilli }, { key: 'curryLeaves', why: 'Plenty; this dish is mostly tempering.' }, { key: 'ginger', why: 'Chopped fine into the tempering.' } ],
    better: [ { key: 'coriander', why: W.coriander }, { key: 'carrot', why: 'Grated in, especially for curd rice.' }, { key: 'cucumber', why: 'Diced into curd rice, cool and crisp.' }, { key: 'pomegranate', why: 'Scattered over curd rice.' } ] },
  { id: 'salad', name: 'Salad & raita', say: ['salad', 'raita', 'kachumber', 'perugu pachadi', 'sprouts', 'sprout salad', 'cucumber'],
    needs: [ { key: 'cucumber', why: 'The cool, crisp base.' }, { key: 'tomato', why: 'Firm ones, diced.' }, { key: 'onion', why: 'Sliced thin and rinsed, so it is not harsh.' }, { key: 'lemon', why: 'The dressing is mostly this and salt.' } ],
    better: [ { key: 'carrot', why: 'Grated, for sweetness and crunch.' }, { key: 'coriander', why: W.coriander }, { key: 'mint', why: 'Torn in, it makes a raita taste fresh.' }, { key: 'pomegranate', why: 'A handful of seeds changes a salad.' }, { key: 'beetroot', why: 'Grated raw, for colour.' }, { key: 'lettuce', why: 'For a salad with some leaf to it.' }, { key: 'chilli', why: 'One, chopped fine.' } ] },
  { id: 'fruit', name: 'Fruit bowl', say: ['fruit', 'fruit salad', 'fruits', 'juice', 'smoothie', 'breakfast', 'snack', 'kids snack'],
    needs: [ { key: 'banana', why: 'The sweet, filling base of any fruit bowl.' }, { key: 'papaya', why: 'Ripe and soft, cut into cubes.' }, { key: 'pomegranate', why: 'Seeds for crunch and colour.' } ],
    better: [ { key: 'guava', why: 'Sliced with a pinch of salt and chilli.' }, { key: 'grapes', why: 'Halved in; children pick these out first.' }, { key: 'lemon', why: 'A squeeze stops the fruit browning.' }, { key: 'mint', why: 'A few leaves on top.' }, { key: 'cucumber', why: 'For a lighter, less sweet bowl.' } ] },
  { id: 'soup', name: 'Vegetable soup', say: ['soup', 'veg soup', 'vegetable soup', 'tomato soup', 'noodles', 'manchurian', 'chowmein', 'stir fry'],
    needs: [ { key: 'carrot', why: 'Diced fine; the sweetness of the broth.' }, { key: 'beans', why: 'Cut small.' }, { key: 'cabbage', why: 'Shredded in for the last few minutes.' }, { key: 'garlic', why: 'Fried first — it flavours everything.' }, { key: 'ginger', why: 'For warmth.' } ],
    better: [ { key: 'springOnion', why: 'Whites in the pan, greens on top.' }, { key: 'tomato', why: 'For a tomato soup, or a little sour.' }, { key: 'peas', why: 'A handful.' }, { key: 'coriander', why: W.coriander }, { key: 'chilli', why: W.chilli }, { key: 'lemon', why: W.lemon } ] },
];

/** The base most everyday curries start from — what is offered for a dish this book does not know. */
// prettier-ignore
const BASE = [
  { key: 'onion', why: W.onionBase }, { key: 'tomato', why: W.tomatoBase }, { key: 'chilli', why: W.chilli },
  { key: 'ginger', why: W.gg }, { key: 'garlic', why: W.garlic }, { key: 'curryLeaves', why: W.curryLeaves }, { key: 'coriander', why: W.coriander },
];

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿఀ-౿' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Everything a product can be called, lower-cased. */
const namesOf = (p) => [p?.name, ...(p?.aliases || [])].map(norm).filter(Boolean);

/** Does this product count as that ingredient? */
function isIngredient(product, key) {
  const def = ING[key];
  if (!def) return false;
  const names = namesOf(product);
  if (def.not && names.some((n) => def.not.some((x) => n.includes(x)))) return false;
  return names.some((n) => def.is.some((x) => n === x || n.includes(x)));
}

/** The first available product on the shelf that is this ingredient. */
function shelfFor(key, products) {
  return products.find((p) => isIngredient(p, key)) || null;
}

/**
 * The dish a shopper most likely means. Longest phrase wins, so "tomato pappu" is the dal and not
 * the curry that merely mentions tomato.
 * @returns {Dish|null}
 */
export function findDish(text) {
  return matchDish(text).dish;
}

/** The dish, and how many letters of what was typed it accounts for. */
function matchDish(text) {
  const q = norm(text);
  if (!q) return { dish: null, len: 0 };
  let best = null;
  let bestLen = 0;
  for (const d of DISHES) {
    for (const phrase of d.say) {
      const hit = q === phrase || q.includes(phrase) || (q.length >= 4 && phrase.startsWith(q));
      if (hit && phrase.length > bestLen) {
        best = d;
        bestLen = phrase.length;
      }
    }
  }
  return { dish: best, len: bestLen };
}

const sellable = (p) => (p?.availability || 'AVAILABLE') === 'AVAILABLE' && p?.isActive !== false;

/**
 * What to put in front of the shopper for what they typed.
 *
 * @param {string} text  what they typed
 * @param {any[]} products  today's catalogue (public product shape)
 * @param {{ inBasket?: Set<string>|string[], diet?: 'ALL'|'VEG'|'NONVEG' }} [opts]
 * @returns {null | {
 *   title: string, known: boolean, note: string|null,
 *   have: number, total: number,
 *   picks: { product: any, why: string, badge: string|null, role: 'needs'|'better', inBasket: boolean }[]
 * }}
 *   `have`/`total` count the NEEDED ingredients we sell and how many are already in the basket.
 *   `picks` is needed-first, each product once, things already in the basket last within their role.
 */
export function suggest(text, products, opts = {}) {
  const typed = String(text || '').trim();
  if (!typed) return null;
  const inBasket = opts.inBasket instanceof Set ? opts.inBasket : new Set(opts.inBasket || []);
  const shelf = (products || []).filter(
    (p) => sellable(p) && (opts.diet !== 'VEG' || p.diet !== 'NONVEG'),
  );

  const q = norm(typed);
  // The thing on our shelf that the words name most completely, if any.
  let named = null;
  let namedLen = 0;
  for (const p of shelf)
    for (const n of namesOf(p))
      if (n.length >= 3 && n.length > namedLen && (q.includes(n) || n.includes(q))) {
        named = p;
        namedLen = n.length;
      }
  const m = matchDish(typed);
  // "Drumstick leaves fry" names drumstick LEAVES; the drumstick curry only matched part of it.
  let dish = named && namedLen > m.len && q.includes(norm(named.name)) ? null : m.dish;
  let title = dish?.name || null;
  let note = null;
  let needs = dish?.needs || [];
  let better = dish?.better || [];

  if (!dish) {
    // Not a dish this book knows. Does it at least name something we sell?
    title = typed.charAt(0).toUpperCase() + typed.slice(1);
    if (named) {
      needs = [{ key: `#${named.id}`, why: 'The one you named — the dish is built around it.' }];
      better = BASE;
      note = 'I don’t have this exact recipe, so here is what most dishes like it start with.';
    } else {
      needs = BASE.slice(0, 4);
      better = BASE.slice(4);
      note = 'I don’t know this dish yet. This is the base most everyday curries start from.';
    }
  }

  // Of a dish's alternatives, keep the one that was asked for.
  const q0 = q;
  const alts = needs.filter((x) => x.alt);
  if (alts.length > 1) {
    const named = alts.filter((x) => ING[x.key]?.is.some((w) => q0.includes(w)));
    const keep = named.length ? named : [alts.find((x) => shelfFor(x.key, shelf)) || alts[0]];
    needs = needs.filter((x) => !x.alt || keep.includes(x));
    // "Beerakaya" asked for by name should not be answered under another gourd's title.
    if (named.length && named[0] !== alts[0])
      title = typed.charAt(0).toUpperCase() + typed.slice(1);
  }

  const seen = new Set();
  const build = (parts, role) => {
    const out = [];
    for (const part of parts) {
      const product = part.key.startsWith('#')
        ? shelf.find((p) => p.id === part.key.slice(1))
        : shelfFor(part.key, shelf);
      if (!product || seen.has(product.id)) continue;
      seen.add(product.id);
      const badge = Array.isArray(product.goodToKnow) ? product.goodToKnow[0] : null;
      out.push({
        product,
        why: part.why,
        badge: typeof badge === 'string' ? badge : badge?.label || null,
        role,
        inBasket: inBasket.has(product.id),
      });
    }
    // Things still to buy come before things already bought.
    return out.sort((a, b) => Number(a.inBasket) - Number(b.inBasket));
  };

  const needed = build(needs, 'needs');
  const extra = build(better, 'better');
  if (!needed.length && !extra.length) return null;
  return {
    title,
    known: !!dish,
    note,
    have: needed.filter((x) => x.inBasket).length,
    total: needed.length,
    picks: [...needed, ...extra],
  };
}

/**
 * A few dishes to offer as one-tap ideas: those that use what is already in the basket first, then
 * the everyday favourites.
 * @returns {{ id: string, name: string }[]}
 */
export function ideas(products, inBasketIds, limit = 6) {
  const have = (products || []).filter((p) => new Set(inBasketIds || []).has(p.id));
  const scored = DISHES.map((d, i) => ({
    d,
    i,
    n: d.needs.filter((part) => have.some((p) => isIngredient(p, part.key))).length,
  }));
  const fromBasket = scored
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.d);
  const favourites = [
    'tomato_curry',
    'sambar',
    'chicken_curry',
    'biryani',
    'palak_dal',
    'egg_curry',
  ]
    .map((id) => DISHES.find((d) => d.id === id))
    .filter(Boolean);
  const out = [];
  for (const d of [...fromBasket, ...favourites]) {
    if (!out.some((x) => x.id === d.id)) out.push({ id: d.id, name: d.name });
    if (out.length >= limit) break;
  }
  return out;
}
