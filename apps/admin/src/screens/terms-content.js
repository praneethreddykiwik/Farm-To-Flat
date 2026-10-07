/**
 * Terms & Conditions, in the three languages the app offers.
 *
 * THE HINDI AND TELUGU HAVE NOT BEEN REVIEWED BY A LAWYER OR A NATIVE SPEAKER. They are a careful
 * translation of the English, not an independently drafted set of terms, and these are operative
 * terms a customer agrees to when they pay. The English remains the governing version and each
 * translated page says so — see `governingNote` — which is the usual way to publish a translated
 * contract without the translation becoming a second, differently-worded agreement.
 *
 * Structure mirrors the English exactly so the page renders identically in every language: a list
 * of sections, each with a heading and either paragraphs, a term/description list, or both.
 * `CONTACT` is interpolated so the support address stays in one place.
 */

export const UPDATED = {
  en: '1 October 2026',
  hi: '1 अक्टूबर 2026',
  te: '1 అక్టోబర్ 2026',
};

export const CHROME = {
  en: {
    title: 'Terms & Conditions',
    updated: 'Last updated',
    lede: 'These terms explain how ordering, delivery, cancellation and refunds work on Fooducia, and what to expect from us and from you as a customer — in plain language.',
    governingNote: null,
    languageLabel: 'Language',
  },
  hi: {
    title: 'नियम और शर्तें',
    updated: 'अंतिम बार अपडेट किया गया',
    lede: 'ये शर्तें सरल भाषा में बताती हैं कि फ़ार्म टू फ्लैट पर ऑर्डर, डिलीवरी, रद्दीकरण और रिफंड कैसे काम करते हैं, और एक ग्राहक के रूप में आप हमसे और हम आपसे क्या उम्मीद कर सकते हैं।',
    governingNote:
      'यह अंग्रेज़ी शर्तों का अनुवाद है, जो आपकी सुविधा के लिए दिया गया है। किसी भी अंतर की स्थिति में अंग्रेज़ी संस्करण ही मान्य होगा।',
    languageLabel: 'भाषा',
  },
  te: {
    title: 'నిబంధనలు మరియు షరతులు',
    updated: 'చివరిగా నవీకరించినది',
    lede: 'Fooducia‌లో ఆర్డర్, డెలివరీ, రద్దు మరియు రీఫండ్ ఎలా పని చేస్తాయో, అలాగే కస్టమర్‌గా మీరు మా నుండి మరియు మేము మీ నుండి ఏమి ఆశించవచ్చో ఈ నిబంధనలు సరళమైన భాషలో వివరిస్తాయి.',
    governingNote:
      'ఇది ఆంగ్ల నిబంధనల అనువాదం, మీ సౌలభ్యం కోసం అందించబడింది. ఏదైనా తేడా ఉంటే ఆంగ్ల ప్రతియే చెల్లుబాటు అవుతుంది.',
    languageLabel: 'భాష',
  },
};

