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
    privacyPolicy: 'Privacy policy',
    termsAndConditions: 'Terms & conditions',
    windowMORNING: 'Morning',
    windowEVENING: 'Evening',
    windowAFTERNOON: 'Afternoon',
    windowNIGHT: 'Night',
    amShort: 'am',
    pmShort: 'pm',
    priceLockNote:
      'Prices lock when you place the order. Variable-weight items are billed on packed weight, within ±10%. Cancel free until the evening before your window.',
    howYoullPay: "How you'll pay",
    payNow: 'Pay now',
    payNowSub: 'UPI, card or wallet',
    cashOnDelivery: 'Cash on delivery',
    cashOnDeliverySub: 'Pay at your door',
    deliveryInstructions: 'Delivery instructions (optional)',
    deliveryInstructionsHint: 'Gate code, or leave with the guard…',
    beforeYouPay: 'Before you pay',
    summary: 'Summary',
    wallet: 'Wallet',
    communityBlockFlat: 'Community, block and flat',
    chooseDeliveryWindow: 'Choose a delivery window',
    chooseDeliveryWindowSub: 'Pick the day and window that suit you',
    payAtTheDoor: 'Pay at the door',
    payViaRazorpay: 'Pay via Razorpay',
    coveredByWallet: 'Covered by wallet',
    placeOrderPayCash: 'Place order · pay cash',
    payAndPlaceOrder: 'Pay & place order',
    placeOrder: 'Place order',
    paidOnlineAbove: 'Orders above ₹{amount} are paid online.',
    walletRemainder: 'Balance ₹{amount} · remainder via Razorpay',
    noWalletBalance: 'No balance yet. Everything goes via Razorpay.',
    back: 'Back',
    acceptTermsTitle: 'Please read and accept the terms',
    acceptTermsBody:
      'They cover cancellations, weighed items and what to do if something is wrong.',
    windowClosedTitle: 'That window just closed',
    windowClosedBody: 'Please pick another delivery window.',
    paymentCancelledTitle: 'Payment cancelled',
    paymentCancelledBody: 'Your basket is still here. Try again when ready.',
    paymentUnavailableTitle: 'Payment unavailable',
    couldNotPlaceOrder: 'Could not place order',
    couldNotConfirmPayment: 'Could not confirm payment',
    termsConsent: 'I have read and agree to these terms.',
    term1Title: 'Cancel free until we start packing',
    term1Body:
      'Once your bag is being packed you can still ask us to cancel, but our team has to approve it — the produce has already been weighed out for you.',
    term2Title: 'Check your produce at the door',
    term2Body:
      'Please look through the bag while the delivery partner is still with you. It is much easier to put right there and then.',
    term3Title: 'Something not right? Photograph it',
    term3Body:
      'Show the delivery partner, or send us a photo from your order screen. We review it and replace the item or refund it — no argument.',
    term4Title: 'Weighed items are billed on actual weight',
    term4Body:
      'Meat, fish and loose vegetables are cut and weighed fresh, so the final amount can differ from the estimate by up to 10%.',
    term5Title: 'Someone needs to be reachable',
    term5Body:
      'We call from downstairs. If nobody answers we leave the bag with your security desk and mark it delivered.',
    reachMinimum: "You're at ₹{built} — add ₹{more} more to reach the ₹500 minimum",
    overMinimum: 'Your basket is over the minimum',
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
    privacyPolicy: 'निजता नीति',
    termsAndConditions: 'नियम और शर्तें',
    windowMORNING: 'सुबह',
    windowEVENING: 'शाम',
    windowAFTERNOON: 'दोपहर',
    windowNIGHT: 'रात',
    amShort: 'पूर्वाह्न',
    pmShort: 'अपराह्न',
    priceLockNote:
      'ऑर्डर करते ही दाम तय हो जाते हैं। तौले जाने वाले सामान का बिल पैक किए गए वज़न पर बनता है, ±10% के भीतर। अपने डिलीवरी समय से पिछली शाम तक मुफ़्त रद्द करें।',
    howYoullPay: 'भुगतान कैसे करेंगे',
    payNow: 'अभी भुगतान करें',
    payNowSub: 'UPI, कार्ड या वॉलेट',
    cashOnDelivery: 'डिलीवरी पर नकद',
    cashOnDeliverySub: 'अपने दरवाज़े पर भुगतान करें',
    deliveryInstructions: 'डिलीवरी निर्देश (वैकल्पिक)',
    deliveryInstructionsHint: 'गेट कोड, या गार्ड के पास छोड़ें…',
    beforeYouPay: 'भुगतान से पहले',
    summary: 'सारांश',
    wallet: 'वॉलेट',
    communityBlockFlat: 'कम्युनिटी, ब्लॉक और फ्लैट',
    chooseDeliveryWindow: 'डिलीवरी समय चुनें',
    chooseDeliveryWindowSub: 'आपको जो दिन और समय ठीक लगे वह चुनें',
    payAtTheDoor: 'दरवाज़े पर भुगतान',
    payViaRazorpay: 'Razorpay से भुगतान',
    coveredByWallet: 'वॉलेट से पूरा',
    placeOrderPayCash: 'ऑर्डर करें · नकद',
    payAndPlaceOrder: 'भुगतान करें और ऑर्डर करें',
    placeOrder: 'ऑर्डर करें',
    paidOnlineAbove: '₹{amount} से ऊपर के ऑर्डर ऑनलाइन चुकाए जाते हैं।',
    walletRemainder: 'बैलेंस ₹{amount} · बाकी Razorpay से',
    noWalletBalance: 'अभी कोई बैलेंस नहीं। सब कुछ Razorpay से।',
    back: 'वापस',
    acceptTermsTitle: 'कृपया शर्तें पढ़कर स्वीकार करें',
    acceptTermsBody:
      'इनमें रद्दीकरण, तौले जाने वाले सामान और कुछ गलत होने पर क्या करें — यह शामिल है।',
    windowClosedTitle: 'वह समय अभी बंद हो गया',
    windowClosedBody: 'कृपया दूसरा डिलीवरी समय चुनें।',
    paymentCancelledTitle: 'भुगतान रद्द',
    paymentCancelledBody: 'आपकी टोकरी अब भी यहीं है। तैयार हों तो फिर कोशिश करें।',
    paymentUnavailableTitle: 'भुगतान उपलब्ध नहीं',
    couldNotPlaceOrder: 'ऑर्डर नहीं हो सका',
    couldNotConfirmPayment: 'भुगतान की पुष्टि नहीं हो सकी',
    termsConsent: 'मैंने ये शर्तें पढ़ ली हैं और सहमत हूँ।',
    term1Title: 'पैकिंग शुरू होने तक मुफ़्त रद्द करें',
    term1Body:
      'पैकिंग शुरू होने के बाद भी आप रद्द करने को कह सकते हैं, पर हमारी टीम को मंज़ूरी देनी होगी — सामान आपके लिए तौला जा चुका होता है।',
    term2Title: 'दरवाज़े पर ही सामान जाँच लें',
    term2Body: 'डिलीवरी पार्टनर के रहते ही बैग देख लें। उसी समय ठीक करना कहीं आसान होता है।',
    term3Title: 'कुछ ठीक नहीं? फ़ोटो लें',
    term3Body:
      'डिलीवरी पार्टनर को दिखाएँ, या ऑर्डर स्क्रीन से हमें फ़ोटो भेजें। हम देखकर सामान बदल देते हैं या पैसे लौटा देते हैं — बिना बहस।',
    term4Title: 'तौले जाने वाले सामान का बिल असली वज़न पर',
    term4Body:
      'मांस, मछली और खुली सब्ज़ियाँ ताज़ा काटकर तौली जाती हैं, इसलिए अंतिम राशि अनुमान से 10% तक अलग हो सकती है।',
    term5Title: 'कोई संपर्क में होना चाहिए',
    term5Body:
      'हम नीचे से कॉल करते हैं। कोई न उठाए तो बैग सिक्योरिटी डेस्क पर छोड़कर डिलीवर मान लेते हैं।',
    reachMinimum: 'आप ₹{built} पर हैं — ₹500 की न्यूनतम राशि तक ₹{more} और जोड़ें',
    overMinimum: 'आपकी टोकरी न्यूनतम राशि से ऊपर है',
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
    privacyPolicy: 'గోప్యతా విధానం',
    termsAndConditions: 'నిబంధనలు మరియు షరతులు',
    windowMORNING: 'ఉదయం',
    windowEVENING: 'సాయంత్రం',
    windowAFTERNOON: 'మధ్యాహ్నం',
    windowNIGHT: 'రాత్రి',
    amShort: 'ఉ',
    pmShort: 'సా',
    priceLockNote:
      'ఆర్డర్ చేసిన వెంటనే ధరలు ఖరారు అవుతాయి. తూకం వేసే వస్తువులకు ప్యాక్ చేసిన బరువు ప్రకారం బిల్లు, ±10% లోపు. మీ డెలివరీ సమయానికి ముందు సాయంత్రం వరకు ఉచితంగా రద్దు చేయవచ్చు.',
    howYoullPay: 'మీరు ఎలా చెల్లిస్తారు',
    payNow: 'ఇప్పుడే చెల్లించండి',
    payNowSub: 'UPI, కార్డ్ లేదా వాలెట్',
    cashOnDelivery: 'డెలివరీ సమయంలో నగదు',
    cashOnDeliverySub: 'మీ ఇంటి వద్ద చెల్లించండి',
    deliveryInstructions: 'డెలివరీ సూచనలు (ఐచ్ఛికం)',
    deliveryInstructionsHint: 'గేట్ కోడ్, లేదా సెక్యూరిటీ వద్ద ఇవ్వండి…',
    beforeYouPay: 'చెల్లించే ముందు',
    summary: 'సారాంశం',
    wallet: 'వాలెట్',
    communityBlockFlat: 'కమ్యూనిటీ, బ్లాక్ మరియు ఫ్లాట్',
    chooseDeliveryWindow: 'డెలివరీ సమయాన్ని ఎంచుకోండి',
    chooseDeliveryWindowSub: 'మీకు నచ్చిన రోజు, సమయం ఎంచుకోండి',
    payAtTheDoor: 'ఇంటి వద్ద చెల్లింపు',
    payViaRazorpay: 'Razorpay ద్వారా చెల్లింపు',
    coveredByWallet: 'వాలెట్‌తో పూర్తి',
    placeOrderPayCash: 'ఆర్డర్ చేయండి · నగదు',
    payAndPlaceOrder: 'చెల్లించి ఆర్డర్ చేయండి',
    placeOrder: 'ఆర్డర్ చేయండి',
    paidOnlineAbove: '₹{amount} పైన ఆర్డర్‌లు ఆన్‌లైన్‌లో చెల్లించాలి.',
    walletRemainder: 'బ్యాలెన్స్ ₹{amount} · మిగిలినది Razorpay ద్వారా',
    noWalletBalance: 'ఇంకా బ్యాలెన్స్ లేదు. మొత్తం Razorpay ద్వారా.',
    back: 'వెనుకకు',
    acceptTermsTitle: 'దయచేసి నిబంధనలు చదివి అంగీకరించండి',
    acceptTermsBody: 'ఇవి రద్దు, తూకం వేసే వస్తువులు, ఏదైనా తప్పు జరిగితే ఏం చేయాలో చెబుతాయి.',
    windowClosedTitle: 'ఆ సమయం ఇప్పుడే ముగిసింది',
    windowClosedBody: 'దయచేసి వేరే డెలివరీ సమయం ఎంచుకోండి.',
    paymentCancelledTitle: 'చెల్లింపు రద్దైంది',
    paymentCancelledBody: 'మీ బుట్ట ఇంకా ఇక్కడే ఉంది. సిద్ధమైనప్పుడు మళ్లీ ప్రయత్నించండి.',
    paymentUnavailableTitle: 'చెల్లింపు అందుబాటులో లేదు',
    couldNotPlaceOrder: 'ఆర్డర్ చేయలేకపోయాం',
    couldNotConfirmPayment: 'చెల్లింపును నిర్ధారించలేకపోయాం',
    termsConsent: 'నేను ఈ నిబంధనలు చదివాను, అంగీకరిస్తున్నాను.',
    term1Title: 'ప్యాకింగ్ మొదలయ్యే వరకు ఉచితంగా రద్దు',
    term1Body:
      'ప్యాకింగ్ మొదలయ్యాక కూడా రద్దు కోరవచ్చు, కానీ మా బృందం అంగీకరించాలి — సరుకు అప్పటికే మీ కోసం తూకం వేయబడి ఉంటుంది.',
    term2Title: 'ఇంటి వద్దే సరుకు పరిశీలించండి',
    term2Body: 'డెలివరీ వ్యక్తి ఉండగానే బ్యాగ్ చూడండి. అప్పుడే సరిచేయడం చాలా సులభం.',
    term3Title: 'ఏదైనా సరిగా లేదా? ఫోటో తీయండి',
    term3Body:
      'డెలివరీ వ్యక్తికి చూపండి, లేదా ఆర్డర్ స్క్రీన్ నుండి ఫోటో పంపండి. మేము చూసి వస్తువు మారుస్తాం లేదా డబ్బు తిరిగి ఇస్తాం — వాదన లేకుండా.',
    term4Title: 'తూకం వేసే వస్తువులకు అసలు బరువు ప్రకారం బిల్లు',
    term4Body:
      'మాంసం, చేపలు, విడి కూరగాయలు తాజాగా కోసి తూకం వేస్తారు, కాబట్టి చివరి మొత్తం అంచనా కంటే 10% వరకు మారవచ్చు.',
    term5Title: 'ఎవరైనా అందుబాటులో ఉండాలి',
    term5Body:
      'మేము కింద నుండి కాల్ చేస్తాం. ఎవరూ తీయకపోతే బ్యాగ్ సెక్యూరిటీ వద్ద ఇచ్చి డెలివరీ అయినట్టు గుర్తిస్తాం.',
    reachMinimum: 'మీరు ₹{built} వద్ద ఉన్నారు — ₹500 కనిష్ఠానికి ఇంకా ₹{more} జోడించండి',
    overMinimum: 'మీ బుట్ట కనిష్ఠాన్ని దాటింది',
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
/**
 * A string in the chosen language, falling back to English then to the key itself. `params` fills
 * {placeholders} — added for the basket's minimum-order line, which has to carry live rupee amounts
 * and so cannot be a fixed sentence.
 */
export const t = (key, lang, params) => {
  const s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
};

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
