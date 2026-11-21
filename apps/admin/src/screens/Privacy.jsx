/**
 * Public privacy policy for Fooducia. Reached at /privacy with NO login and NO admin chrome —
 * the customer app's Profile → "Privacy policy" link opens it, and App Store / Play / Razorpay
 * reviews expect a reachable policy URL. Self-contained (its own styles) so it renders correctly
 * whether or not the admin theme has loaded.
 *
 * Written to describe what the code ACTUALLY does (re-audited 16 Nov 2026 against apps/customer
 * and apps/api). If you change what the app collects, where it sends it, or what account deletion
 * removes, change this page in the same commit. Structure follows the DPDP Act 2023 + DPDP Rules
 * 2025 (Rule 3 notice: itemised data, purposes, how to withdraw consent, exercise rights and
 * complain to the Board), the IT Act 2000 / SPDI Rules 2011, Apple guideline 5.1.1 and the Google
 * Play User Data policy. This is a thorough standard policy, not legal advice; have counsel review
 * material changes.
 */
import { useSupportEmail } from '../lib/publicSupport.js';
import * as HI from './privacy/i18n-hi.js';
import * as TE from './privacy/i18n-te.js';

const UPDATED = '21 November 2026';

// Registered legal entity, office address, and named Grievance Officer (DPDP Act / IT Rules).
const ENTITY = 'Kiwik Consulting Services';
const REG_ADDRESS =
  '753, Prashanth Nagar, Block A, Near Sai Baba Temple, Vanasthalipuram, Hyderabad, Ranga Reddy District, Telangana – 500070, India';
const GRIEVANCE_OFFICER = 'Praneeth Ramaswamy';