const EN = (CONTACT) => [
  {
    id: 'who',
    h: 'Who we are',
    p: [
      'Fooducia ("we", "us") operates a mobile app that lets residents of participating gated communities in Hyderabad, India pre-order fresh vegetables, greens and meat for delivery in a chosen morning or evening window. By creating an account or placing an order, you agree to these terms.',
    ],
  },
  {
    id: 'eligibility',
    h: 'Eligibility & account',
    list: [
      [
        'Who can order',
        'you must be at least 18 years old, able to enter a binding contract under Indian law, and reside in or have delivery access to a serviceable community.',
      ],
      [
        'Sign-in',
        'accounts are verified by a one-time password (OTP) sent to your mobile number. You are responsible for keeping access to that number secure.',
      ],
      [
        'Accuracy',
        'you agree the address, contact and order details you provide are accurate — we deliver to exactly what you enter.',
      ],
    ],
  },
  {
    id: 'payment',
    h: 'Orders, pricing & payment',
    list: [
      [
        'Pricing',
        'prices shown at checkout are inclusive of applicable taxes (GST) unless stated otherwise, and are the price in effect at the time you place the order.',
      ],
      [
        'Order cut-off',
        'each delivery window closes for new orders at a fixed time shown in the app, so items can be procured in time — orders cannot be placed or guaranteed after that cut-off.',
      ],
      [
        'Availability',
        'items are sourced after ordering closes; an item may occasionally be substituted or refunded if unavailable, and we will tell you which.',
      ],
      [
        'Payment',
        'payments are processed by Razorpay, a RBI-authorised payment aggregator. We do not receive or store your card, UPI PIN or bank credentials.',
      ],
    ],
  },
  {
    id: 'delivery',
    h: 'Delivery',
    p: [
      'We deliver to the flat, block and community you select, within the delivery window you choose at checkout. Delivery windows and serviceable communities may change; we will show current options in the app before you order. Please ensure someone is available to receive the order, or provide delivery instructions for the gate/guard.',
    ],
  },
  {
    id: 'refunds',
    h: 'Cancellation & refunds',
    list: [
      [
        'Before the cut-off',
        'you may cancel an order from the app for a full refund to your original payment method, credited within the usual banking timelines.',
      ],
      [
        'After the cut-off',
        'once procurement has started for your window, cancellation may not be possible since the produce has already been sourced on your behalf; contact us and we will do what we reasonably can.',
      ],
      [
        'Quality issues',
        'if an item arrives damaged, spoiled or materially different from what you ordered, contact us within 24 hours of delivery with details — we will refund or credit the affected item.',
      ],
      [
        'How refunds are made',
        'refunds go back to the original payment method via Razorpay. We do not hold customer funds beyond what is needed to process a refund.',
      ],
    ],
  },
  {
    id: 'responsibilities',
    h: 'Your responsibilities',
    p: [
      'Please use the app lawfully and in good faith: provide a real, accessible delivery address; do not place orders you do not intend to honour; and treat our delivery staff with courtesy. We may decline or cancel orders that appear fraudulent or abusive, or restrict an account that repeatedly does this.',
    ],
  },
  {
    id: 'liability',
    h: 'Our liability',
    p: [
      'We work to source and deliver fresh, good-quality produce, but fresh produce naturally varies. Our liability for any order is limited to the amount you paid for that order. We are not liable for delays or failures caused by events beyond our reasonable control (severe weather, community access restrictions, and similar).',
    ],
  },
  {
    id: 'changes',
    h: 'Changes to these terms',
    p: [
      'We may update these terms as the service grows. We will change the "Last updated" date above, and material changes will be highlighted in the app before they take effect.',
    ],
  },
  {
    id: 'law',
    h: 'Governing law & jurisdiction',
    p: [
      'These terms are governed by the laws of India. Any dispute arising from these terms or your use of the app will be subject to the exclusive jurisdiction of the courts in Hyderabad, Telangana.',
    ],
  },
  {
    id: 'grievance',
    h: 'Grievance officer',
    p: [
      'In accordance with the Information Technology Act, 2000 and the Consumer Protection (E-Commerce) Rules, 2020, the name and contact details of the Grievance Officer are provided below. If you have a complaint about an order, a privacy concern, or content on the app, please write to us and we will acknowledge it within 48 hours and resolve it within 30 days.',
    ],
    list: [
      ['Grievance Officer', 'Fooducia Operations'],
      ['Email', CONTACT],
      ['Address', 'Fooducia, Hyderabad, Telangana, India'],
    ],
  },
  {
    id: 'contact',
    h: 'Contact us',
    p: [`Questions about these terms? Email ${CONTACT}. Fooducia, Hyderabad, India.`],
  },
];

