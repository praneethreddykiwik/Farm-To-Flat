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
 * Interface strings.
 *
 * This began as only the words sitting beside a translated product name, on the reasoning that
 * translating the whole app without a native speaker reviewing it reads worse than English. The
 * basket and checkout were then reported as "still English in Telugu", and they are the screens a
 * shopper spends real money on — a half-translated app is more confusing than either extreme, so
 * those two are now covered end to end.
 *
 * THE HINDI AND TELUGU BELOW HAVE NOT BEEN REVIEWED BY A NATIVE SPEAKER. They are careful but they
 * are not authored by someone who shops in these languages. Have Tharun read the basket and
 * checkout in each before this is considered finished; the fallback rule means a key deleted here
 * degrades to English rather than breaking.
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
    // basket
    yourBasket: 'Your basket',
    item: 'item',
    items: 'items',
    pricesLock: 'prices lock at checkout',
    nothingYet: 'Nothing here yet',
    emptyBasket: 'An empty basket',
    emptyBasketSub: 'Add anything from the catalog. Minimum order is ₹500 and delivery is free.',
    browse: 'Browse',
    addMoreItems: 'Add more items',
    addNote: 'Add a note',
    editNote: 'Edit note',
    notePlaceholder: 'e.g. clean and cut into curry pieces',
    remove: 'Remove',
    close: 'Close',
    addCoupon: 'Add a coupon',
    couponSource: 'From the brochure or the packet sticker',
    tapToRemove: 'tap to remove',
    subtotal: 'Subtotal',
    coupon: 'Coupon',
    delivery: 'Delivery',
    free: 'Free',
    total: 'Total',
    checkout: 'Checkout',
    viewBasket: 'View basket',
    inYourBasket: 'in your basket',
    readyToCheckout: 'Ready to check out',
    // checkout
    loadingBasket: 'Loading your basket…',
    addDeliveryAddress: 'Add a delivery address',
    change: 'Change',
    onePerOrder: 'One per order',
    payFromWalletFirst: 'Pay from wallet first',
    toPayNow: 'To pay now',
    deliveryWindow: 'Delivery window',
    useThisWindow: 'Use this window',
    deliverTo: 'Deliver to',
    defaultAddress: 'Default',
    addAnotherAddress: 'Add another address',
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
    // basket
    yourBasket: 'आपकी टोकरी',
    item: 'वस्तु',
    items: 'वस्तुएँ',
    pricesLock: 'चेकआउट पर दाम तय हो जाते हैं',
    nothingYet: 'अभी कुछ नहीं',
    emptyBasket: 'टोकरी खाली है',
    emptyBasketSub: 'सूची में से कुछ भी डालें। कम से कम ₹500 का ऑर्डर, डिलीवरी मुफ़्त।',
    browse: 'देखें',
    addMoreItems: 'और सामान डालें',
    addNote: 'निर्देश जोड़ें',
    editNote: 'निर्देश बदलें',
    notePlaceholder: 'जैसे साफ़ करके करी के टुकड़े काट दें',
    remove: 'हटाएँ',
    close: 'बंद करें',
    addCoupon: 'कूपन लगाएँ',
    couponSource: 'ब्रोशर या पैकेट के स्टिकर से',
    tapToRemove: 'हटाने के लिए दबाएँ',
    subtotal: 'कुल सामान',
    coupon: 'कूपन',
    delivery: 'डिलीवरी',
    free: 'मुफ़्त',
    total: 'कुल',
    checkout: 'आगे बढ़ें',
    viewBasket: 'टोकरी देखें',
    inYourBasket: 'आपकी टोकरी में',
    readyToCheckout: 'ऑर्डर करने के लिए तैयार',
    // checkout
    loadingBasket: 'आपकी टोकरी खुल रही है…',
    addDeliveryAddress: 'डिलीवरी का पता जोड़ें',
    change: 'बदलें',
    onePerOrder: 'एक ऑर्डर पर एक',
    payFromWalletFirst: 'पहले वॉलेट से भुगतान',
    toPayNow: 'अभी देना है',
    deliveryWindow: 'डिलीवरी का समय',
    useThisWindow: 'यही समय चुनें',
    deliverTo: 'यहाँ पहुँचाएँ',
    defaultAddress: 'मुख्य',
    addAnotherAddress: 'दूसरा पता जोड़ें',
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
    // basket
    yourBasket: 'మీ బుట్ట',
    item: 'వస్తువు',
    items: 'వస్తువులు',
    pricesLock: 'చెక్‌అవుట్‌లో ధరలు ఖరారు',
    nothingYet: 'ఇంకా ఏమీ లేదు',
    emptyBasket: 'బుట్ట ఖాళీగా ఉంది',
    emptyBasketSub: 'జాబితా నుండి ఏదైనా వేసుకోండి. కనీసం ₹500 ఆర్డర్, డెలివరీ ఉచితం.',
    browse: 'చూడండి',
    addMoreItems: 'మరిన్ని వేయండి',
    addNote: 'సూచన రాయండి',
    editNote: 'సూచన మార్చండి',
    notePlaceholder: 'ఉదా. శుభ్రం చేసి కూర ముక్కలుగా కోయండి',
    remove: 'తీసేయండి',
    close: 'మూసివేయి',
    addCoupon: 'కూపన్ వేయండి',
    couponSource: 'బ్రోషర్ లేదా ప్యాకెట్ స్టిక్కర్ నుండి',
    tapToRemove: 'తీసేయడానికి నొక్కండి',
    subtotal: 'సరుకుల మొత్తం',
    coupon: 'కూపన్',
    delivery: 'డెలివరీ',
    free: 'ఉచితం',
    total: 'మొత్తం',
    checkout: 'చెక్‌అవుట్',
    viewBasket: 'బుట్ట చూడండి',
    inYourBasket: 'మీ బుట్టలో',
    readyToCheckout: 'ఆర్డర్ చేయడానికి సిద్ధం',
    // checkout
    loadingBasket: 'మీ బుట్ట తెరుచుకుంటోంది…',
    addDeliveryAddress: 'డెలివరీ చిరునామా జోడించండి',
    change: 'మార్చు',
    onePerOrder: 'ఒక ఆర్డర్‌కు ఒకటి',
    payFromWalletFirst: 'ముందు వాలెట్ నుండి చెల్లించు',
    toPayNow: 'ఇప్పుడు చెల్లించాలి',
    deliveryWindow: 'డెలివరీ సమయం',
    useThisWindow: 'ఈ సమయాన్ని ఎంచుకో',
    deliverTo: 'ఇక్కడికి పంపండి',
    defaultAddress: 'ప్రధానం',
    addAnotherAddress: 'మరో చిరునామా జోడించండి',
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
  { en: 'From the farm', hi: 'खेत సे', te: 'పొలం నుండి' },
  { en: 'Picked this morning', hi: 'आज సुबह तोड़ा', te: 'ఈ ఉదయం కోసినవి' },
  { en: 'At your door', hi: 'आपके दरवाज़े पर', te: 'మీ ఇంటి వద్దకు' },
];