export const SECTIONS = (CONTACT) => [
  {
    h: '1. Who we are',
    p: [
      `Fooducia is a grocery service that delivers fresh vegetables, fruit and other produce to residential communities in Hyderabad, India. The Fooducia mobile app and the website fooducia.in (together, the “Service”) are a product of ${ENTITY} (“Fooducia”, “we”, “us”, “our”), with its registered office at ${REG_ADDRESS}.`,
      'Under India’s Digital Personal Data Protection Act, 2023 (the “DPDP Act”) and the Digital Personal Data Protection Rules, 2025, Fooducia is the “Data Fiduciary” that decides how and why your personal data is processed, and you are the “Data Principal”. This policy also follows the Information Technology Act, 2000 and the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011 (the “SPDI Rules”).',
      `${ENTITY} runs other products as well. Your Fooducia data is used only to run Fooducia; we do not use it to market Kiwik’s other products to you.`,
      'This policy explains what personal data the Service collects, why, who we share it with, where it is stored, how long we keep it, how we protect it, and the rights and choices you have.',
      'This notice is available in English, हिन्दी (Hindi) and తెలుగు (Telugu): choose your language at the top of this page. If the versions ever differ, the English version applies.',
    ],
  },
  {
    h: '2. At a glance',
    list: [
      [
        'We collect',
        'your mobile number, name, delivery address, orders and anything you choose to send us (a photo, a voice search, a complaint).',
      ],
      [
        'We use it',
        'to sign you in, deliver your orders, take payment, keep you updated and help when something goes wrong.',
      ],
      [
        'We never',
        'sell your data, show you third-party ads, track you across other apps, read your SMS or contacts, or follow your location in the background.',
      ],
      [
        'We share it',
        'only with the people and services that make the order happen — our delivery team, our payment, messaging, hosting and support providers (listed in section 7).',
      ],
      [
        'You can',
        'see, correct or delete your data, withdraw consent, nominate someone, and complain to us or to the Data Protection Board of India.',
      ],
    ],
  },
  {
    h: '3. The information we collect, and why',
    p: [
      'We collect only what a feature needs (data minimisation). Each item below says what it is and what it is for:',
    ],
    list: [
      [
        'Your consent',
        'when you create an account you tick that you have read this notice and that you are 18 or older; we record which version you agreed to and when. Customers who joined earlier are asked once, in the app.',
      ],
      [
        'Mobile number',
        'to create your account and sign you in with a one-time password (OTP), and to reach you about your orders. The OTP is sent over WhatsApp, or by SMS where available. The app does not read your SMS inbox.',
      ],
      [
        'Name and delivery address',
        'your community, block, flat and floor, and — if you add them — a landmark, delivery instructions, and the name and phone number of someone else who will receive the order. Used to deliver to the right door.',
      ],
      [
        'Orders',
        'what you ordered, when, the amounts, fees and taxes, the delivery slot, and the order, delivery, cancellation and refund status. Used to fulfil, invoice and support your orders.',
      ],
      [
        'Payment confirmation',
        'payments are processed by Razorpay. We pass your name and mobile number to Razorpay’s checkout so you do not have to type them, and we receive back only a payment reference and its status. We never see or store your card number, CVV, UPI PIN or bank login.',
      ],
      [
        'Wallet and refunds',
        'a record of credits, refunds and amounts used from your Fooducia wallet, linked to the orders they relate to.',
      ],
      [
        'Complaints and requests',
        'if you report a problem with an order or ask to cancel it: the reason, your note, and up to five photos you choose to attach. Used to resolve the problem, refund you where due, and improve our service. The staff member handling it sees your name and the order.',
      ],
      [
        'Help requests',
        'if you use “Report a problem” in the app: the topic you pick, what you write and our replies, and — so we can reproduce the problem — whether you use an iPhone or Android phone and the app version. Used only to answer you and fix the problem. Our administrators who answer it see your name and a partly hidden mobile number.',
      ],
      [
        'Meal planner and calorie tracker (staff accounts only, for now)',
        'if you use them: your age, sex, height, weight, activity, goal and food preferences; the meal plans on your calendar; the meals you log and the calories and nutrients estimated for them; and meal photos, kept for 35 days. Each photo is sent to our image-recognition provider (Groq) to name the dishes. Saved to your account so they follow you to a new phone, used only to show you your plan and your progress, and deleted with your account. These features are not yet offered to customers.',
      ],
      [
        'Account deletion requests',
        'when you ask us to delete your account: the date, how you asked (in the app or through support), and that you ticked the box confirming you read what is deleted and what is kept, with the version of that wording. Kept as proof that the deletion was your own request.',
      ],
      [
        'Location — only when you tap “Use my location”',
        'used once to check whether we deliver to your community. Your phone compares your position with the communities we serve; if you are inside one, your position is not sent to us. If you are not, your phone’s built-in map service (Apple on iPhone, Google on Android) is asked for the name of the area, and the app sends us that area once — a PIN code, or a square about a kilometre across — so we can count demand there. We keep only the area and a running count, not your name, number, account or exact position. We never track your location in the background.',
      ],
      [
        '“Tell me when you deliver here”',
        'only if you tap it: your name, mobile number, approximate area (to about a hundred metres, never your door) and the community name if you typed it — so we can send you one message when delivery starts there. You can remove it any time in the app under Profile.',
      ],
      [
        'Waitlist and community requests',
        'only if you tap “Join” on a community we do not serve yet, or ask us to add yours: we link your account to that community’s waiting list, and keep the community name, area and number of towers you gave. Used to count how many households are waiting, decide where to open next, and tell you when delivery starts there. Other customers see only the total count, never who is waiting. You can leave a list at any time from the same screen.',
      ],
      [
        'Codes and “How did you hear about us?”',
        'at checkout you may enter a code from a Fooducia stall, a neighbour’s invite code or a neighbour’s mobile number, and before your first order we ask how you heard about us. We record the code or answer with that order, so we can see which stalls and channels bring customers and thank the person who helped. If you enter a neighbour’s number we only check it against our customers to credit them; we never tell you whether that number is a customer.',
      ],
      [
        'How you found the app (install link)',
        'if you installed the Android app from a Fooducia link — a counter QR code, a WhatsApp post or an invite — Google Play passes the tag on that link (for example “counter, promoter PR01, community Aquantis”) to the app the first time it opens. We store that tag with your account so the stall or neighbour is credited without you typing a code. It contains no information about you or your phone. When someone opens such a link, our website counts the visit per tag per day — with no IP address, device identifier or cookie kept.',
      ],
      [
        'How the Service is used (usage events)',
        'we record a small set of events on our own servers to measure whether Fooducia is working for households: signing in, choosing your community and tower, placing, receiving or being refunded for an order (its value, item count, discount and whether it arrived in the 6–10 AM window), a referral reward, a waitlist vote, opening checkout, sharing your invite, reordering a past basket, using voice search (how many words, never what you said), opening a product or its story (and for how long), changing your basket, and our order-cut-off reminder being sent or opened. Events are linked to your account but never contain your name, number or flat. We use no third-party analytics or advertising SDK for this.',
      ],
      [
        'Neighbour invites',
        'if you share your invite code, we record which new customers joined with it and the wallet credit paid to you when their first order is delivered. The person you invited is told only that an invite code was used, not your name or number; you see only how many joined.',
      ],
      [
        'Ratings',
        'if you rate a delivered order: the stars, any tags you pick and anything you write. Our team reads them to improve the service and may reply; the reply appears on your order.',
      ],
      [
        'Photo search',
        'when you photograph a vegetable to find it, the photo is sent to our server and to an AI image-recognition service (Groq) to identify the item. We use it only to answer that search and do not keep it. We do not scan your photo library; you pick or take each photo yourself. Where else we use AI, and where we do not, is set out in our AI notice at fooducia.in/ai-notice.',
      ],
      [
        'Voice search',
        'when you tap the microphone, your phone’s own speech recognition (Apple on iPhone, Google on Android) turns your speech into text; depending on your phone this may happen on the device or on Apple’s or Google’s servers, under their privacy terms. We receive only the text of your search, never the recording.',
      ],
      [
        'Notifications',
        'if you allow notifications, a device token so we can send order updates (confirmed, packed, on the way, delivered, refunds). We keep your most recent 100 updates in the app’s notification centre so you can read them again.',
      ],
      [
        'WhatsApp order updates',
        'we send order and refund updates, replies to your complaints and a request for feedback to your mobile number on WhatsApp. These are about your orders; we do not currently send marketing messages, and if we ever do we will ask first and let you opt out.',
      ],
      [
        'Order cut-off reminder',
        'if you allow notifications, we may send one reminder in the afternoon — only on days you have not yet ordered for the next morning — so you do not miss the 5:30 PM cut-off. Turn it off any time by switching off notifications for Fooducia in your phone’s settings.',
      ],
      [
        'Launch offers',
        'during a launch offer we look at how many orders you have placed and when your first one was delivered, to work out whether an offer applies to your basket. The discount is shown in your cart and on your bill.',
      ],
      [
        'Technical and security data',
        'when the app or website talks to our servers, our systems record the IP address, the type of device or browser, and the time and address of each request, to keep the Service running and secure and to detect abuse. Sign-in codes, passwords and access tokens are removed from these records. If you change your mobile number in the app, we keep a record that it was changed and when, with both numbers partly hidden, so a misused account can be traced. When you sign out, the phone stops receiving notifications for your account. Our delivery and purchasing staff see your full number and flat only on the orders they are delivering or packing that day or the next.',
      ],
      [
        'Crash reports',
        'technical details of an error — app version, device model, operating-system version and what went wrong — sent to Sentry so we can fix it. They do not include your name, number or address.',
      ],
    ],
  },
  {
    h: '4. Kept only on your phone',
    p: [
      'Some things stay on your phone and are never sent to us: your chosen language, the family size you enter for portion suggestions, your recent community, whether you have seen the introduction, and a copy of the catalogue so the app opens quickly. Your sign-in is kept in your phone’s secure storage. Deleting the app removes all of these.',
    ],
  },
  {
    h: '5. Device permissions and why we ask',
    p: [
      'The app asks for a permission only when you first use the feature that needs it, and each is optional. You can grant or revoke any of them at any time in your phone’s settings:',
    ],
    list: [
      [
        'Location',
        'a one-time, foreground check of whether we deliver to your community, made only when you tap “Use my location”.',
      ],
      ['Camera', 'to photograph a vegetable to find it, or to show us a problem with an order.'],
      [
        'Photos',
        'to attach a photo you pick to a search or a complaint. The app sees only the photos you pick.',
      ],
      [
        'Microphone and speech recognition',
        'for voice search of the catalogue, only while you hold the microphone open.',
      ],
      ['Notifications', 'to send you order-status updates.'],
    ],
    after: [
      'Declining a permission turns off only that one feature; the rest of the app keeps working.',
    ],
  },
  {
    h: '6. What we do NOT collect or do',
    p: [
      'We do not ask for or store your card number, CVV, UPI PIN or bank passwords. We do not read your SMS, contacts, call logs or other apps. We do not track your location in the background. We do not use advertising identifiers, advertising networks or cross-app tracking, we do not build advertising profiles, and we do not sell your personal data.',
    ],
  },
  {
    h: '7. Who we share it with',
    p: [
      'We share only what each one needs to do its job. All of the following act on our instructions as our processors, except where noted:',
    ],
    list: [
      [
        'Our delivery and packing team',
        'your name, block, flat, delivery instructions and contact number, for the orders they are handling.',
      ],
      [
        'Razorpay (India)',
        'to take payment. Razorpay is PCI-DSS compliant and also processes payment data under its own privacy policy for fraud prevention and banking rules (razorpay.com/privacy).',
      ],
      [
        'MSG91 and WhatsApp (Meta)',
        'to deliver your sign-in codes and order updates to your mobile number.',
      ],
      [
        'Groq',
        'AI image recognition for photo search; receives only the photo you take for that search.',
      ],
      ['Supabase', 'database and secure file storage (for example, complaint photos).'],
      ['Render', 'the servers that run our app’s back end.'],
      [
        'Cloudflare',
        'network security and fast, protected delivery of our website and app traffic.',
      ],
      ['Vercel', 'hosting for the fooducia.in website.'],
      ['Expo (EAS)', 'delivers app updates and sends push notifications on our behalf.'],
      [
        'Apple and Google',
        'deliver push notifications, and provide the speech recognition and map lookup built into your phone, under their own privacy terms.',
      ],
      ['Sentry', 'crash and error reports (see section 3).'],
      [
        'Our growth-measurement adviser',
        'may receive a weekly report of orders and usage events in which every household is replaced by a one-way code. It contains no name, mobile number, flat or address, and the adviser cannot work out who anyone is.',
      ],
    ],
    after: [
      'We may also disclose personal data when the law requires it — for example, to a court, a tax authority or law enforcement with a lawful request — or to protect the safety of our customers, staff or the public, or to prevent fraud. If Fooducia is ever merged, sold or reorganised, your data may pass to the new owner, who must keep honouring this policy. We do not sell your personal data to anyone.',
    ],
  },
  {
    h: '8. Where your data is stored',
    p: [
      'Our service providers run servers in several countries. Today your data may be stored or processed outside India, including in Japan (our database) Singapore (our back-end servers) and the United States (photo recognition and crash reporting), and passes through Cloudflare’s global network. The DPDP Act allows such transfers except to countries the Government of India restricts, and we choose providers that protect data to a standard at least equal to this policy.',
    ],
  },
  {
    h: '9. How long we keep it',
    list: [
      [
        'Your account',
        'while your account is open. When you ask to delete it, you are signed out at once and it is permanently deleted 60 days later unless you sign in again (see section 16).',
      ],
      [
        'Orders, invoices, payments, refunds and wallet records',
        'including the delivery details and any complaint recorded on an order, kept for as long as Indian tax, accounting and consumer law requires — generally up to eight years — and to resolve disputes.',
      ],
      ['“Tell me when you deliver here”', 'until you remove it or delete your account.'],
      [
        'Waitlist joins',
        'until you leave the list, we start delivering there, or you delete your account.',
      ],
      [
        'Codes, “how did you hear”, invites and ratings',
        'kept with the order they belong to, for as long as the order record is kept.',
      ],
      [
        'Usage events and install tags',
        'up to 24 months, then deleted. When you delete your account, the install tag is deleted and your events are cut loose from it, so they remain only as anonymous counts.',
      ],
      [
        'Area demand counts',
        'hold no personal data; kept as long as they help us plan where to deliver.',
      ],
      ['Notification centre', 'your latest 100 updates; deleted with your account.'],
      ['Help requests', 'while your account is open; deleted with your account.'],
      [
        'Meal plans and meal logs',
        'while your account is open; meal photos for 35 days. All of it is deleted with your account.',
      ],
      [
        'Record of a deletion request',
        'kept after the account is deleted, as proof that you asked; it holds only an internal account reference, the date and what you confirmed — no name, number or address.',
      ],
      ['Sign-in', 'you stay signed in for up to 90 days of inactivity on a phone.'],
      [
        'Security record',
        'a record of sign-ins (successful and failed), changes to your account, consents you give, and staff access to your data — with your mobile number partly hidden — kept for one year from each event and then deleted, as the DPDP Rules require, so misuse can be detected and investigated. This record is kept for that year even if you delete your account sooner.',
      ],
      [
        'Your consent record',
        'which version of this notice you agreed to, that you confirmed you are 18 or older, and when; kept while your account is open and for as long as the law requires afterwards, as proof of your consent.',
      ],
      [
        'Technical records and crash reports',
        'server request logs (IP address, device or browser type, and the time and address of each request; never sign-in codes, passwords or tokens) are kept by our hosting provider for up to 14 days, to fix faults and spot attacks. Crash reports are kept for a limited period by our crash-reporting provider. Sign-ins, account changes, consents and staff access are kept for one year in the security record above.',
      ],
      [
        'Records of staff access',
        'when a staff member opens a customer’s order history or reveals a mobile number, we record who did it and why; kept for security and accountability.',
      ],
    ],
  },
  {
    h: '10. How we protect it',
    p: [
      'We follow reasonable security practices as required by the SPDI Rules and the DPDP Rules. Sign-in needs a one-time password sent to your number. Data travels over encrypted (HTTPS/TLS) connections and is stored with reputable cloud providers behind access controls. Payment details are handled by our PCI-DSS-compliant payment partner and never pass through our systems. Access inside Fooducia is limited to people who need it: the people who pack and deliver see only the orders they handle; a customer’s full order history is open only to our administrators, with the mobile number hidden until it is needed for a delivery, a complaint or a payment query, and every such access is recorded.',
      'No system is perfectly secure. If a personal-data breach affects you, we will tell you without delay — what happened, what it may mean for you, what we are doing and what you can do — and we will report it to the Data Protection Board of India and to CERT-In as the law requires.',
    ],
  },
  {
    h: '11. Your rights',
    p: ['Under the DPDP Act you have the right to:'],
    list: [
      [
        'Access',
        'a summary of the personal data we hold about you, what we do with it, and who we have shared it with.',
      ],
      [
        'Correction and completion',
        'have inaccurate or incomplete data corrected or updated. You can edit your name and addresses in the app yourself.',
      ],
      [
        'Erasure',
        'have your personal data deleted when it is no longer needed, subject to what the law requires us to keep.',
      ],
      ['Withdraw consent', 'at any time, as easily as you gave it (see section 12).'],
      ['Grievance redressal', 'have a concern handled by our Grievance Officer (section 13).'],
      [
        'Nomination',
        'name another person to exercise these rights for you if you die or become unable to.',
      ],
    ],
    after: [
      `To use any of these rights, email ${CONTACT} from your registered email, or write to us mentioning your registered mobile number so we can find your account; we may ask you to confirm a code sent to that number before acting. We respond within 30 days.`,
    ],
  },
  {
    h: '12. Withdrawing your consent',
    p: [
      `You can withdraw consent at any time by deleting your account in the app (Profile → Delete account) or by emailing ${CONTACT}. You can also turn off notifications, location, camera or microphone at any time in your phone’s settings, and remove a “Tell me when you deliver here” request on its own under Profile. Withdrawing consent does not undo processing already done, and because we need certain data to deliver orders, withdrawing it may mean we can no longer serve you.`,
    ],
  },
  {
    h: '13. Grievance Officer',
    p: [
      'In accordance with the DPDP Act, 2023, the Information Technology Act, 2000 and the rules under them, you may contact our Grievance Officer with any concern about your personal data or this policy:',
    ],
    list: [
      ['Name', GRIEVANCE_OFFICER],
      ['Email', CONTACT],
      ['Address', REG_ADDRESS],
    ],
    after: ['We acknowledge grievances within 48 hours and resolve them within 30 days.'],
  },
  {
    h: '14. Complaints to the Data Protection Board',
    p: [
      'If you are not satisfied with how we handled your grievance, you may complain to the Data Protection Board of India under the DPDP Act, 2023, through the means the Board provides.',
    ],
  },
  {
    h: '15. Children',
    p: [
      'The Service is meant for adults (18 and over) who place grocery orders for their homes. When you create an account we ask you to confirm that you are 18 or older. Under the DPDP Act a “child” is anyone under 18. We do not knowingly collect a child’s personal data without verifiable consent from a parent or lawful guardian, and we never track children or direct advertising at them. If you believe a child has given us personal data, contact us and we will delete it.',
    ],
  },
  {
    h: '16. Deleting your account',
    p: [
      `You can delete your account at any time in the app (Profile → Delete my account), or by emailing ${CONTACT}; see also fooducia.in/account-deletion. In the app you confirm with a one-time code sent to your registered number.`,
      'When you ask, we sign you out on every device straight away and stop all messages, and your account is permanently deleted 60 days later. If you sign in again during those 60 days, the deletion is cancelled and your account stays as it was. By email, the 60 days start once we have confirmed it is you.',
      'While an order is still in progress — placed, being packed or on its way, or a cash-on-delivery order not yet paid — the account cannot be deleted, because the delivery needs your door code and, for cash orders, your payment. Once it is delivered or cancelled you can delete straight away.',
    ],
    list: [
      [
        'What is deleted',
        'your profile (name, email and mobile number), saved delivery addresses, basket, sign-in, notification tokens, notification history, any “Tell me when you deliver here” request, your help requests, your waitlist places and your invite code. Your mobile number is freed for a fresh sign-up.',
      ],
      [
        'What is kept',
        'records of your past orders, payments, refunds and wallet entries — including the delivery name, contact number and flat recorded on each order, and any complaint made about it — because tax, accounting and consumer law require us to keep them, and to resolve disputes. They are kept only for the period in section 9 and used for nothing else.',
      ],
      [
        'Wallet balance',
        'use any wallet balance on an order before you ask, or claim it from support within the 60 days; it cannot be recovered after the account is deleted.',
      ],
    ],
  },
  {
    h: '17. Changes to this policy',
    p: [
      'We may update this policy as the Service grows or the law changes. We will change the “Last updated” date above and, for significant changes, tell you in the app before they take effect.',
    ],
  },
  {
    h: '18. Governing law and contact',
    p: [
      'This policy is governed by the laws of India, and the courts at Hyderabad, Telangana have jurisdiction over any dispute relating to it.',
      `Questions about this policy or your personal data? Email ${CONTACT}, or write to ${ENTITY}, ${REG_ADDRESS}.`,
    ],
  },
];