const HI = (CONTACT) => [
  {
    id: 'who',
    h: 'हम कौन हैं',
    p: [
      'फ़ार्म टू फ्लैट ("हम", "हमारा") एक मोबाइल ऐप चलाता है, जिससे हैदराबाद, भारत की भाग लेने वाली गेटेड कम्युनिटी के निवासी ताज़ी सब्ज़ियाँ, हरी पत्तेदार सब्ज़ियाँ और मांस पहले से ऑर्डर कर सकते हैं और उन्हें चुनी हुई सुबह या शाम की डिलीवरी अवधि में पा सकते हैं। खाता बनाकर या ऑर्डर देकर आप इन शर्तों से सहमत होते हैं।',
    ],
  },
  {
    id: 'eligibility',
    h: 'पात्रता और खाता',
    list: [
      [
        'कौन ऑर्डर कर सकता है',
        'आपकी आयु कम से कम 18 वर्ष होनी चाहिए, आप भारतीय कानून के तहत बाध्यकारी अनुबंध करने में सक्षम हों, और किसी सेवा-योग्य कम्युनिटी में रहते हों या वहाँ डिलीवरी की पहुँच रखते हों।',
      ],
      [
        'साइन-इन',
        'खाते आपके मोबाइल नंबर पर भेजे गए वन-टाइम पासवर्ड (OTP) से सत्यापित होते हैं। उस नंबर तक पहुँच सुरक्षित रखना आपकी ज़िम्मेदारी है।',
      ],
      [
        'सटीकता',
        'आप सहमत हैं कि आपके द्वारा दिए गए पता, संपर्क और ऑर्डर विवरण सही हैं — हम ठीक वहीं डिलीवर करते हैं जो आप दर्ज करते हैं।',
      ],
    ],
  },
  {
    id: 'payment',
    h: 'ऑर्डर, मूल्य और भुगतान',
    list: [
      [
        'मूल्य',
        'चेकआउट पर दिखाए गए दाम लागू करों (GST) सहित हैं, जब तक अन्यथा न कहा गया हो, और वही दाम लागू होते हैं जो ऑर्डर देते समय प्रभावी थे।',
      ],
      [
        'ऑर्डर कट-ऑफ',
        'हर डिलीवरी अवधि नए ऑर्डर के लिए ऐप में दिखाए गए एक निश्चित समय पर बंद हो जाती है, ताकि सामान समय पर खरीदा जा सके — उस कट-ऑफ के बाद ऑर्डर न तो दिए जा सकते हैं और न ही उनकी गारंटी दी जा सकती है।',
      ],
      [
        'उपलब्धता',
        'ऑर्डर बंद होने के बाद सामान खरीदा जाता है; कोई वस्तु उपलब्ध न होने पर कभी-कभी बदली जा सकती है या उसका रिफंड दिया जा सकता है, और हम आपको बताएँगे कि क्या हुआ।',
      ],
      [
        'भुगतान',
        'भुगतान Razorpay द्वारा संसाधित किए जाते हैं, जो RBI द्वारा अधिकृत भुगतान एग्रीगेटर है। हम आपके कार्ड, UPI पिन या बैंक क्रेडेंशियल न तो प्राप्त करते हैं और न ही संग्रहित करते हैं।',
      ],
    ],
  },
  {
    id: 'delivery',
    h: 'डिलीवरी',
    p: [
      'हम आपके चुने हुए फ्लैट, ब्लॉक और कम्युनिटी में, चेकआउट पर चुनी गई डिलीवरी अवधि के भीतर डिलीवर करते हैं। डिलीवरी अवधियाँ और सेवा-योग्य कम्युनिटी बदल सकती हैं; ऑर्डर देने से पहले हम ऐप में मौजूदा विकल्प दिखाएँगे। कृपया सुनिश्चित करें कि ऑर्डर लेने के लिए कोई उपलब्ध हो, या गेट/गार्ड के लिए डिलीवरी निर्देश दें।',
    ],
  },
  {
    id: 'refunds',
    h: 'रद्दीकरण और रिफंड',
    list: [
      [
        'कट-ऑफ से पहले',
        'आप ऐप से ऑर्डर रद्द कर सकते हैं और पूरी राशि आपके मूल भुगतान माध्यम में सामान्य बैंकिंग समय-सीमा के भीतर वापस कर दी जाएगी।',
      ],
      [
        'कट-ऑफ के बाद',
        'आपकी अवधि के लिए खरीद शुरू हो जाने के बाद रद्द करना संभव नहीं भी हो सकता, क्योंकि सामान आपके लिए पहले ही खरीदा जा चुका होता है; हमसे संपर्क करें और हम जो उचित रूप से कर सकते हैं, करेंगे।',
      ],
      [
        'गुणवत्ता संबंधी समस्या',
        'यदि कोई वस्तु क्षतिग्रस्त, खराब, या आपके ऑर्डर से काफ़ी अलग पहुँचती है, तो डिलीवरी के 24 घंटे के भीतर विवरण सहित हमसे संपर्क करें — हम उस वस्तु का रिफंड या क्रेडिट देंगे।',
      ],
      [
        'रिफंड कैसे होता है',
        'रिफंड Razorpay के माध्यम से मूल भुगतान माध्यम में ही वापस जाता है। रिफंड संसाधित करने के लिए जितना आवश्यक हो, उससे अधिक ग्राहक राशि हम अपने पास नहीं रखते।',
      ],
    ],
  },
  {
    id: 'responsibilities',
    h: 'आपकी ज़िम्मेदारियाँ',
    p: [
      'कृपया ऐप का उपयोग कानूनी रूप से और सद्भावना से करें: वास्तविक, पहुँच-योग्य डिलीवरी पता दें; ऐसे ऑर्डर न दें जिन्हें आप लेने का इरादा नहीं रखते; और हमारे डिलीवरी कर्मचारियों के साथ शिष्टता से पेश आएँ। जो ऑर्डर धोखाधड़ी या दुर्व्यवहार जैसे लगते हैं, उन्हें हम अस्वीकार या रद्द कर सकते हैं, या ऐसा बार-बार करने वाले खाते को सीमित कर सकते हैं।',
    ],
  },
  {
    id: 'liability',
    h: 'हमारा दायित्व',
    p: [
      'हम ताज़ा, अच्छी गुणवत्ता का सामान खरीदने और पहुँचाने का प्रयास करते हैं, परंतु ताज़े सामान में स्वाभाविक रूप से अंतर होता है। किसी भी ऑर्डर के लिए हमारा दायित्व उस ऑर्डर के लिए आपके द्वारा चुकाई गई राशि तक सीमित है। हमारे उचित नियंत्रण से बाहर की घटनाओं (गंभीर मौसम, कम्युनिटी में प्रवेश प्रतिबंध, और इसी तरह की) से होने वाली देरी या विफलता के लिए हम उत्तरदायी नहीं हैं।',
    ],
  },
  {
    id: 'changes',
    h: 'इन शर्तों में बदलाव',
    p: [
      'सेवा के विस्तार के साथ हम इन शर्तों को अपडेट कर सकते हैं। हम ऊपर दी गई "अंतिम बार अपडेट किया गया" तिथि बदलेंगे, और महत्वपूर्ण बदलाव लागू होने से पहले ऐप में उजागर किए जाएँगे।',
    ],
  },
  {
    id: 'law',
    h: 'शासी कानून और क्षेत्राधिकार',
    p: [
      'ये शर्तें भारत के कानूनों द्वारा शासित हैं। इन शर्तों या ऐप के आपके उपयोग से उत्पन्न कोई भी विवाद हैदराबाद, तेलंगाना की अदालतों के विशेष क्षेत्राधिकार के अधीन होगा।',
    ],
  },
  {
    id: 'grievance',
    h: 'शिकायत अधिकारी',
    p: [
      'सूचना प्रौद्योगिकी अधिनियम, 2000 और उपभोक्ता संरक्षण (ई-कॉमर्स) नियम, 2020 के अनुसार, शिकायत अधिकारी का नाम और संपर्क विवरण नीचे दिया गया है। यदि आपको किसी ऑर्डर के बारे में शिकायत है, निजता संबंधी चिंता है, या ऐप की किसी सामग्री पर आपत्ति है, तो कृपया हमें लिखें — हम 48 घंटे के भीतर उसकी पावती देंगे और 30 दिन के भीतर समाधान करेंगे।',
    ],
    list: [
      ['शिकायत अधिकारी', 'फ़ार्म टू फ्लैट ऑपरेशंस'],
      ['ईमेल', CONTACT],
      ['पता', 'फ़ार्म टू फ्लैट, हैदराबाद, तेलंगाना, भारत'],
    ],
  },
  {
    id: 'contact',
    h: 'हमसे संपर्क करें',
    p: [`इन शर्तों के बारे में प्रश्न? ${CONTACT} पर ईमेल करें। फ़ार्म टू फ्लैट, हैदराबाद, भारत।`],
  },
];

