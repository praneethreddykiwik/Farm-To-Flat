/**
 * What we tell a customer about each thing we sell: its story, how to keep it, and one dish to cook
 * tonight. This is the "passive knowledge" on the product page.
 *
 * WRITING RULES — enforced by test/knowledge.test.js through lib/claims.js lintCopy():
 *   • Kitchen and market facts only. No health benefits here, ever: what a vegetable contains is
 *     computed from data/composition.json by lib/claims.js, under the FSS claims thresholds, and is
 *     the ONLY place the app speaks about nutrition.
 *   • No "healthy", "pure", "organic", "traditional", no disease names, no "good for …", no
 *     comparisons with other shops. If the lint rejects a sentence, rewrite the sentence.
 *   • Recipes are everyday Telugu and Indian home dishes, written for someone who cooks.
 *
 * `ids` match a product exactly. `names` match by product name or alias, so a product added later
 * from the console (which gets a random id) still finds its entry; `fallback` names are generic
 * words ("mutton", "fish") tried only when nothing more specific matched, so "Mutton keema" finds
 * keema, not the curry cut. `food` is the key of its row in composition.json, or null when we hold
 * no trustworthy composition data for it. `small: true` marks things eaten a spoonful at a time
 * (herbs, garlic, chillies): a per-100 g nutrition statement about them would be accurate and still
 * mislead, so the app makes none.
 */

/** How to keep it, by kind. An entry's own `keep` wins. */
export const KEEP = {
  leafy:
    'Do not wash until you cook. Wrap loosely in a cotton cloth or paper and refrigerate. Best within two days.',
  herb: 'Wrap unwashed in paper or a cloth and refrigerate. Use within three or four days.',
  veg: 'Refrigerate unwashed in the vegetable drawer and use within four days.',
  root: 'Keep in a cool, dry, airy place away from sunlight.',
  gourd: 'Refrigerate unwashed and uncut. Once cut, cook within a day.',
  fruit: 'Ripen at room temperature, then refrigerate and eat within a few days.',
  sprout: 'Keep refrigerated, rinse before use, and eat within a day.',
  meat: 'Refrigerate at once and cook the same day, or freeze. Keep raw meat apart from other food and cook it through.',
  egg: 'Refrigerate with the pointed end down.',
};

const TEMPER = 'mustard seeds, cumin, dried red chilli, curry leaves';