/**
 * The notice in the customer's language (DPDP Act §5(3)): English, Hindi or Telugu, chosen with
 * ?lang=hi|te (the app links here with its own language) or the switcher at the top. Hindi and
 * Telugu are translations of this English text; the English version prevails.
 */
const TRANSLATIONS = { hi: HI, te: TE };
const LANGS = [
  ['en', 'English'],
  ['hi', 'हिन्दी'],
  ['te', 'తెలుగు'],
];

function pickLang() {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    return q === 'hi' || q === 'te' ? q : 'en';
  } catch {
    return 'en';
  }
}

export function Privacy() {
  const contact = useSupportEmail();
  const lang = pickLang();
  const tr = TRANSLATIONS[lang];
  return (
    <LegalDoc
      title={tr ? tr.META.title : 'Privacy Policy'}
      updated={UPDATED}
      lede={
        tr
          ? tr.META.lede
          : 'Your trust matters. This policy is written in plain language so you know exactly what the Fooducia app collects and why — no jargon, no surprises.'
      }
      sections={
        tr
          ? tr.SECTIONS({ CONTACT: contact, ENTITY, REG_ADDRESS, GRIEVANCE_OFFICER })
          : SECTIONS(contact)
      }
      contact={contact}
      lang={lang}
      chrome={tr?.META.chrome}
      languages={LANGS}
    />
  );
}