const TE = (CONTACT) => [
  {
    id: 'who',
    h: 'మేము ఎవరం',
    p: [
      'Fooducia ("మేము", "మా") ఒక మొబైల్ యాప్‌ను నడుపుతుంది. దీని ద్వారా భారతదేశంలోని హైదరాబాద్‌లో భాగస్వామ్య గేటెడ్ కమ్యూనిటీల నివాసితులు తాజా కూరగాయలు, ఆకుకూరలు మరియు మాంసాన్ని ముందుగానే ఆర్డర్ చేసి, తాము ఎంచుకున్న ఉదయం లేదా సాయంత్రం డెలివరీ సమయంలో పొందవచ్చు. ఖాతా సృష్టించడం ద్వారా లేదా ఆర్డర్ చేయడం ద్వారా మీరు ఈ నిబంధనలకు అంగీకరిస్తున్నారు.',
    ],
  },
  {
    id: 'eligibility',
    h: 'అర్హత మరియు ఖాతా',
    list: [
      [
        'ఎవరు ఆర్డర్ చేయవచ్చు',
        'మీ వయస్సు కనీసం 18 సంవత్సరాలు ఉండాలి, భారత చట్టం ప్రకారం బంధించే ఒప్పందం చేసుకునే సామర్థ్యం ఉండాలి, మరియు సేవలందించే కమ్యూనిటీలో నివసించాలి లేదా అక్కడ డెలివరీ సౌకర్యం ఉండాలి.',
      ],
      [
        'సైన్-ఇన్',
        'ఖాతాలు మీ మొబైల్ నంబర్‌కు పంపిన వన్-టైమ్ పాస్‌వర్డ్ (OTP) ద్వారా ధృవీకరించబడతాయి. ఆ నంబర్‌కు ప్రాప్యతను సురక్షితంగా ఉంచుకోవడం మీ బాధ్యత.',
      ],
      [
        'ఖచ్చితత్వం',
        'మీరు ఇచ్చిన చిరునామా, సంప్రదింపు మరియు ఆర్డర్ వివరాలు సరైనవని మీరు అంగీకరిస్తున్నారు — మీరు నమోదు చేసిన చోటికే మేము డెలివరీ చేస్తాము.',
      ],
    ],
  },
  {
    id: 'payment',
    h: 'ఆర్డర్‌లు, ధరలు మరియు చెల్లింపు',
    list: [
      [
        'ధరలు',
        'చెక్అవుట్‌లో చూపిన ధరలు, వేరే విధంగా చెప్పకపోతే, వర్తించే పన్నులతో (GST) కలిపి ఉంటాయి, మరియు మీరు ఆర్డర్ చేసిన సమయంలో అమలులో ఉన్న ధరలే వర్తిస్తాయి.',
      ],
      [
        'ఆర్డర్ ముగింపు సమయం',
        'సరుకును సమయానికి కొనుగోలు చేయడానికి వీలుగా, ప్రతి డెలివరీ సమయం యాప్‌లో చూపిన నిర్ణీత వేళకు కొత్త ఆర్డర్‌లకు మూసివేయబడుతుంది — ఆ తర్వాత ఆర్డర్‌లు చేయడం లేదా వాటికి హామీ ఇవ్వడం సాధ్యం కాదు.',
      ],
      [
        'లభ్యత',
        'ఆర్డర్‌లు ముగిసిన తర్వాత సరుకు కొనుగోలు చేయబడుతుంది; ఏదైనా వస్తువు అందుబాటులో లేకపోతే అప్పుడప్పుడు మరొకటి ఇవ్వవచ్చు లేదా డబ్బు తిరిగి ఇవ్వవచ్చు, మరియు ఏది జరిగిందో మేము మీకు తెలియజేస్తాము.',
      ],
      [
        'చెల్లింపు',
        'చెల్లింపులను RBI అధీకృత పేమెంట్ అగ్రిగేటర్ అయిన Razorpay ప్రాసెస్ చేస్తుంది. మీ కార్డు, UPI పిన్ లేదా బ్యాంక్ వివరాలను మేము స్వీకరించము, నిల్వ చేయము.',
      ],
    ],
  },
  {
    id: 'delivery',
    h: 'డెలివరీ',
    p: [
      'మీరు ఎంచుకున్న ఫ్లాట్, బ్లాక్ మరియు కమ్యూనిటీకి, చెక్అవుట్‌లో మీరు ఎంచుకున్న డెలివరీ సమయంలోపు మేము డెలివరీ చేస్తాము. డెలివరీ సమయాలు మరియు సేవలందించే కమ్యూనిటీలు మారవచ్చు; మీరు ఆర్డర్ చేసే ముందు ప్రస్తుత ఎంపికలను యాప్‌లో చూపుతాము. ఆర్డర్ అందుకోవడానికి ఎవరైనా అందుబాటులో ఉండేలా చూసుకోండి, లేదా గేటు/సెక్యూరిటీ కోసం డెలివరీ సూచనలు ఇవ్వండి.',
    ],
  },
  {
    id: 'refunds',
    h: 'రద్దు మరియు రీఫండ్',
    list: [
      [
        'ముగింపు సమయానికి ముందు',
        'మీరు యాప్ నుండి ఆర్డర్‌ను రద్దు చేయవచ్చు, మరియు పూర్తి మొత్తం మీ అసలు చెల్లింపు మార్గానికి సాధారణ బ్యాంకింగ్ వ్యవధిలో తిరిగి జమ అవుతుంది.',
      ],
      [
        'ముగింపు సమయం తర్వాత',
        'మీ డెలివరీ సమయానికి కొనుగోలు మొదలైన తర్వాత రద్దు సాధ్యం కాకపోవచ్చు, ఎందుకంటే సరుకు అప్పటికే మీ కోసం కొనుగోలు చేయబడి ఉంటుంది; మమ్మల్ని సంప్రదించండి, సహేతుకంగా చేయగలిగినది చేస్తాము.',
      ],
      [
        'నాణ్యత సమస్యలు',
        'ఏదైనా వస్తువు పాడైపోయి, చెడిపోయి, లేదా మీరు ఆర్డర్ చేసిన దానికి గణనీయంగా భిన్నంగా వస్తే, డెలివరీ అయిన 24 గంటలలోపు వివరాలతో మమ్మల్ని సంప్రదించండి — ఆ వస్తువుకు రీఫండ్ లేదా క్రెడిట్ ఇస్తాము.',
      ],
      [
        'రీఫండ్ ఎలా జరుగుతుంది',
        'రీఫండ్‌లు Razorpay ద్వారా అసలు చెల్లింపు మార్గానికే తిరిగి వెళ్తాయి. రీఫండ్ ప్రాసెస్ చేయడానికి అవసరమైన దానికంటే ఎక్కువ కస్టమర్ సొమ్మును మేము ఉంచుకోము.',
      ],
    ],
  },
  {
    id: 'responsibilities',
    h: 'మీ బాధ్యతలు',
    p: [
      'దయచేసి యాప్‌ను చట్టబద్ధంగా, సద్భావనతో ఉపయోగించండి: నిజమైన, చేరుకోగలిగే డెలివరీ చిరునామా ఇవ్వండి; తీసుకునే ఉద్దేశం లేని ఆర్డర్‌లు చేయవద్దు; మా డెలివరీ సిబ్బందితో మర్యాదగా వ్యవహరించండి. మోసపూరితంగా లేదా దుర్వినియోగంగా కనిపించే ఆర్డర్‌లను మేము తిరస్కరించవచ్చు లేదా రద్దు చేయవచ్చు, లేదా పదేపదే అలా చేసే ఖాతాను పరిమితం చేయవచ్చు.',
    ],
  },
  {
    id: 'liability',
    h: 'మా బాధ్యత',
    p: [
      'తాజా, మంచి నాణ్యత గల సరుకును కొనుగోలు చేసి అందించడానికి మేము కృషి చేస్తాము, అయితే తాజా సరుకులో సహజంగానే తేడాలు ఉంటాయి. ఏ ఆర్డర్‌కైనా మా బాధ్యత ఆ ఆర్డర్‌కు మీరు చెల్లించిన మొత్తానికే పరిమితం. మా సహేతుక నియంత్రణకు మించిన సంఘటనల (తీవ్ర వాతావరణం, కమ్యూనిటీ ప్రవేశ ఆంక్షలు, తత్సంబంధిత) వల్ల కలిగే ఆలస్యాలకు లేదా వైఫల్యాలకు మేము బాధ్యులం కాము.',
    ],
  },
  {
    id: 'changes',
    h: 'ఈ నిబంధనలలో మార్పులు',
    p: [
      'సేవ విస్తరించే కొద్దీ మేము ఈ నిబంధనలను నవీకరించవచ్చు. పైన ఉన్న "చివరిగా నవీకరించినది" తేదీని మారుస్తాము, మరియు ముఖ్యమైన మార్పులు అమలులోకి రాకముందే యాప్‌లో ప్రత్యేకంగా తెలియజేయబడతాయి.',
    ],
  },
  {
    id: 'law',
    h: 'వర్తించే చట్టం మరియు పరిధి',
    p: [
      'ఈ నిబంధనలు భారతదేశ చట్టాలకు లోబడి ఉంటాయి. ఈ నిబంధనల నుండి లేదా యాప్ వినియోగం నుండి తలెత్తే ఏ వివాదమైనా తెలంగాణలోని హైదరాబాద్ న్యాయస్థానాల ప్రత్యేక పరిధికి లోబడి ఉంటుంది.',
    ],
  },
  {
    id: 'grievance',
    h: 'ఫిర్యాదుల అధికారి',
    p: [
      'సమాచార సాంకేతిక చట్టం, 2000 మరియు వినియోగదారుల రక్షణ (ఈ-కామర్స్) నియమాలు, 2020 ప్రకారం, ఫిర్యాదుల అధికారి పేరు మరియు సంప్రదింపు వివరాలు క్రింద ఇవ్వబడ్డాయి. ఆర్డర్ గురించి ఫిర్యాదు, గోప్యతా సంబంధిత ఆందోళన, లేదా యాప్‌లోని ఏదైనా విషయంపై అభ్యంతరం ఉంటే, దయచేసి మాకు రాయండి — 48 గంటలలోపు స్వీకరించినట్టు తెలియజేసి, 30 రోజులలోపు పరిష్కరిస్తాము.',
    ],
    list: [
      ['ఫిర్యాదుల అధికారి', 'Fooducia ఆపరేషన్స్'],
      ['ఇమెయిల్', CONTACT],
      ['చిరునామా', 'Fooducia, హైదరాబాద్, తెలంగాణ, భారతదేశం'],
    ],
  },
  {
    id: 'contact',
    h: 'మమ్మల్ని సంప్రదించండి',
    p: [`ఈ నిబంధనల గురించి ప్రశ్నలా? ${CONTACT} కు ఇమెయిల్ చేయండి. Fooducia, హైదరాబాద్, భారతదేశం.`],
  },
];

export const SECTIONS = { en: EN, hi: HI, te: TE };
