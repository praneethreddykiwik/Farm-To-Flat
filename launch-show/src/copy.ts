// ─────────────────────────────────────────────────────────────────────────────
//  EVERY WORD ON SCREEN LIVES HERE.  Edit this file to change the story.
//  Wrap a word in *stars* to give it the accent colour.  "\n" starts a new line.
//  Keep lines short: a hall reads 6–8 words per beat, not sentences.
// ─────────────────────────────────────────────────────────────────────────────

export const EVENT = {
  // Shown under "Officially launched". Set to '' to hide.
  dateline: 'HYDERABAD  ·  29 NOVEMBER 2026',
};

// The three codes on the final screen. `url` is what the code opens; `short` is the typed
// fallback printed under the tile for anyone whose camera will not lock on.
export const QR_CODES = [
  {
    label: 'Android',
    sub: 'Google Play',
    url: 'https://play.google.com/store/apps/details?id=in.fooducia.customer',
    short: 'Play Store → “Fooducia”',
  },
  {
    label: 'iPhone',
    sub: 'App Store',
    // TODO(before the event): replace with the real App Store link once the listing is live.
    url: 'https://fooducia.in/ios',
    short: 'App Store → “Fooducia”',
  },
  {
    label: 'Website',
    sub: 'fooducia.in',
    url: 'https://fooducia.in',
    short: 'fooducia.in',
  },
] as const;

export const S1 = {
  eyebrow: 'IT STARTED WITH A QUESTION',
  question: 'What are we\n*really* eating\ntoday?',
  tags: ['Picked when?', 'Grown where?', 'By whom?'],
  ancestors: 'Our grandparents\n*never had to ask.*',
  ancestorsSub: 'Picked at dawn. On the plate by noon.',
};

export const S2 = {
  eyebrow: 'TODAY',
  problem: 'Today, our food *waits.*',
  problemSub: 'Hand to hand. Day after day.',
  stops: ['FARM', 'TRADER', 'MANDI', 'STORAGE', 'WHOLESALER', 'SHOP', 'YOUR KITCHEN'],
  turn: 'What if it *didn’t* have to?',
  idea: 'As fresh as it\ncan *possibly* be.',
  ideaSub: 'That is where the idea rose.',
};

export const S3 = {
  intro: 'That’s where',
  promise: 'From harvest to your home. *Overnight.*',
  beats: [
    { when: 'TONIGHT', what: 'You order' },
    { when: 'AT DAWN', what: 'We harvest' },
    { when: 'BY MORNING', what: 'At your door' },
  ],
  nos: ['No cold storage', 'No long waits', 'No middle stops'],
  close: 'Harvested *after*\nyou order.',
};

export const S4 = {
  title: 'And every vegetable\nhas a *story.*',
  rail: 'IN SEASON NOW',
  panels: ['GOOD TO KNOW', 'ITS STORY', 'COOK IT TONIGHT'],
  // "has" lists what the vegetable naturally contains — no health or medicinal claim is made.
  // Have the dietitian sign these off before the same wording ships in the app.
  items: [
    {
      key: 'ponnaganti',
      name: 'Ponnaganti kura',
      telugu: 'పొన్నగంటి కూర',
      has: ['Iron', 'Calcium', 'Vitamin A'],
      story: 'A monsoon green Telugu kitchens have cooked for generations.',
      recipe: 'Ponnaganti pappu',
      mins: '25 min',
    },
    {
      key: 'gongura',
      name: 'Gongura',
      telugu: 'గోంగూర',
      has: ['Iron', 'Vitamin C', 'Folate'],
      story: 'The sour leaf behind Andhra’s most loved pachadi.',
      recipe: 'Gongura pachadi',
      mins: '20 min',
    },
    {
      key: 'beetroot',
      name: 'Beetroot',
      telugu: 'బీట్‌రూట్',
      has: ['Folate', 'Fibre', 'Potassium'],
      story: 'Sweet, earthy, and at its best through the winter.',
      recipe: 'Beetroot poriyal',
      mins: '15 min',
    },
  ],
  close: 'Know what you eat.',
};

export const S5 = {
  captions: [
    { k: 'Open', line: 'Tonight’s harvest,\nin your hand.' },
    { k: 'Add', line: 'Tap. It’s in\nyour basket.' },
    { k: 'Know', line: 'Every item:\nfacts, story, recipe.' },
    { k: 'Track', line: 'Watch it travel\nfrom the field.' },
    { k: 'Soon', line: 'A diet plan\nmade *for you.*' },
  ],
  comingSoon: 'COMING SOON',
};

export const S6 = {
  prompt: 'PRESS  ENTER  TO  LAUNCH',
};

export const S7 = {
  launched: 'Officially launched',
  scan: 'Scan. Download. Order tonight.',
};