/**
 * The shared layout of the public legal pages (Privacy, AI notice): a title, a date, a lede and
 * numbered sections of paragraphs and term — description lists.
 * @param {{ title: string, updated: string, lede: string, sections: any[], contact: string,
 *   lang?: string, chrome?: any, languages?: string[][] }} props
 */
export function LegalDoc({
  title,
  updated,
  lede,
  sections,
  contact,
  lang = 'en',
  chrome,
  languages,
}) {
  const c = chrome || {};
  return (
    <div style={s.page} lang={lang}>
      <style>{CSS}</style>
      <main className="pp-wrap">
        <header className="pp-head">
          <div className="pp-brand">
            <span className="pp-leaf" aria-hidden>
              🌿
            </span>
            <span>Fooducia</span>
          </div>
          {languages ? (
            <nav className="pp-langs" aria-label="Language">
              {languages.map(([code, label]) => (
                <a
                  key={code}
                  className="pp-lang"
                  href={code === 'en' ? '?' : `?lang=${code}`}
                  aria-current={code === lang ? 'true' : undefined}
                >
                  {label}
                </a>
              ))}
            </nav>
          ) : null}
          <h1 className="pp-title">{title}</h1>
          <p className="pp-updated">
            {c.updated ? `${c.updated}: ${c.updatedDate || updated}` : `Last updated ${updated}`}
          </p>
        </header>

        <p className="pp-lede">{lede}</p>

        {sections.map((sec) => (
          <section className="pp-sec" key={sec.h}>
            <h2 className="pp-h2">{sec.h}</h2>
            {sec.p?.map((t, i) => (
              <p className="pp-p" key={i}>
                {t}
              </p>
            ))}
            {sec.list ? (
              <ul className="pp-list">
                {sec.list.map(([term, desc]) => (
                  <li className="pp-li" key={term}>
                    <span className="pp-term">{term}</span> — {desc}
                  </li>
                ))}
              </ul>
            ) : null}
            {sec.after?.map((t, i) => (
              <p className="pp-p" key={`a${i}`}>
                {t}
              </p>
            ))}
          </section>
        ))}

        <footer className="pp-foot">
          <a className="pp-link" href={`mailto:${contact}`}>
            {contact}
          </a>
          <span className="pp-dot" aria-hidden>
            ·
          </span>
          <a className="pp-link" href="/privacy">
            {c.privacy || 'Privacy'}
          </a>
          <span className="pp-dot" aria-hidden>
            ·
          </span>
          <a className="pp-link" href="/terms">
            {c.terms || 'Terms'}
          </a>
          <span className="pp-dot" aria-hidden>
            ·
          </span>
          <a className="pp-link" href="/ai-notice">
            {c.aiNotice || 'AI notice'}
          </a>
          <span className="pp-dot" aria-hidden>
            ·
          </span>
          <span>© {new Date().getFullYear()} Fooducia</span>
        </footer>
      </main>
    </div>
  );
}

