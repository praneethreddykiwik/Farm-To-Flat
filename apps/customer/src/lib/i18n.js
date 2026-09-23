/**
 * Reading language for the shopping app — English, Hindi, Telugu.
 *
 * Product and category names come from the SERVER: every product ships with all three names, so
 * switching is instant, works on the cached catalog offline, and one shopper changing language
 * cannot evict another's cache. This module holds the handful of interface strings that sit next to
 * them, and the fallback rule.
 *
 * The rule everywhere: a missing translation falls back to English rather than showing a blank or a
 * guess. A wrong product name is worse than an English one.
 */

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिंदी' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
];

export const isLanguage = (c) => LANGUAGES.some((l) => l.code === c);

/** A product's name in the chosen language, falling back to English. */
export const productLabel = (product, lang) =>
  (lang !== 'en' && product?.names?.[lang]) || product?.name || '';

/** A product's category name in the chosen language, falling back to English. */
export const categoryLabel = (product, lang) =>
  (lang !== 'en' && product?.categoryNames?.[lang]) || product?.categoryName || '';

/**
 * Interface strings. Only the words that sit beside a translated product name — translating the
 * whole app without a native speaker reviewing it would read worse than English.
 */
const STRINGS = {
  en: {
    language: 'Language',
    chooseLanguage: 'Choose your language',
    chooseLanguageSub: 'You can change this any time from your profile.',
    continue: 'Continue',
    addToBasket: 'Add to basket',
    inBasket: 'In your basket',
    soldOut: 'Sold out today',
    backTomorrow: 'Back tomorrow',
    perKg: 'per kg',
    freshToday: 'Fresh today',
  },
  hi: {
    language: 'भाषा',
    chooseLanguage: 'अपनी भाषा चुनें',
    chooseLanguageSub: 'आप इसे कभी भी अपनी प्रोफ़ाइल से बदल सकते हैं।',
    continue: 'आगे बढ़ें',
    addToBasket: 'टोकरी में डालें',
    inBasket: 'आपकी टोकरी में',
    soldOut: 'आज उपलब्ध नहीं',
    backTomorrow: 'कल फिर मिलेगा',
    perKg: 'प्रति किलो',
    freshToday: 'आज ताज़ा',
  },
  te: {
    language: 'భాష',
    chooseLanguage: 'మీ భాషను ఎంచుకోండి',
    chooseLanguageSub: 'దీన్ని మీ ప్రొఫైల్‌లో ఎప్పుడైనా మార్చుకోవచ్చు.',
    continue: 'కొనసాగించు',
    addToBasket: 'బుట్టలో వేయండి',
    inBasket: 'మీ బుట్టలో',
    soldOut: 'ఈరోజు అయిపోయింది',
    backTomorrow: 'రేపు వస్తుంది',
    perKg: 'కిలోకు',
    freshToday: 'ఈరోజు తాజా',
  },
};

/** Interface string in the chosen language, falling back to English. */
export const t = (key, lang) => STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;

/**
 * Words for the greeting rail that cycles through the languages we serve. Deliberately the same
 * few ideas in each script, so the rail reads as one sentence rotating rather than three unrelated
 * phrases — and so a shopper recognises their own language going past.
 */
export const RAIL_WORDS = [
  { en: 'Fresh today', hi: 'आज ताज़ा', te: 'ఈరోజు తాజా' },
  { en: 'From the farm', hi: 'खेत से', te: 'పొలం నుండి' },
  { en: 'Picked this morning', hi: 'आज सुबह तोड़ा', te: 'ఈ ఉదయం కోసినవి' },
  { en: 'At your door', hi: 'आपके दरवाज़े पर', te: 'మీ ఇంటి వద్దకు' },
];
