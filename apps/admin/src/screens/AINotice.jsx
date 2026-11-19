/**
 * Public AI notice — /ai-notice, no login, no admin chrome. Written from what the code actually does
 * (checked 19 Nov 2026): the ONLY AI a customer meets is photo search (apps/api/src/lib/identify.js,
 * Groq). Staff tools: Hindi/Telugu name suggestions (lib/suggest-names.js, product names only) and
 * the meal planner / calorie estimates (routes/ai.js, routes/meals.js) — super-admin only, behind
 * requireMealAccess and selectAiVisible, not open to customers. Everything else that looks
 * "smart" — prices, cut-offs, the buy list, refunds, referral rewards, insights — is fixed rules
 * or a person's decision. If any of that changes, change this page in the same commit.
 *
 * India's IT Rules 2026 amendment on synthetically generated information covers AI-made audio and
 * visual content that looks real; Fooducia produces none, so there is nothing to label — said
 * plainly below rather than left to be wondered about.
 */
import { useSupportEmail } from '../lib/publicSupport.js';
import { LegalDoc } from './Privacy.jsx';

const UPDATED = '19 November 2026';

const SECTIONS = (CONTACT) => [
  {
    h: '1. Where we use AI',
    p: [
      'Fooducia uses artificial intelligence in very few places, and only where it saves you effort. Each one is listed here.',
    ],
    list: [
      [
        'Photo search (customers)',
        'when you tap the camera in search and photograph or pick a vegetable, the photo is sent to our server and to Groq, an AI image-recognition service, which tells us what the item is so we can show it from our catalogue. It runs only when you start it. We use the photo only to answer that search and do not keep it.',
      ],
      [
        'Product names in Hindi and Telugu (our team)',
        'when our team adds a product, an AI service (Groq) can suggest its local names. Only the English product name is sent — no customer information. A person checks each suggestion before it is saved.',
      ],
      [
        'Meal planning and calorie estimates (not available to customers)',
        'our team is testing an AI meal planner and photo-based calorie estimates. They are switched off for customers and will not be offered until they have been reviewed by a nutrition professional and you have been asked for clear consent.',
      ],
    ],
  },
  {
    h: '2. What is not AI',
    p: [
      'Many things in the app follow fixed rules or are decided by a person, and no AI is involved:',
    ],
    list: [
      ['Prices, fees and taxes', 'set by our team and shown before you pay.'],
      [
        'Delivery slots, cut-off times and cash-on-delivery limits',
        'fixed rules our team sets for each community.',
      ],
      [
        'Refunds, cancellations and complaints',
        'decided by a member of our team, who looks at what you sent.',
      ],
      [
        'Invite rewards and offers',
        'fixed rules: for example, an invite reward is paid when the invited neighbour’s first order is delivered.',
      ],
      [
        'Nutrition and “good to know” facts on products',
        'calculated from published food-composition data (USDA FoodData Central) against FSSAI thresholds, not written by AI.',
      ],
      [
        'The kitchen guide and family-size suggestions',
        'a written cookbook and simple portion rules on your phone, not an AI model.',
      ],
    ],
  },
  {
    h: '3. What we do not do',
    list: [
      [
        'No training on your data',
        'we do not use your photos, orders or account to train AI models, and Groq states that it does not use data sent through its API to train its models.',
      ],
      [
        'No automated decisions about you',
        'no AI decides anything with a legal or similarly significant effect on you — your account, orders, refunds and complaints are handled by rules you can read in our Terms and by people.',
      ],
      [
        'No AI-generated pictures or voices',
        'product photos are real photographs. We do not create AI images, audio or video, so the labelling rules for synthetic content under India’s IT Rules (2026 amendment) have nothing to apply to.',
      ],
      [
        'No profiling for advertising',
        'we do not show third-party ads or build advertising profiles.',
      ],
    ],
  },
  {
    h: '4. Accuracy',
    p: [
      'Photo search can get it wrong — a similar-looking leaf, poor light, or an item we do not stock. It only suggests what to look at; nothing is added to your basket until you choose it. Please check the item before you add it.',
    ],
  },
  {
    h: '5. Your choices',
    p: [
      'AI runs only when you start it. You can always search by typing or by voice instead of using the camera; the rest of the app works the same.',
      `Questions about how we use AI, or a concern about a result? Write to ${CONTACT}. Our Grievance Officer, the rights you have and how to reach the Data Protection Board of India are set out in our Privacy Policy.`,
    ],
  },
];

export function AINotice() {
  const contact = useSupportEmail();
  return (
    <LegalDoc
      title="AI Notice"
      updated={UPDATED}
      lede="Where Fooducia uses artificial intelligence, what it sees, what it does not, and the choices you have."
      sections={SECTIONS(contact)}
      contact={contact}
    />
  );
}