export const KNOWLEDGE = {
  // ─────────────────────────────── leafy greens ───────────────────────────────
  spinach: {
    ids: ['p_palak'],
    names: ['spinach', 'palak', 'palakura'],
    food: 'spinach',
    kind: 'leafy',
    story:
      'Palakura is the everyday green of Telugu kitchens: soft, mild, and ready in minutes. It cooks down to a fraction of its size, so one bunch is one dish.',
    recipe: {
      name: 'Palakura pappu',
      mins: 30,
      serves: 4,
      needs: [
        '1 bunch spinach, chopped',
        '¾ cup toor dal',
        '1 onion',
        '1 tomato',
        '3 green chillies',
        'small ball of tamarind',
        'turmeric, salt',
        `${TEMPER}, garlic`,
      ],
      steps: [
        'Pressure-cook the dal with turmeric until soft.',
        'Simmer the spinach, onion, tomato and chillies in a little water until tender.',
        'Add the dal, tamarind water and salt. Mash lightly and simmer five minutes.',
        'Fry the tempering with crushed garlic in a spoon of oil and pour it over.',
      ],
    },
  },
  fenugreek_leaves: {
    ids: ['p_menthi'],
    names: ['fenugreek leaves', 'menthi', 'methi'],
    food: null,
    kind: 'leafy',
    story:
      'Menthikura is picked young, while the leaves are small and the stems still tender. Its gentle bitterness is the point: it is what makes menthi pappu taste the way it does.',
    recipe: {
      name: 'Menthikura pappu',
      mins: 30,
      serves: 4,
      needs: [
        '1 bunch fenugreek leaves, picked',
        '¾ cup toor dal',
        '1 onion',
        '2 tomatoes',
        '3 green chillies',
        'turmeric, salt',
        `${TEMPER}, garlic`,
      ],
      steps: [
        'Pressure-cook the dal with turmeric.',
        'Fry the onion and chillies, add the leaves and stir until they wilt.',
        'Add the tomatoes, then the dal and salt. Simmer ten minutes.',
        'Finish with the tempering and crushed garlic.',
      ],
    },
  },
  amaranth_leaves: {
    ids: ['p_thota'],
    names: ['amaranth', 'thotakura', 'chaulai'],
    food: 'amaranth_leaves',
    kind: 'leafy',
    story:
      'Thotakura literally means garden greens. It grows fast in the heat, which is why it is on the table in Telangana for most of the year.',
    recipe: {
      name: 'Thotakura vepudu',
      mins: 15,
      serves: 3,
      needs: [
        '1 bunch amaranth, chopped fine',
        '4 cloves garlic',
        '2 dried red chillies',
        '1 tsp chana dal',
        '1 tsp urad dal',
        'mustard seeds',
        'salt',
        '2 tbsp grated coconut (optional)',
      ],
      steps: [
        'Heat oil and fry the mustard seeds, dals, chillies and crushed garlic until golden.',
        'Add the greens and salt. Stir on high heat until the water cooks off.',
        'Toss with coconut and serve with hot rice.',
      ],
    },
  },
  gongura: {
    ids: ['p_gongura'],
    names: ['gongura', 'roselle', 'ambadi'],
    food: null,
    kind: 'leafy',
    story:
      'Gongura is the sour leaf of Andhra and Telangana. Its sharpness is why gongura pachadi and gongura mamsam taste like nothing else, and why a jar of the pickle travels with every Telugu student abroad.',
    best: 'Monsoon through winter',
    recipe: {
      name: 'Gongura pachadi',
      mins: 25,
      serves: 6,
      needs: [
        '2 bunches gongura leaves, picked and dried well',
        '8 dried red chillies',
        '6 cloves garlic',
        '1 tsp coriander seeds',
        '¼ tsp fenugreek seeds',
        'salt',
        'oil',
        'mustard seeds for tempering',
      ],
      steps: [
        'Roast the chillies, coriander and fenugreek seeds in a little oil and set aside.',
        'In the same pan fry the leaves until they collapse into a dark paste.',
        'Grind the spices and garlic coarsely, add the leaves and salt, and pulse once or twice.',
        'Temper with mustard seeds and more garlic. Eat with rice and raw onion.',
      ],
    },
  },
  ponnaganti: {
    ids: ['p_ponnaganti'],
    names: ['ponnaganti', 'joyweed'],
    food: null,
    kind: 'leafy',
    story:
      'Ponnaganti kura is a small-leaved green sold in tight bunches at Telugu markets. It is cooked soft with dal or fried quickly with garlic, and it has been on the monsoon table for generations.',
    best: 'Monsoon through winter',
    recipe: {
      name: 'Ponnaganti pappu',
      mins: 25,
      serves: 4,
      needs: [
        '1 bunch ponnaganti leaves, picked',
        '½ cup moong dal',
        '1 onion',
        '2 green chillies',
        'turmeric, salt',
        `${TEMPER}, garlic`,
      ],
      steps: [
        'Boil the moong dal with turmeric until just soft, not mushy.',
        'Fry the onion and chillies, add the leaves and cook until tender.',
        'Stir in the dal and salt and simmer five minutes.',
        'Pour over the tempering fried with garlic.',
      ],
    },
  },
  kale: {
    names: ['kale'],
    food: 'kale',
    kind: 'leafy',
    story:
      'Kale is a sturdy, frilly leaf from the cabbage family. It holds its shape in a hot pan, so it suits the same quick stir-fry a Telugu kitchen gives any green.',
    recipe: {
      name: 'Kale poriyal',
      mins: 12,
      serves: 3,
      needs: [
        '1 bunch kale, stems removed, shredded',
        '1 tsp urad dal',
        'mustard seeds',
        '2 dried red chillies',
        '3 tbsp grated coconut',
        'salt',
      ],
      steps: [
        'Fry the mustard seeds, urad dal and chillies in oil.',
        'Add the kale and salt with a splash of water. Cover for four minutes.',
        'Uncover, cook off the water and toss with coconut.',
      ],
    },
  },
  bathua: {
    names: ['bathua', 'lambsquarter'],
    food: 'bathua',
    kind: 'leafy',
    story:
      'Bathua is a winter green of north Indian fields, where it comes up on its own among the wheat. It is boiled, mashed and folded into raita or dough.',
    best: 'Winter',
    recipe: {
      name: 'Bathua raita',
      mins: 15,
      serves: 4,
      needs: [
        '1 bunch bathua leaves',
        '2 cups curd, whisked',
        'roasted cumin powder',
        'black salt or salt',
        'pinch of chilli powder',
      ],
      steps: [
        'Boil the leaves for five minutes, drain and squeeze dry.',
        'Chop fine or mash, and fold into the curd.',
        'Season with cumin, salt and chilli powder. Serve cool.',
      ],
    },
  },
  agathi: {
    names: ['agathi', 'avisa', 'agase'],
    food: null,
    kind: 'leafy',
    story:
      'Agathi, or avisa aku, comes from a small tree rather than a field. The leaves are slightly bitter and are always cooked well, usually with coconut.',
    careful: 'Always cook agathi leaves well before eating.',
    recipe: {
      name: 'Avisa aku kobbari kura',
      mins: 20,
      serves: 3,
      needs: [
        '1 bunch agathi leaves, stripped from the stems',
        '1 onion, chopped',
        '2 dried red chillies',
        'mustard seeds, urad dal',
        '4 tbsp grated coconut',
        'salt',
      ],
      steps: [
        'Fry the mustard seeds, urad dal, chillies and onion.',
        'Add the leaves, salt and half a cup of water. Cover and cook twelve minutes until soft.',
        'Cook off the water and stir in the coconut.',
      ],
    },
  },
  colocasia_leaves: {
    names: ['colocasia leaves', 'taro leaves', 'chama aku', 'arbi ke patte'],
    food: 'colocasia_leaves',
    kind: 'leafy',
    story:
      'The broad leaves of the colocasia plant are rolled, steamed and sliced along the west coast, and cooked into a sour pulusu in Andhra. They need tamarind and patience.',
    careful:
      'Never eat these leaves raw. Cook them through with tamarind or lemon, which removes the itch they can leave in the throat.',
    recipe: {
      name: 'Chama aku pulusu',
      mins: 35,
      serves: 4,
      needs: [
        '6 colocasia leaves, stems removed, chopped',
        'lemon-sized ball of tamarind',
        '1 onion',
        '3 green chillies',
        '1 tsp jaggery',
        'turmeric, salt',
        `${TEMPER}`,
      ],
      steps: [
        'Boil the leaves with turmeric for ten minutes and drain.',
        'Fry the tempering, onion and chillies. Add the leaves.',
        'Pour in the tamarind water, jaggery and salt. Simmer fifteen minutes until thick.',
      ],
    },
  },
  drumstick_leaves: {
    names: ['drumstick leaves', 'munagaku', 'moringa leaves'],
    food: 'drumstick_leaves',
    kind: 'leafy',
    story:
      'Munagaku is stripped from the same tree that gives drumsticks. The leaves are tiny, so cleaning a bunch takes time, and the dal that comes of it is worth the trouble.',
    recipe: {
      name: 'Munagaku pappu',
      mins: 30,
      serves: 4,
      needs: [
        '2 cups drumstick leaves, stripped',
        '¾ cup toor dal',
        '1 onion',
        '3 green chillies',
        'small ball of tamarind',
        'turmeric, salt',
        `${TEMPER}, garlic`,
      ],
      steps: [
        'Pressure-cook the dal with turmeric.',
        'Fry the onion and chillies, add the leaves and cook five minutes.',
        'Add the dal, tamarind water and salt and simmer ten minutes.',
        'Finish with tempering and garlic.',
      ],
    },
  },
  purslane: {
    names: ['purslane', 'gangavalli', 'gangavayila', 'kulfa'],
    food: 'purslane',
    kind: 'leafy',
    story:
      'Purslane, gangavalli kura in Telugu, has thick, juicy leaves with a faint sourness. It grows close to the ground and is cooked into dal across the Deccan.',
    recipe: {
      name: 'Gangavalli kura pappu',
      mins: 25,
      serves: 4,
      needs: [
        '1 bunch purslane, chopped with tender stems',
        '¾ cup toor dal',
        '1 tomato',
        '3 green chillies',
        'turmeric, salt',
        `${TEMPER}, garlic`,
      ],
      steps: [
        'Pressure-cook the dal with turmeric.',
        'Simmer the greens, tomato and chillies until soft.',
        'Mix in the dal and salt and cook five minutes.',
        'Pour over the tempering fried with garlic.',
      ],
    },
  },
  dill: {
    names: ['dill', 'soya kura', 'sabsige', 'suva'],
    food: 'dill',
    kind: 'leafy',
    story:
      'Dill has feathery leaves and a strong, sweet smell that fills the kitchen. A little goes a long way, which is why it is usually cooked with dal or potato.',
    recipe: {
      name: 'Dill and moong dal',
      mins: 25,
      serves: 4,
      needs: [
        '1 bunch dill, chopped',
        '½ cup moong dal',
        '1 onion',
        '2 green chillies',
        'turmeric, salt',
        'cumin, garlic, oil',
      ],
      steps: [
        'Boil the dal with turmeric until soft.',
        'Fry cumin, garlic, onion and chillies. Add the dill and cook three minutes.',
        'Stir in the dal and salt and simmer five minutes.',
      ],
    },
  },
  sorrel: {
    names: ['sorrel', 'chukka'],
    food: null,
    kind: 'leafy',
    story:
      'A soft, sour green. In Telugu kitchens the sour leaves go into dal, where their tartness does the work that tamarind or tomato would otherwise do.',
    recipe: {
      name: 'Sour greens pappu',
      mins: 25,
      serves: 4,
      needs: [
        '1 bunch sorrel leaves, chopped',
        '¾ cup toor dal',
        '1 onion',
        '3 green chillies',
        'turmeric, salt',
        `${TEMPER}, garlic`,
      ],
      steps: [
        'Pressure-cook the dal with turmeric.',
        'Cook the leaves, onion and chillies until they melt down.',
        'Add the dal and salt. Taste before adding anything sour: the leaves usually bring enough.',
        'Finish with tempering and garlic.',
      ],
    },
  },
  mustard_greens: {
    names: ['mustard greens', 'sarson'],
    food: 'mustard_greens',
    kind: 'leafy',
    story:
      'Mustard greens are the peppery winter leaf of Punjab, slow-cooked into sarson ka saag and eaten with makki ki roti.',
    best: 'Winter',
    recipe: {
      name: 'Sarson ka saag',
      mins: 45,
      serves: 4,
      needs: [
        '2 bunches mustard greens',
        '1 bunch spinach',
        '2 tbsp maize flour',
        '1 onion',
        'ginger, garlic, green chillies',
        'ghee, salt',
      ],
      steps: [
        'Boil both greens with ginger and chillies for twenty minutes.',
        'Mash or blend coarsely, stir in the maize flour and simmer ten minutes.',
        'Fry onion and garlic in ghee and stir through. Serve with a knob of butter.',
      ],
    },
  },
  malabar_spinach: {
    names: ['malabar spinach', 'bachali', 'basella'],
    food: 'malabar_spinach',
    kind: 'leafy',
    story:
      'Bachali kura is a climbing green with thick, glossy leaves. It turns silky when cooked, and bachali kura pappu is a monsoon regular in coastal Andhra.',
    recipe: {
      name: 'Bachali kura pappu',
      mins: 25,
      serves: 4,
      needs: [
        '1 bunch malabar spinach, chopped',
        '¾ cup toor dal',
        '1 tomato',
        '3 green chillies',
        'small ball of tamarind',
        'turmeric, salt',
        `${TEMPER}, garlic`,
      ],
      steps: [
        'Pressure-cook the dal with turmeric.',
        'Simmer the leaves, tomato and chillies until soft.',
        'Add the dal, tamarind water and salt. Cook five minutes.',
        'Finish with tempering and garlic.',
      ],
    },
  },
  lettuce: {
    names: ['lettuce', 'salad leaves'],
    food: 'lettuce',
    kind: 'leafy',
    story:
      'Lettuce is grown for eating raw: crisp, mild and mostly water. Wash it just before serving so it stays crunchy.',
    keep: 'Wrap unwashed in paper and refrigerate. Wash and dry just before eating.',
    recipe: {
      name: 'Kosambari-style salad',
      mins: 10,
      serves: 3,
      needs: [
        '1 bunch lettuce, torn',
        '1 cucumber, chopped',
        '2 tbsp moong dal, soaked 30 minutes',
        '2 tbsp grated coconut',
        'juice of half a lemon',
        'salt',
        'mustard seeds and a green chilli for tempering',
      ],
      steps: [
        'Drain the dal and mix with the cucumber, coconut, lemon and salt.',
        'Temper with mustard seeds and chilli.',
        'Fold in the lettuce just before serving.',
      ],
    },
  },

  // ─────────────────────────────── herbs & aromatics ───────────────────────────────
  coriander: {
    ids: ['p_coriander'],
    names: ['coriander', 'kothimeera', 'dhania'],
    food: 'coriander_leaves',
    small: true,
    kind: 'herb',
    story:
      'Kothimeera goes on at the very end. Stirred into a curry off the heat, or ground into chutney, it is the smell of a finished dish.',
    keep: 'Stand the stems in a glass of water, or wrap in paper, and refrigerate.',
    recipe: {
      name: 'Kothimeera pachadi',
      mins: 10,
      serves: 4,
      needs: [
        '1 bunch coriander with tender stems',
        '3 green chillies',
        'small piece of tamarind',
        '2 tbsp roasted peanuts or chana dal',
        'salt',
        'mustard seeds for tempering',
      ],
      steps: [
        'Grind everything but the mustard seeds with a little water to a coarse chutney.',
        'Temper with mustard seeds in a spoon of oil.',
        'Serve with idli, dosa or hot rice.',
      ],
    },
  },
  mint: {
    ids: ['p_mint'],
    names: ['mint', 'pudina'],
    food: 'mint',
    small: true,
    kind: 'herb',
    story:
      'Pudina is the cool note in a biryani and the sharp one in a chutney. Use the leaves and the tender tops; the lower stems are woody.',
    recipe: {
      name: 'Pudina rice',
      mins: 20,
      serves: 3,
      needs: [
        '1 bunch mint leaves',
        '2 cups cooked rice',
        '2 green chillies',
        'small piece of ginger',
        '1 onion, sliced',
        'whole spices: bay leaf, clove, cinnamon',
        'salt, oil',
      ],
      steps: [
        'Grind the mint, chillies and ginger to a paste.',
        'Fry the spices and onion, add the paste and cook until the raw smell goes.',
        'Fold in the rice and salt and warm through.',
      ],
    },
  },
  curry_leaves: {
    ids: ['p_curry'],
    names: ['curry leaves', 'karivepaku', 'kadi patta'],
    food: null,
    small: true,
    kind: 'herb',
    story:
      'Karivepaku is where a south Indian tempering starts: a handful of leaves into hot oil, and the whole house knows lunch is nearly ready.',
    keep: 'Strip from the stems, dry well and refrigerate in a closed box. Keeps a week.',
    recipe: {
      name: 'Karivepaku podi',
      mins: 20,
      serves: 10,
      needs: [
        '2 cups curry leaves, washed and dried',
        '2 tbsp chana dal',
        '2 tbsp urad dal',
        '6 dried red chillies',
        'small piece of tamarind',
        '4 cloves garlic',
        'salt',
      ],
      steps: [
        'Dry-roast the dals and chillies until golden.',
        'Roast the leaves on low heat until crisp.',
        'Grind everything to a coarse powder. Eat with rice and ghee.',
      ],
    },
  },
  spring_onion: {
    ids: ['p_spring'],
    names: ['spring onion', 'ullikadalu', 'hara pyaz'],
    food: 'spring_onion',
    kind: 'herb',
    story:
      'Ullikadalu are onions pulled young, sold with their green tops. The white is sharp, the green is mild, and both go in the pan.',
    recipe: {
      name: 'Ullikadala pesarapappu kura',
      mins: 15,
      serves: 3,
      needs: [
        '2 bunches spring onion, chopped',
        '3 tbsp moong dal, soaked 20 minutes',
        '2 green chillies',
        'mustard seeds, cumin',
        'turmeric, salt',
      ],
      steps: [
        'Fry mustard seeds, cumin and chillies.',
        'Add the drained dal and fry two minutes, then the spring onion, turmeric and salt.',
        'Cover and cook on low heat until the dal is tender but whole.',
      ],
    },
  },
  ginger: {
    ids: ['p_ginger'],
    names: ['ginger', 'allam', 'adrak'],
    food: 'ginger',
    small: true,
    kind: 'root',
    story:
      'Allam brings heat without chilli. In Andhra it is also a chutney in its own right: allam pachadi, sweet, sour and hot, eaten with pesarattu.',
    keep: 'Keep dry in the vegetable drawer. It lasts two to three weeks.',
    recipe: {
      name: 'Allam pachadi',
      mins: 20,
      serves: 8,
      needs: [
        '100 g ginger, peeled and chopped',
        '6 dried red chillies',
        'lemon-sized ball of tamarind',
        '3 tbsp jaggery',
        '1 tsp urad dal',
        'mustard seeds',
        'salt',
      ],
      steps: [
        'Fry the ginger and chillies in oil until the ginger turns golden.',
        'Grind with the tamarind, jaggery and salt to a thick paste.',
        'Temper with mustard seeds and urad dal.',
      ],
    },
  },
  garlic: {
    ids: ['p_garlic'],
    names: ['garlic', 'velluli', 'lehsun'],
    food: 'garlic',
    small: true,
    kind: 'root',
    story:
      'Velluli is crushed into nearly every Telugu tempering. Pounded with red chilli and salt it becomes vellulli karam, a spoon of which finishes a plate of rice.',
    keep: 'Keep in an open basket in a dry, airy place. Do not refrigerate.',
    recipe: {
      name: 'Vellulli karam',
      mins: 10,
      serves: 8,
      needs: [
        '1 whole bulb garlic, peeled',
        '8 dried red chillies',
        '1 tsp cumin',
        'salt',
        '1 tbsp oil',
      ],
      steps: [
        'Roast the chillies and cumin in the oil for a minute.',
        'Pound or grind with the garlic and salt to a coarse powder.',
        'Mix a spoonful into hot rice with ghee.',
      ],
    },
  },
  green_chilli: {
    ids: ['p_chilli'],
    names: ['green chilli', 'pachimirchi', 'hari mirch'],
    food: 'green_chilli',
    small: true,
    kind: 'veg',
    story:
      'Pachimirchi is the fresh heat of Telugu cooking, slit into dal and ground into chutney. Telangana cooks count them into the pot by the handful.',
    recipe: {
      name: 'Pachimirchi pachadi',
      mins: 15,
      serves: 8,
      needs: [
        '15 green chillies',
        'small ball of tamarind',
        '4 cloves garlic',
        '1 tsp cumin',
        'salt',
        'mustard seeds for tempering',
      ],
      steps: [
        'Fry the chillies in oil until blistered.',
        'Grind coarsely with tamarind, garlic, cumin and salt.',
        'Temper with mustard seeds. A little goes a long way.',
      ],
    },
  },
  lemon: {
    ids: ['p_lemon'],
    names: ['lemon', 'nimmakaya', 'nimbu'],
    food: 'lemon',
    small: true,
    kind: 'fruit',
    story:
      'Nimmakaya is squeezed over almost everything at the end. Thin-skinned and full of juice, the small Indian lemon is closer to a lime than to the thick western kind.',
    keep: 'Keeps a week at room temperature and longer in the fridge.',
    recipe: {
      name: 'Nimmakaya pulihora',
      mins: 15,
      serves: 3,
      needs: [
        '2 cups cooked rice, cooled',
        'juice of 2 lemons',
        '2 tbsp peanuts',
        '1 tsp chana dal',
        '2 green chillies',
        'turmeric, salt',
        `${TEMPER}`,
      ],
      steps: [
        'Fry the peanuts, dal, tempering and chillies until golden. Add turmeric.',
        'Take off the heat and stir in the lemon juice and salt.',
        'Fold through the rice and rest ten minutes before eating.',
      ],
    },
  },

  // ─────────────────────────────── vegetables ───────────────────────────────
  tomato: {
    ids: ['p_tomato'],
    names: ['tomato', 'tamata', 'tamatar'],
    food: 'tomato',
    kind: 'veg',
    story:
      'The country tomato is small, thin-skinned and sour, which is exactly what a pappu or a pachadi wants. Ripe ones bruise easily, so they are picked close to delivery.',
    keep: 'Keep at room temperature until ripe. Refrigerate only once fully red.',
    recipe: {
      name: 'Tomato pappu',
      mins: 30,
      serves: 4,
      needs: [
        '4 ripe tomatoes',
        '¾ cup toor dal',
        '1 onion',
        '4 green chillies',
        'turmeric, salt',
        `${TEMPER}, garlic`,
      ],
      steps: [
        'Pressure-cook the dal with the tomatoes, onion, chillies and turmeric.',
        'Mash well with salt and simmer five minutes.',
        'Pour over the tempering fried with garlic.',
      ],
    },
  },
  onion: {
    ids: ['p_onion'],
    names: ['onion', 'ullipaya', 'pyaz'],
    food: 'onion',
    kind: 'root',
    story:
      'Ullipaya is the base of the pot and, sliced raw with salt, the side of the plate. Telugu meals with pachadi and pappu nearly always come with a raw onion.',
    keep: 'Keep in an open basket in a dry, airy place, away from potatoes.',
    recipe: {
      name: 'Ullipaya pulusu',
      mins: 25,
      serves: 4,
      needs: [
        '4 onions, quartered',
        'lemon-sized ball of tamarind',
        '1 tbsp jaggery',
        '2 green chillies',
        '1 tsp rice flour',
        'turmeric, chilli powder, salt',
        `${TEMPER}`,
      ],
      steps: [
        'Fry the tempering, then the onions until their edges colour.',
        'Add tamarind water, jaggery, spices and salt. Simmer fifteen minutes.',
        'Thicken with the rice flour stirred into a little water.',
      ],
    },
  },
  potato: {
    ids: ['p_potato'],
    names: ['potato', 'bangaladumpa', 'aloo'],
    food: 'potato',
    kind: 'root',
    story:
      'Bangaladumpa is the vegetable every child will eat. Fried slowly until the edges crisp, it is the standing partner to sambar rice.',
    keep: 'Keep in a cool, dark place away from onions. Do not refrigerate.',
    recipe: {
      name: 'Bangaladumpa vepudu',
      mins: 25,
      serves: 4,
      needs: [
        '4 potatoes, peeled and cubed small',
        '1 tsp chilli powder',
        'turmeric, salt',
        'mustard seeds, cumin',
        'curry leaves',
        '3 tbsp oil',
      ],
      steps: [
        'Fry mustard seeds, cumin and curry leaves in the oil.',
        'Add the potatoes with turmeric and salt. Cover and cook on low heat for ten minutes.',
        'Uncover, add chilli powder and fry until the edges are crisp.',
      ],
    },
  },
  brinjal: {
    ids: ['p_brinjal'],
    names: ['brinjal', 'vankaya', 'baingan', 'eggplant'],
    food: 'brinjal',
    kind: 'veg',
    story:
      'Vankaya is called the king of vegetables in Telugu, and gutti vankaya, small brinjals stuffed with a peanut and sesame masala, is the dish that earns it the name.',
    recipe: {
      name: 'Gutti vankaya',
      mins: 40,
      serves: 4,
      needs: [
        '8 small brinjals, slit in four with stems on',
        '3 tbsp peanuts',
        '1 tbsp sesame seeds',
        '1 tbsp coriander seeds',
        '4 dried red chillies',
        'small ball of tamarind',
        '1 onion',
        'salt, oil',
      ],
      steps: [
        'Roast the peanuts, sesame, coriander and chillies. Grind with tamarind, onion and salt.',
        'Stuff the paste into the brinjals.',
        'Fry them gently in oil, then add the remaining paste and a cup of water.',
        'Cover and cook until the brinjals are soft and the oil rises.',
      ],
    },
  },
  okra: {
    ids: ['p_okra'],
    names: ['okra', "lady's finger", 'ladies finger', 'lady finger', 'bendakaya', 'bhindi'],
    food: 'okra',
    kind: 'veg',
    story:
      'Bendakaya is picked small and snapped at the tip to test it: a clean snap means tender. Dry it well before cutting and it will fry without turning sticky.',
    keep: 'Refrigerate unwashed in paper. Wash and dry fully just before cutting.',
    recipe: {
      name: 'Bendakaya vepudu',
      mins: 20,
      serves: 3,
      needs: [
        '300 g okra, wiped dry and sliced',
        '1 onion, sliced',
        '1 tsp chilli powder',
        'turmeric, salt',
        'mustard seeds, cumin',
        '2 tbsp oil',
      ],
      steps: [
        'Fry mustard seeds and cumin, then the okra on medium heat, uncovered.',
        'Stir only now and then until the stickiness goes.',
        'Add the onion, turmeric, chilli powder and salt and fry until crisp.',
      ],
    },
  },
  carrot: {
    ids: ['p_carrot'],
    names: ['carrot', 'gajar'],
    food: 'carrot',
    kind: 'root',
    story:
      'Carrots for the south come down from the Nilgiris, where the cool hills grow them sweet. Eaten raw, grated into kosambari, or cooked with coconut.',
    keep: 'Refrigerate in the vegetable drawer. Keeps a week.',
    recipe: {
      name: 'Carrot kobbari kura',
      mins: 15,
      serves: 3,
      needs: [
        '3 carrots, diced small',
        '3 tbsp grated coconut',
        '1 tsp urad dal',
        'mustard seeds',
        '2 green chillies',
        'curry leaves, salt',
      ],
      steps: [
        'Fry the mustard seeds, urad dal, chillies and curry leaves.',
        'Add the carrots and salt with a splash of water. Cover for six minutes.',
        'Cook off the water and toss with coconut.',
      ],
    },
  },
  beetroot: {
    ids: ['p_beet'],
    names: ['beetroot', 'beet', 'chukandar'],
    food: 'beetroot',
    kind: 'root',
    story:
      'Sweet, earthy, and at its best through the winter. Beetroot stains everything it touches, including the rice, which is half the fun for a child.',
    best: 'Winter',
    keep: 'Twist off the leaves and refrigerate the roots. Keeps a week.',
    recipe: {
      name: 'Beetroot poriyal',
      mins: 15,
      serves: 3,
      needs: [
        '2 beetroots, peeled and diced small',
        '3 tbsp grated coconut',
        '1 tsp urad dal',
        'mustard seeds',
        '2 dried red chillies',
        'curry leaves, salt',
      ],
      steps: [
        'Fry the mustard seeds, urad dal, chillies and curry leaves.',
        'Add the beetroot and salt with a splash of water. Cover and cook eight minutes.',
        'Uncover, cook dry and stir in the coconut.',
      ],
    },
  },
  cabbage: {
    ids: ['p_cabbage'],
    names: ['cabbage', 'patta gobi'],
    food: 'cabbage',
    kind: 'veg',
    story:
      'A tight, heavy head is a good cabbage. Shredded fine and cooked quickly with moong dal, it stays sweet and a little crunchy.',
    recipe: {
      name: 'Cabbage pesarapappu kura',
      mins: 20,
      serves: 4,
      needs: [
        '½ cabbage, shredded fine',
        '3 tbsp moong dal, soaked 20 minutes',
        '2 green chillies',
        'mustard seeds, cumin',
        'turmeric, salt',
        '2 tbsp grated coconut',
      ],
      steps: [
        'Fry mustard seeds, cumin and chillies. Add the drained dal and fry two minutes.',
        'Add the cabbage, turmeric and salt. Cover and cook on low heat for eight minutes.',
        'Finish with coconut.',
      ],
    },
  },
  cauliflower: {
    ids: ['p_cauli'],
    names: ['cauliflower', 'gobi'],
    food: 'cauliflower',
    kind: 'veg',
    story:
      'Cauliflower is a cool-weather crop: the curd is whitest and tightest in the winter months. Soak the florets in salted water for ten minutes before cooking.',
    best: 'Winter',
    recipe: {
      name: 'Gobi masala kura',
      mins: 25,
      serves: 4,
      needs: [
        '1 cauliflower, in florets',
        '2 onions',
        '2 tomatoes',
        'ginger-garlic paste',
        'chilli powder, coriander powder, turmeric',
        'salt, oil',
        'coriander leaves',
      ],
      steps: [
        'Fry the onions until golden, add ginger-garlic paste, then the tomatoes and spices.',
        'Add the florets and salt with half a cup of water.',
        'Cover and cook ten minutes until just tender. Finish with coriander.',
      ],
    },
  },
  capsicum: {
    ids: ['p_capsicum'],
    names: ['capsicum', 'shimla mirch', 'bell pepper'],
    food: 'capsicum',
    kind: 'veg',
    story:
      'Capsicum is a chilli with the heat bred out and the crunch left in. It cooks in minutes and is best taken off the heat while still firm.',
    recipe: {
      name: 'Capsicum senagapindi kura',
      mins: 20,
      serves: 3,
      needs: [
        '3 capsicums, diced',
        '3 tbsp besan (gram flour)',
        '1 onion',
        'chilli powder, turmeric',
        'mustard seeds, cumin',
        'salt, oil',
      ],
      steps: [
        'Dry-roast the besan until it smells nutty and set aside.',
        'Fry mustard seeds, cumin and onion. Add the capsicum, spices and salt and cook five minutes.',
        'Sprinkle over the besan and stir until it coats the vegetable.',
      ],
    },
  },
  sweet_corn: {
    ids: ['p_corn'],
    names: ['sweet corn', 'mokkajonna', 'bhutta', 'corn'],
    food: 'sweet_corn',
    kind: 'veg',
    story:
      'Mokkajonna roasted over coals and rubbed with lemon, salt and chilli is the taste of a rainy evening on any Hyderabad street corner.',
    best: 'Monsoon',
    keep: 'Refrigerate in the husk and eat within two days; corn loses its sweetness quickly.',
    recipe: {
      name: 'Roasted corn with lemon and chilli',
      mins: 10,
      serves: 2,
      needs: ['2 cobs of corn, husked', '1 lemon, halved', 'salt', 'chilli powder'],
      steps: [
        'Roast the cobs directly over a gas flame, turning, until charred in spots.',
        'Dip the cut lemon in salt and chilli powder.',
        'Rub it hard over the hot corn and eat at once.',
      ],
    },
  },
  radish: {
    ids: ['p_radish'],
    names: ['radish', 'mullangi', 'mooli'],
    food: 'radish',
    kind: 'root',
    story:
      'Mullangi is sharp when raw and turns mild and sweet in a sambar. The white winter radish is the one to buy.',
    best: 'Winter',
    recipe: {
      name: 'Mullangi sambar',
      mins: 35,
      serves: 4,
      needs: [
        '2 radishes, sliced into rounds',
        '¾ cup toor dal',
        'lemon-sized ball of tamarind',
        '2 tbsp sambar powder',
        '1 onion, 1 tomato',
        'turmeric, salt',
        `${TEMPER}`,
      ],
      steps: [
        'Pressure-cook the dal with turmeric.',
        'Boil the radish, onion and tomato in tamarind water with sambar powder until tender.',
        'Add the dal and salt and simmer ten minutes.',
        'Finish with the tempering.',
      ],
    },
  },
  cucumber: {
    ids: ['p_cucumber'],
    names: ['cucumber', 'dosakaya', 'kheera'],
    food: 'cucumber',
    kind: 'gourd',
    story:
      'Dosakaya, the round yellow cucumber of the Deccan, is cooked rather than eaten raw. It keeps its bite in a pappu and gives the dal a clean, cool taste.',
    recipe: {
      name: 'Dosakaya pappu',
      mins: 30,
      serves: 4,
      needs: [
        '1 cucumber, peeled, seeded and cubed',
        '¾ cup toor dal',
        '1 tomato',
        '4 green chillies',
        'small ball of tamarind',
        'turmeric, salt',
        `${TEMPER}, garlic`,
      ],
      steps: [
        'Pressure-cook the dal with turmeric.',
        'Boil the cucumber, tomato and chillies until just tender.',
        'Add the dal, tamarind water and salt. Simmer five minutes without mashing the cucumber.',
        'Finish with tempering and garlic.',
      ],
    },
  },
  pumpkin: {
    ids: ['p_pumpkin'],
    names: ['pumpkin', 'gummadikaya', 'kaddu'],
    food: 'pumpkin',
    kind: 'gourd',
    story:
      'Gummadikaya is the sweet vegetable of festival cooking. In a pulusu its sweetness is set against tamarind and jaggery, sour and sweet in the same spoon.',
    best: 'Late monsoon through winter',
    keep: 'A whole pumpkin keeps for weeks in a cool place. Refrigerate cut pieces and use within three days.',
    recipe: {
      name: 'Gummadikaya pulusu',
      mins: 30,
      serves: 4,
      needs: [
        '500 g pumpkin, cubed with skin',
        'lemon-sized ball of tamarind',
        '1 tbsp jaggery',
        '2 green chillies',
        'turmeric, chilli powder, salt',
        '1 tsp rice flour',
        `${TEMPER}`,
      ],
      steps: [
        'Fry the tempering and chillies, add the pumpkin and turmeric.',
        'Pour in the tamarind water, jaggery, chilli powder and salt. Simmer until the pumpkin is soft.',
        'Thicken with the rice flour stirred into a little water.',
      ],
    },
  },
  drumstick: {
    ids: ['p_drumstick'],
    names: ['drumstick', 'munakkaya', 'sahjan'],
    food: 'drumstick_pods',
    kind: 'veg',
    story:
      'Munakkaya is eaten by scraping the soft flesh off the pod with your teeth. It is what gives a sambar its particular smell.',
    recipe: {
      name: 'Munakkaya tomato kura',
      mins: 30,
      serves: 4,
      needs: [
        '4 drumsticks, cut in finger lengths',
        '3 tomatoes',
        '2 onions',
        'ginger-garlic paste',
        'chilli powder, turmeric, salt',
        'coriander leaves',
      ],
      steps: [
        'Fry the onions, then the ginger-garlic paste and tomatoes until soft.',
        'Add the drumsticks, spices, salt and a cup of water.',
        'Cover and cook fifteen minutes until the pods are tender.',
      ],
    },
  },
  raw_banana: {
    ids: ['p_rawbanana'],
    names: ['raw banana', 'aratikaya', 'kaccha kela', 'plantain'],
    food: 'raw_banana',
    kind: 'veg',
    story:
      'Aratikaya is the banana cooked as a vegetable, starchy and firm. Rub your hands with oil before peeling; the sap stains.',
    keep: 'Keep at room temperature and cook within two days, before it starts to ripen.',
    recipe: {
      name: 'Aratikaya vepudu',
      mins: 20,
      serves: 3,
      needs: [
        '2 raw bananas, peeled and cubed',
        '1 tsp chilli powder',
        'turmeric, salt',
        'mustard seeds, cumin',
        'curry leaves',
        '3 tbsp oil',
      ],
      steps: [
        'Boil the cubes with turmeric and salt for five minutes and drain.',
        'Fry mustard seeds, cumin and curry leaves in the oil.',
        'Add the banana and chilli powder and fry until golden.',
      ],
    },
  },
  jackfruit: {
    ids: ['p_jackfruit'],
    names: ['jackfruit', 'panasa', 'kathal'],
    food: 'jackfruit',
    kind: 'veg',
    story:
      'Raw panasakaya, shredded and cooked with mustard, is panasa pottu kura: a summer wedding dish in coastal Andhra.',
    best: 'Summer',
    careful: 'Oil your hands and knife before cutting; the sap is sticky.',
    recipe: {
      name: 'Panasa pottu kura',
      mins: 40,
      serves: 4,
      needs: [
        '500 g raw jackfruit, chopped fine',
        '1 tbsp mustard seeds, ground with a dried chilli',
        'small ball of tamarind',
        'turmeric, salt',
        `${TEMPER}`,
        '1 tbsp chana dal',
      ],
      steps: [
        'Boil the jackfruit with turmeric and salt until tender and drain well.',
        'Fry the tempering and chana dal, add the jackfruit and tamarind water.',
        'Cook dry, take off the heat and stir in the ground mustard.',
      ],
    },
  },
  green_peas: {
    names: ['green peas', 'batani', 'matar'],
    food: 'green_peas',
    kind: 'veg',
    story:
      'Fresh peas in the pod are a winter pleasure: shelled at the table, half of them eaten before they reach the pot.',
    best: 'Winter',
    keep: 'Refrigerate in the pod and shell just before cooking.',
    recipe: {
      name: 'Batani kura',
      mins: 20,
      serves: 4,
      needs: [
        '2 cups shelled peas',
        '2 onions',
        '2 tomatoes',
        'ginger-garlic paste',
        'chilli powder, coriander powder, turmeric',
        'salt, oil',
      ],
      steps: [
        'Fry the onions until golden, add ginger-garlic paste, tomatoes and spices.',
        'Add the peas, salt and a cup of water.',
        'Simmer ten minutes until the peas are tender.',
      ],
    },
  },

  // ─────────────────────────────── gourds & beans ───────────────────────────────
  bitter_gourd: {
    ids: ['p_karela'],
    names: ['bitter gourd', 'kakarakaya', 'karela'],
    food: 'bitter_gourd',
    kind: 'gourd',
    story:
      'Kakarakaya is bitter and nobody pretends otherwise. Salted, squeezed and fried crisp with onion and a little jaggery, it wins people over.',
    recipe: {
      name: 'Kakarakaya vepudu',
      mins: 25,
      serves: 3,
      needs: [
        '3 bitter gourds, sliced thin',
        '2 onions, sliced',
        '1 tsp chilli powder',
        '1 tsp jaggery',
        'turmeric, salt',
        '3 tbsp oil',
      ],
      steps: [
        'Rub the slices with salt and turmeric, rest ten minutes and squeeze out the juice.',
        'Fry in oil until browned and crisp at the edges.',
        'Add the onions, chilli powder and jaggery and fry until the onions are soft.',
      ],
    },
  },
  bottle_gourd: {
    ids: ['p_bottle'],
    names: ['bottle gourd', 'sorakaya', 'lauki'],
    food: 'bottle_gourd',
    kind: 'gourd',
    story:
      'Sorakaya is mild and mostly water, which makes it a summer vegetable. It takes on whatever it is cooked with.',
    recipe: {
      name: 'Sorakaya pappu',
      mins: 30,
      serves: 4,
      needs: [
        '½ bottle gourd, peeled and cubed',
        '¾ cup toor dal',
        '1 tomato',
        '4 green chillies',
        'turmeric, salt',
        `${TEMPER}, garlic`,
      ],
      steps: [
        'Pressure-cook the dal with the gourd, tomato, chillies and turmeric.',
        'Mash lightly with salt and simmer five minutes.',
        'Finish with tempering and garlic.',
      ],
    },
  },
  ridge_gourd: {
    ids: ['p_ridge'],
    names: ['ridge gourd', 'beerakaya', 'turai'],
    food: 'ridge_gourd',
    kind: 'gourd',
    story:
      'Beerakaya has hard ridges and a soft, spongy heart. Peel off just the ridges; the skin between them goes into a pachadi.',
    recipe: {
      name: 'Beerakaya tomato kura',
      mins: 20,
      serves: 4,
      needs: [
        '3 ridge gourds, ridges peeled, cubed',
        '2 tomatoes',
        '1 onion',
        '3 green chillies',
        'turmeric, salt',
        `${TEMPER}`,
      ],
      steps: [
        'Fry the tempering, onion and chillies.',
        'Add the gourd, tomatoes, turmeric and salt. No water is needed.',
        'Cover and cook ten minutes until soft.',
      ],
    },
  },
  ivy_gourd: {
    ids: ['p_ivy'],
    names: ['ivy gourd', 'dondakaya', 'tindora', 'kundru'],
    food: null,
    kind: 'gourd',
    story:
      'Dondakaya is a finger-length gourd that stays crunchy however long you fry it. Sliced into thin rounds and fried, it is a lunchbox regular.',
    recipe: {
      name: 'Dondakaya vepudu',
      mins: 25,
      serves: 3,
      needs: [
        '300 g ivy gourd, sliced in thin rounds',
        '2 tbsp peanuts, crushed',
        '1 tsp chilli powder',
        'turmeric, salt',
        'mustard seeds, cumin',
        '3 tbsp oil',
      ],
      steps: [
        'Fry mustard seeds and cumin, add the gourd, turmeric and salt.',
        'Cover for five minutes, then fry uncovered until the edges brown.',
        'Add chilli powder and the crushed peanuts and fry two minutes more.',
      ],
    },
  },
  snake_gourd: {
    ids: ['p_snake'],
    names: ['snake gourd', 'potlakaya', 'chichinda'],
    food: null,
    kind: 'gourd',
    story:
      'Potlakaya grows long enough that farmers tie a stone to its tip to keep it straight. Scrape off the white bloom, split it and scoop out the seeds.',
    recipe: {
      name: 'Potlakaya pesarapappu kura',
      mins: 20,
      serves: 4,
      needs: [
        '1 snake gourd, seeded and sliced',
        '3 tbsp moong dal, soaked 20 minutes',
        '2 green chillies',
        'mustard seeds, cumin',
        'turmeric, salt',
        '2 tbsp grated coconut',
      ],
      steps: [
        'Fry mustard seeds, cumin and chillies. Add the drained dal.',
        'Add the gourd, turmeric and salt. Cover and cook ten minutes.',
        'Finish with coconut.',
      ],
    },
  },
  cluster_beans: {
    ids: ['p_cluster'],
    names: ['cluster beans', 'goruchikkudu', 'gawar'],
    food: null,
    kind: 'gourd',
    story:
      'Goruchikkudu are slim, flat beans with a faint bitterness. They are strung, snapped short and fried until nearly dry.',
    recipe: {
      name: 'Goruchikkudu vepudu',
      mins: 20,
      serves: 3,
      needs: [
        '300 g cluster beans, strung and snapped',
        '1 onion',
        '1 tsp chilli powder',
        '2 tbsp grated coconut',
        'turmeric, salt',
        'mustard seeds, urad dal',
      ],
      steps: [
        'Boil the beans with salt for six minutes and drain.',
        'Fry mustard seeds, urad dal and onion. Add the beans, turmeric and chilli powder.',
        'Fry until dry and toss with coconut.',
      ],
    },
  },
  french_beans: {
    ids: ['p_frenchbean'],
    names: ['french beans', 'french bean'],
    fallback: ['beans'],
    food: 'french_beans',
    kind: 'gourd',
    story:
      'French beans come from the cool hills. A good one snaps cleanly and has no string. Chopped fine with coconut, it is the poriyal on every south Indian meals plate.',
    recipe: {
      name: 'Beans poriyal',
      mins: 15,
      serves: 3,
      needs: [
        '250 g beans, chopped fine',
        '3 tbsp grated coconut',
        '1 tsp urad dal',
        'mustard seeds',
        '2 dried red chillies',
        'curry leaves, salt',
      ],
      steps: [
        'Fry the mustard seeds, urad dal, chillies and curry leaves.',
        'Add the beans and salt with a splash of water. Cover for six minutes.',
        'Cook off the water and toss with coconut.',
      ],
    },
  },
  broad_beans: {
    ids: ['p_broadbean'],
    names: ['broad beans', 'chikkudukaya', 'sem'],
    food: 'broad_beans',
    kind: 'gourd',
    story:
      'Chikkudukaya is the flat winter bean of Telugu gardens, often grown on a trellis by the kitchen door. String both edges before cooking.',
    best: 'Winter',
    recipe: {
      name: 'Chikkudukaya tomato kura',
      mins: 25,
      serves: 4,
      needs: [
        '300 g broad beans, strung and halved',
        '2 tomatoes',
        '1 onion',
        'ginger-garlic paste',
        'chilli powder, turmeric, salt',
        `${TEMPER}`,
      ],
      steps: [
        'Fry the tempering and onion, then the ginger-garlic paste.',
        'Add the beans, tomatoes, spices and salt with half a cup of water.',
        'Cover and cook twelve minutes until tender.',
      ],
    },
  },

  // ─────────────────────────────── fruit ───────────────────────────────
  banana: {
    ids: ['p_banana'],
    names: ['banana', 'arati pandu', 'kela'],
    food: 'banana',
    kind: 'fruit',
    story:
      'Arati pandu is the fruit on every Telugu table and at every puja. It is cut green and ripens on the way to you.',
    keep: 'Keep at room temperature, away from other fruit. Do not refrigerate until fully ripe.',
    recipe: {
      name: 'Banana lassi',
      mins: 5,
      serves: 2,
      needs: [
        '2 ripe bananas',
        '1 cup curd',
        '½ cup cold milk or water',
        '1 tsp jaggery or honey',
        'pinch of cardamom',
      ],
      steps: ['Blend everything until smooth.', 'Pour over ice and drink straight away.'],
    },
  },
  papaya: {
    ids: ['p_papaya'],
    names: ['papaya', 'boppayi', 'papita'],
    food: 'papaya',
    kind: 'fruit',
    story:
      'Boppayi is ready when the skin has turned more yellow than green and gives slightly under your thumb.',
    recipe: {
      name: 'Papaya with lime and chilli',
      mins: 5,
      serves: 3,
      needs: [
        '½ ripe papaya, peeled, seeded and cubed',
        'juice of 1 lime',
        'pinch of salt',
        'pinch of chilli powder',
      ],
      steps: [
        'Toss the papaya with lime juice, salt and chilli powder.',
        'Chill ten minutes and serve.',
      ],
    },
  },
  guava: {
    ids: ['p_guava'],
    names: ['guava', 'jama', 'amrood'],
    food: 'guava',
    kind: 'fruit',
    story:
      'Jama kaya with salt and chilli is the taste of the school gate. The winter crop is the sweetest and the most fragrant.',
    best: 'Winter',
    keep: 'Ripens in a day or two at room temperature. Refrigerate once it smells sweet.',
    recipe: {
      name: 'Guava chaat',
      mins: 5,
      serves: 2,
      needs: [
        '2 guavas, cut in wedges',
        'salt',
        'chilli powder',
        'squeeze of lime',
        'pinch of chaat masala (optional)',
      ],
      steps: [
        'Sprinkle the wedges with salt, chilli powder and lime.',
        'Eat at once, skin and all.',
      ],
    },
  },
  pomegranate: {
    ids: ['p_pomegranate'],
    names: ['pomegranate', 'danimma', 'anar'],
    food: 'pomegranate',
    kind: 'fruit',
    story:
      'A heavy danimma is a juicy one. Score the skin, break it open under water, and the seeds sink while the pith floats.',
    keep: 'Keeps two weeks in the fridge whole. Refrigerate loose seeds and eat within three days.',
    recipe: {
      name: 'Daddojanam with pomegranate',
      mins: 10,
      serves: 3,
      needs: [
        '2 cups cooked rice, cooled',
        '1½ cups curd',
        '½ cup pomegranate seeds',
        'small piece of ginger, grated',
        'salt',
        `${TEMPER}`,
      ],
      steps: [
        'Mash the rice lightly and mix with the curd, ginger and salt.',
        'Pour over the tempering.',
        'Fold in the pomegranate seeds just before serving.',
      ],
    },
  },
  grapes: {
    ids: ['p_grapes'],
    names: ['grapes', 'draksha', 'angoor'],
    food: 'grapes',
    kind: 'fruit',
    story:
      'Green grapes arrive with the end of winter. Hyderabad once had its own vineyards, and Anab-e-Shahi, the grape bred here, carried the city’s name across the country.',
    best: 'Late winter and spring',
    keep: 'Refrigerate unwashed on the stem. Wash just before eating.',
    recipe: {
      name: 'Frozen grapes',
      mins: 5,
      serves: 4,
      needs: ['500 g grapes, washed and dried', 'pinch of salt (optional)'],
      steps: [
        'Pull the grapes off the stems and spread on a plate.',
        'Freeze for three hours and eat straight from the freezer.',
      ],
    },
  },
  ice_apple: {
    ids: ['p_iceapple'],
    names: ['ice apple', 'nungu', 'munjalu', 'tadgola'],
    food: null,
    kind: 'fruit',
    story:
      'Thati munjalu are the soft, jelly-like seeds of the palmyra palm, sold by the roadside through the Telangana summer and eaten cold.',
    best: 'Summer',
    keep: 'Refrigerate and eat the same day.',
    recipe: {
      name: 'Chilled munjalu',
      mins: 5,
      serves: 2,
      needs: ['6 ice apples', 'cold water or tender coconut water'],
      steps: [
        'Peel off the thin brown skin.',
        'Chill in cold water for half an hour and eat whole.',
      ],
    },
  },

  // ─────────────────────────────── sprouts & soaked ───────────────────────────────
  moong_sprouts: {
    ids: ['p_moong_sprout'],
    names: ['moong sprout', 'green gram sprout', 'pesalu'],
    food: null,
    kind: 'sprout',
    story:
      'Whole green gram soaked overnight and left to sprout in a damp cloth. Crunchy, a little sweet, and ready to eat as they are.',
    recipe: {
      name: 'Molakala salad',
      mins: 10,
      serves: 2,
      needs: [
        '1 pack moong sprouts, rinsed',
        '1 onion, chopped fine',
        '1 tomato, chopped',
        '1 green chilli',
        'juice of half a lemon',
        'salt, coriander leaves',
      ],
      steps: [
        'Steam the sprouts for three minutes if you prefer them soft.',
        'Toss with everything else and eat fresh.',
      ],
    },
  },
  chana_sprouts: {
    ids: ['p_chana_sprout'],
    names: ['chana sprout', 'kala chana'],
    food: null,
    kind: 'sprout',
    story:
      'Black chickpeas, soaked and sprouted. Tempered with mustard and coconut they become guggillu, the offering handed out at temples.',
    recipe: {
      name: 'Sanagala guggillu',
      mins: 20,
      serves: 3,
      needs: [
        '1 pack sprouted kala chana',
        '2 tbsp grated coconut',
        '2 dried red chillies',
        'mustard seeds, urad dal',
        'curry leaves, salt',
      ],
      steps: [
        'Pressure-cook the chana with salt for two whistles and drain.',
        'Fry the mustard seeds, urad dal, chillies and curry leaves.',
        'Toss in the chana and coconut.',
      ],
    },
  },
  soaked_chana: {
    ids: ['p_chana_soaked'],
    names: ['soaked chana', 'kabuli chana', 'chickpea'],
    food: null,
    kind: 'sprout',
    story:
      'Chickpeas already soaked overnight, so the eight-hour wait is done for you. Straight into the cooker.',
    recipe: {
      name: 'Senagala kura',
      mins: 30,
      serves: 4,
      needs: [
        '1 pack soaked chana',
        '2 onions',
        '2 tomatoes',
        'ginger-garlic paste',
        'chilli powder, coriander powder, garam masala',
        'salt, oil',
      ],
      steps: [
        'Pressure-cook the chana with salt until soft.',
        'Fry the onions, ginger-garlic paste, tomatoes and spices to a thick masala.',
        'Add the chana with its water and simmer ten minutes.',
      ],
    },
  },
  soaked_almonds: {
    ids: ['p_almond_soaked'],
    names: ['soaked almond', 'badam'],
    food: null,
    kind: 'sprout',
    story:
      'Almonds soaked overnight, the way they are eaten first thing in the morning in many Indian homes. The skins slip off between your fingers.',
    recipe: {
      name: 'Badam milk',
      mins: 10,
      serves: 2,
      needs: [
        '1 pack soaked almonds, peeled',
        '2 cups milk',
        '2 tsp sugar or jaggery',
        'pinch of cardamom',
        'few strands of saffron (optional)',
      ],
      steps: [
        'Grind the almonds with a little milk to a smooth paste.',
        'Simmer with the rest of the milk, sugar and cardamom for five minutes.',
        'Serve warm or chilled.',
      ],
    },
  },

  // ─────────────────────────────── meat, fish & eggs ───────────────────────────────
  chicken: {
    ids: ['p_chicken'],
    names: ['chicken curry cut', 'kodi', 'murgi'],
    fallback: ['chicken'],
    food: 'chicken',
    kind: 'meat',
    story:
      'Kodi kura on a Sunday is a Telugu household habit. Curry cut means bone-in pieces, because the bones are where the gravy gets its depth.',
    recipe: {
      name: 'Kodi kura',
      mins: 45,
      serves: 4,
      needs: [
        '500 g chicken curry cut',
        '3 onions, sliced',
        '2 tomatoes',
        '1 tbsp ginger-garlic paste',
        'chilli powder, coriander powder, turmeric, garam masala',
        'salt, oil',
        'coriander leaves',
      ],
      steps: [
        'Marinate the chicken with turmeric, chilli powder, ginger-garlic paste and salt for twenty minutes.',
        'Fry the onions until deep golden, add the tomatoes and coriander powder.',
        'Add the chicken and fry five minutes, then a cup of water.',
        'Cover and cook twenty minutes until tender. Finish with garam masala and coriander.',
      ],
    },
  },
  mutton: {
    ids: ['p_mutton'],
    names: ['mutton curry cut', 'mamsam', 'goat meat'],
    fallback: ['mutton', 'goat'],
    food: 'goat_meat',
    kind: 'meat',
    story:
      'Mamsam in Telangana means goat, cut on the bone. It wants slow cooking, and the gravy is better the next day.',
    recipe: {
      name: 'Mamsam kura',
      mins: 60,
      serves: 4,
      needs: [
        '500 g mutton curry cut',
        '3 onions',
        '2 tomatoes',
        '1 tbsp ginger-garlic paste',
        'chilli powder, coriander powder, turmeric, garam masala',
        'salt, oil',
        'coriander and mint leaves',
      ],
      steps: [
        'Pressure-cook the mutton with turmeric, salt, ginger-garlic paste and a cup of water for five whistles.',
        'Fry the onions until brown, add the tomatoes and spices and cook to a paste.',
        'Add the mutton with its stock and simmer twenty minutes.',
        'Finish with garam masala and the leaves.',
      ],
    },
  },
  keema: {
    names: ['keema', 'kheema', 'qeema', 'mince'],
    food: null,
    kind: 'meat',
    story:
      'Keema is mutton minced fine. Cooked dry with peas it fills a paratha; left loose with gravy it goes over rice.',
    recipe: {
      name: 'Keema matar',
      mins: 35,
      serves: 4,
      needs: [
        '500 g mutton keema',
        '1 cup green peas',
        '2 onions',
        '2 tomatoes',
        '1 tbsp ginger-garlic paste',
        'chilli powder, coriander powder, turmeric, garam masala',
        'salt, oil',
      ],
      steps: [
        'Fry the onions until golden, add ginger-garlic paste, then the keema. Break it up as it browns.',
        'Add the tomatoes, spices and salt and cook ten minutes.',
        'Add the peas and half a cup of water. Simmer fifteen minutes until the oil rises.',
      ],
    },
  },
  paya: {
    names: ['paya', 'trotter'],
    food: null,
    kind: 'meat',
    story:
      'Paya, goat trotters simmered for hours into a rich, sticky broth, is a Hyderabadi winter breakfast eaten with naan.',
    recipe: {
      name: 'Paya shorba',
      mins: 120,
      serves: 4,
      needs: [
        '6 cleaned goat trotters',
        '2 onions',
        '1 tbsp ginger-garlic paste',
        'whole spices: clove, cinnamon, cardamom, bay leaf, peppercorns',
        'turmeric, chilli powder, salt',
        'coriander and mint leaves',
        'lemon',
      ],
      steps: [
        'Pressure-cook the trotters with turmeric, salt and six cups of water for forty minutes.',
        'Fry the whole spices and onions, add ginger-garlic paste and chilli powder.',
        'Pour in the trotters with their broth and simmer thirty minutes.',
        'Finish with the leaves and a squeeze of lemon.',
      ],
    },
  },
  rohu: {
    names: ['rohu', 'chepa', 'chepalu'],
    fallback: ['fish'],
    food: 'rohu',
    kind: 'meat',
    story:
      'Rohu is the freshwater fish of the Krishna and Godavari tanks. In a chepala pulusu it is simmered in tamarind and left to sit, because the curry is better after a few hours.',
    recipe: {
      name: 'Chepala pulusu',
      mins: 35,
      serves: 4,
      needs: [
        '500 g rohu, in steaks',
        'lemon-sized ball of tamarind',
        '2 onions',
        '2 tomatoes',
        '4 green chillies',
        'chilli powder, coriander powder, turmeric',
        'salt, oil',
        'mustard seeds, fenugreek seeds, curry leaves',
      ],
      steps: [
        'Rub the fish with turmeric and salt.',
        'Fry the mustard and fenugreek seeds, curry leaves, onions and chillies. Add tomatoes and spices.',
        'Pour in the tamarind water and simmer ten minutes.',
        'Slide in the fish and cook eight minutes without stirring. Rest before serving.',
      ],
    },
  },
  prawns: {
    ids: ['p_prawns'],
    names: ['prawn', 'royyalu', 'jhinga', 'shrimp'],
    food: 'prawns',
    kind: 'meat',
    story:
      'Royyalu come up from the coast. They cook in minutes, and a minute too long turns them rubbery, so have everything else ready first.',
    recipe: {
      name: 'Royyala vepudu',
      mins: 20,
      serves: 3,
      needs: [
        '300 g prawns, shelled and deveined',
        '2 onions, sliced',
        '1 tbsp ginger-garlic paste',
        'chilli powder, turmeric, coriander powder',
        'curry leaves',
        'salt, oil',
      ],
      steps: [
        'Marinate the prawns with turmeric, chilli powder and salt for ten minutes.',
        'Fry the onions and curry leaves until golden, add ginger-garlic paste.',
        'Add the prawns and fry on high heat for four minutes. Finish with coriander powder.',
      ],
    },
  },
  eggs: {
    ids: ['p_eggs'],
    names: ['egg', 'guddu', 'ande'],
    food: 'egg',
    kind: 'egg',
    story: 'Natu kodi guddu are eggs from country hens: smaller, with a deeper yellow yolk.',
    recipe: {
      name: 'Kodi guddu pulusu',
      mins: 30,
      serves: 4,
      needs: [
        '6 eggs, boiled and shelled',
        'lemon-sized ball of tamarind',
        '2 onions',
        '2 green chillies',
        '1 tsp jaggery',
        'chilli powder, turmeric, salt',
        `${TEMPER}`,
      ],
      steps: [
        'Prick the eggs and fry them lightly until the skins blister.',
        'Fry the tempering, onions and chillies.',
        'Add tamarind water, jaggery, spices and salt and simmer ten minutes.',
        'Add the eggs and simmer five minutes more.',
      ],
    },
  },
};

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const BY_ID = new Map();
const BY_NAME = [];
const BY_FALLBACK = [];
for (const [key, entry] of Object.entries(KNOWLEDGE)) {
  for (const id of entry.ids || []) BY_ID.set(id, key);
  for (const n of entry.names || []) BY_NAME.push([norm(n), key]);
  for (const n of entry.fallback || []) BY_FALLBACK.push([norm(n), key]);
}
// Longest name first, so "drumstick leaves" is tried before "drumstick" and "raw banana" before "banana".
const longestFirst = (a, b) => b[0].length - a[0].length;
BY_NAME.sort(longestFirst);
BY_FALLBACK.sort(longestFirst);

const findIn = (table, texts) => {
  // the product's own name outranks its aliases
  for (const text of texts) {
    for (const [name, key] of table) {
      if (name && (text.includes(` ${name} `) || text.includes(` ${name}s `))) return key;
    }
  }
  return null;
};

/**
 * Find the entry for a product: by id first, then by the longest specific name that appears as whole
 * words in its name or aliases, then by a generic fallback word.
 * @param {{ id?: string, name?: string, aliases?: string[] }} product
 * @returns {string|null} a key of KNOWLEDGE
 */
export function knowledgeKeyFor(product) {
  if (!product) return null;
  if (product.id && BY_ID.has(product.id)) return BY_ID.get(product.id);
  const texts = [product.name, ...(product.aliases || [])].map((s) => ` ${norm(s)} `);
  return findIn(BY_NAME, texts) || findIn(BY_FALLBACK, texts);
}