/** @type {{ page: import('react').CSSProperties }} */
const s = {
  page: {
    minHeight: '100vh',
    width: '100%',
    background: '#f4f6f2',
    color: '#12201a',
    overflowY: 'auto',
  },
};

const CSS = `
.pp-langs { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 14px; }
.pp-lang { font-size: 14px; padding: 6px 12px; border-radius: 999px; border: 1px solid #cfd8cf; color: #135a37; text-decoration: none; background: #fff; }
.pp-lang[aria-current='true'] { background: #135a37; color: #fff; border-color: #135a37; }

.pp-wrap{max-width:720px;margin:0 auto;padding:56px 24px 80px;
  font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  line-height:1.6;}
.pp-brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px;color:#1e7a4c;}
.pp-leaf{font-size:18px;}
.pp-head{border-bottom:1px solid #dde5df;padding-bottom:24px;margin-bottom:28px;}
.pp-title{font-family:Fraunces,Georgia,'Times New Roman',serif;font-weight:600;
  font-size:clamp(30px,6vw,42px);line-height:1.1;letter-spacing:-0.02em;margin:16px 0 8px;color:#0e1b14;}
.pp-updated{font-size:13px;color:#5c6b62;margin:0;}
.pp-lede{font-size:16.5px;color:#33453b;margin:0 0 34px;}
.pp-sec{margin-bottom:30px;}
.pp-h2{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:21px;line-height:1.25;
  letter-spacing:-0.01em;color:#12201a;margin:0 0 10px;}
.pp-p{font-size:15px;color:#33453b;margin:0 0 12px;}
.pp-list{list-style:none;padding:0;margin:6px 0 0;display:flex;flex-direction:column;gap:11px;}
.pp-li{font-size:15px;color:#33453b;padding-left:18px;position:relative;}
.pp-li:before{content:'';position:absolute;left:0;top:9px;width:7px;height:7px;border-radius:2px;
  background:#1e7a4c;opacity:0.7;}
.pp-term{font-weight:600;color:#12201a;}
.pp-foot{margin-top:44px;padding-top:22px;border-top:1px solid #dde5df;
  font-size:13.5px;color:#5c6b62;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.pp-link{color:#1e7a4c;text-decoration:none;font-weight:600;}
.pp-link:hover{text-decoration:underline;}
.pp-dot{opacity:0.5;}
`;
