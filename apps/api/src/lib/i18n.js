/**
 * Localisation for the procurement purchase list — English, Hindi (Devanagari), Telugu (Telugu
 * script). Only the procurement CSV is localised (that's what goes to the field buyer). Product
 * names in Telugu reuse the catalog's own vetted Telugu aliases; Hindi uses the map below. Anything
 * without a translation falls back to English rather than guessing.
 */

export const LANGS = ['en', 'hi', 'te'];
export const LANG_LABEL = { en: 'English', hi: 'हिंदी', te: 'తెలుగు' };

export const CSV_HEADERS = {
  en: [
    'Category',
    'Product',
    'Source',
    'Orders',
    'Required',
    'Unit',
    'Buffer %',
    'To procure',
    'Est. cost',
    'Bought',
  ],
  hi: [
    'श्रेणी',
    'उत्पाद',
    'स्रोत',
    'ऑर्डर',
    'ज़रूरत',
    'इकाई',
    'बफ़र %',
    'खरीदें',
    'अनुमानित लागत',
    'खरीदा',
  ],
  te: [
    'వర్గం',
    'ఉత్పత్తి',
    'మూలం',
    'ఆర్డర్లు',
    'అవసరం',
    'యూనిట్',
    'బఫర్ %',
    'కొనాలి',
    'అంచనా ఖర్చు',
    'కొన్నారు',
  ],
};

const CATEGORY = {
  hi: {
    cat_leafy: 'पत्तेदार सब्ज़ियाँ',
    cat_veg: 'सब्ज़ियाँ',
    cat_gourd: 'लौकी और फलियाँ',
    cat_fruit: 'फल',
    cat_herb: 'मसाले और जड़ी-बूटियाँ',
    cat_sprout: 'अंकुरित और अनाज',
    cat_meat: 'मांस और मछली',
  },
  te: {
    cat_leafy: 'ఆకుకూరలు',
    cat_veg: 'కూరగాయలు',
    cat_gourd: 'సొరకాయలు & చిక్కుళ్ళు',
    cat_fruit: 'పండ్లు',
    cat_herb: 'మసాలాలు & సుగంధ ద్రవ్యాలు',
    cat_sprout: 'మొలకలు & ధాన్యాలు',
    cat_meat: 'మాంసం & చేపలు',
  },
};

const UNIT = {
  en: { KG: 'kg', BUNCH: 'bunch', PIECE: 'pc', DOZEN: 'dozen', PACK: 'pack' },
  hi: { KG: 'किग्रा', BUNCH: 'गड्डी', PIECE: 'नग', DOZEN: 'दर्जन', PACK: 'पैक' },
  te: { KG: 'కేజీ', BUNCH: 'కట్ట', PIECE: 'ముక్క', DOZEN: 'డజను', PACK: 'ప్యాక్' },
};

export const YES = { en: 'yes', hi: 'हाँ', te: 'అవును' };

/** Hindi (Devanagari) product names. Missing ids fall back to English. */
const HINDI_NAMES = {
  p_palak: 'पालक',
  p_menthi: 'मेथी',
  p_thota: 'चौलाई',
  p_gongura: 'अंबाडी',
  p_ponnaganti: 'पोन्नगंटी',
  p_coriander: 'धनिया',
  p_mint: 'पुदीना',
  p_curry: 'करी पत्ता',
  p_spring: 'हरा प्याज़',
  p_ginger: 'अदरक',
  p_garlic: 'लहसुन',
  p_chilli: 'हरी मिर्च',
  p_lemon: 'नींबू',
  p_tomato: 'टमाटर',
  p_onion: 'प्याज़',
  p_potato: 'आलू',
  p_brinjal: 'बैंगन',
  p_okra: 'भिंडी',
  p_carrot: 'गाजर',
  p_beet: 'चुकंदर',
  p_cabbage: 'पत्ता गोभी',
  p_cauli: 'फूलगोभी',
  p_capsicum: 'शिमला मिर्च',
  p_corn: 'भुट्टा',
  p_radish: 'मूली',
  p_cucumber: 'खीरा',
  p_pumpkin: 'कद्दू',
  p_drumstick: 'सहजन',
  p_rawbanana: 'कच्चा केला',
  p_jackfruit: 'कटहल',
  p_karela: 'करेला',
  p_bottle: 'लौकी',
  p_ridge: 'तुरई',
  p_ivy: 'टिंडोरा',
  p_snake: 'चिचिंडा',
  p_cluster: 'ग्वार फली',
  p_frenchbean: 'फ्रेंच बीन्स',
  p_broadbean: 'सेम',
  p_banana: 'केला',
  p_papaya: 'पपीता',
  p_guava: 'अमरूद',
  p_pomegranate: 'अनार',
  p_grapes: 'हरे अंगूर',
  p_iceapple: 'ताड़गोला',
  p_moong_sprout: 'अंकुरित मूंग',
  p_chana_sprout: 'अंकुरित काला चना',
  p_chana_soaked: 'भिगोया चना',
  p_almond_soaked: 'भिगोया बादाम',
  p_chicken: 'चिकन',
  p_mutton: 'मटन',
  p_prawns: 'झींगा',
  p_eggs: 'अंडे',
};

/**
 * Translations keyed by the ENGLISH NAME rather than the product id.
 *
 * The maps above are keyed by seed ids, so a product the operator adds through the admin panel gets
 * a generated id and no translation at all — it would silently show English to a Telugu reader
 * forever. Matching on the name instead means a newly added "Rohu fish" is translated the day it
 * appears. Lower-cased and trimmed, so capitalisation in the admin form does not matter.
 */
const BY_NAME = {
  'rohu fish': { hi: 'रोहू मछली', te: 'బొచ్చె చేప' },
  'katla fish': { hi: 'कतला मछली', te: 'బొచ్చె చేప' },
  fish: { hi: 'मछली', te: 'చేప' },
  prawns: { hi: 'झींगा', te: 'రొయ్యలు' },
  chicken: { hi: 'चिकन', te: 'కోడి మాంసం' },
  mutton: { hi: 'मटन', te: 'మటన్' },
  eggs: { hi: 'अंडे', te: 'కోడిగుడ్లు' },
  curd: { hi: 'दही', te: 'పెరుగు' },
  milk: { hi: 'दूध', te: 'పాలు' },
  paneer: { hi: 'पनीर', te: 'పనీర్' },
};

const byName = (product, lang) =>
  BY_NAME[
    String(product?.name || '')
      .trim()
      .toLowerCase()
  ]?.[lang];

/** Telugu fallbacks for the few catalog items without a Telugu-script alias. */
const TELUGU_FALLBACK = {
  p_spring: 'ఉల్లికాడలు',
  p_beet: 'బీట్‌రూట్',
  p_capsicum: 'క్యాప్సికం',
};

const hasTelugu = (s) => /[ఀ-౿]/.test(s);

/** Localised product name; Telugu prefers the catalog's own Telugu alias. */
export function productName(product, lang) {
  if (lang === 'te') {
    const alias = (product.aliases || []).find(hasTelugu);
    return alias || TELUGU_FALLBACK[product.id] || byName(product, 'te') || product.name;
  }
  if (lang === 'hi') return HINDI_NAMES[product.id] || byName(product, 'hi') || product.name;
  return product.name;
}

export const categoryName = (id, english, lang) => CATEGORY[lang]?.[id] || english;
export const unitLabel = (unit, lang) => UNIT[lang]?.[unit] || UNIT.en[unit] || unit;
