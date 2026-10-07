import { useState } from 'react';
/**
 * A public policy page built from a NAMED SUBSET of the Terms sections.
 *
 * Why this exists: payment gateways and app stores check for a refund/cancellation policy, a
 * shipping/delivery policy and a contact page at their OWN addresses, and will not accept "it is
 * section 5 of our terms". The obvious way to satisfy that is to retype the policy onto three new
 * pages — which immediately creates four places to update and three chances to disagree with the
 * one that is contractually binding.
 *
 * So these pages render the SAME `terms-content.js` entries, selected by id. There is exactly one
 * copy of the policy text; `/refunds` is a view onto it, not a second version of it. Change the
 * cancellation rule once and every surface follows, in all three languages.
 */
import { useSupportEmail } from '../lib/publicSupport.js';
import { CHROME, SECTIONS, UPDATED } from './terms-content.js';
import { CSS, s } from './policy-styles.js';

const LANGS = [
  { code: 'en', native: 'English' },
  { code: 'hi', native: 'हिंदी' },
  { code: 'te', native: 'తెలుగు' },
];

/** Page headings, per language. The body text comes from terms-content.js — only chrome is here. */
export const PAGES = {
  refunds: {
    ids: ['refunds', 'payment'],
    title: {
      en: 'Cancellation & Refund Policy',
      hi: 'रद्दीकरण और रिफंड नीति',
      te: 'రద్దు మరియు రీఫండ్ విధానం',
    },
    lede: {
      en: 'When you can cancel an order, what happens to your money, and how to raise a problem with something that arrived.',
      hi: 'आप ऑर्डर कब रद्द कर सकते हैं, आपके पैसे का क्या होता है, और डिलीवर हुई किसी वस्तु से जुड़ी समस्या कैसे बताएं।',
      te: 'మీరు ఆర్డర్‌ను ఎప్పుడు రద్దు చేయవచ్చు, మీ డబ్బుకు ఏమి జరుగుతుంది, మరియు డెలివరీ అయిన వస్తువుపై సమస్యను ఎలా తెలియజేయాలి.',
    },
  },
  shipping: {
    ids: ['delivery', 'payment'],
    title: {
      en: 'Shipping & Delivery Policy',
      hi: 'शिपिंग और डिलीवरी नीति',
      te: 'షిప్పింగ్ మరియు డెలివరీ విధానం',
    },
    lede: {
      en: 'Where we deliver, when we deliver, and what the charges are.',
      hi: 'हम कहाँ डिलीवर करते हैं, कब करते हैं, और शुल्क क्या हैं।',
      te: 'మేము ఎక్కడ డెలివరీ చేస్తాము, ఎప్పుడు చేస్తాము, మరియు ఛార్జీలు ఏమిటి.',
    },
  },
  contact: {
    ids: ['contact', 'grievance', 'who'],
    title: { en: 'Contact Us', hi: 'हमसे संपर्क करें', te: 'మమ్మల్ని సంప్రదించండి' },
    lede: {
      en: 'How to reach us, and who to escalate to if we have not resolved something.',
      hi: 'हम तक कैसे पहुँचें, और यदि कोई बात हल न हुई हो तो किसे आगे बताएं।',
      te: 'మమ్మల్ని ఎలా సంప్రదించాలి, మరియు ఏదైనా పరిష్కారం కాకపోతే ఎవరికి తెలియజేయాలి.',
    },
  },
};

const BACK = {
  en: 'Read the full Terms & Conditions',
  hi: 'पूरी नियम और शर्तें पढ़ें',
  te: 'పూర్తి నిబంధనలు చదవండి',
};

function pickLang() {
  const asked = new URLSearchParams(window.location.search).get('lang');
  if (SECTIONS[asked]) return asked;
  for (const tag of navigator.languages || [navigator.language || '']) {
    const code = String(tag).slice(0, 2).toLowerCase();
    if (SECTIONS[code]) return code;
  }
  return 'en';
}

export function PolicyPage({ page }) {
  const spec = PAGES[page];
  const contact = useSupportEmail();
  const [lang, setLang] = useState(pickLang);
  const chrome = CHROME[lang];
  // Select by id and keep the order this page asked for, not the order Terms happens to use.
  const all = SECTIONS[lang](contact);
  const sections = spec.ids.map((id) => all.find((x) => x.id === id)).filter(Boolean);

  function choose(code) {
    setLang(code);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', code);
    window.history.replaceState({}, '', url);
    document.documentElement.lang = code;
  }

  return (
    <div style={s.page}>
      <style>{CSS}</style>
      <main className="pp-wrap">
        <header className="pp-head">
          <div className="pp-brand">
            <span className="pp-leaf" aria-hidden>
              🌿
            </span>
            <span>Fooducia</span>
          </div>
          <h1 className="pp-title">{spec.title[lang]}</h1>
          <p className="pp-updated">
            {chrome.updated} {UPDATED[lang]}
          </p>
          <nav className="pp-langs" aria-label={chrome.languageLabel}>
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                className={`pp-lang${l.code === lang ? ' pp-lang--on' : ''}`}
                aria-current={l.code === lang ? 'true' : undefined}
                onClick={() => choose(l.code)}
              >
                {l.native}
              </button>
            ))}
          </nav>
        </header>

        <p className="pp-lede">{spec.lede[lang]}</p>
        {chrome.governingNote ? <p className="pp-note">{chrome.governingNote}</p> : null}

        {sections.map((sec) => (
          <section className="pp-sec" key={sec.id}>
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
          </section>
        ))}

        <footer className="pp-foot">
          <a className="pp-link" href={`/terms?lang=${lang}`}>
            {BACK[lang]}
          </a>
          <span className="pp-dot" aria-hidden>
            ·
          </span>
          <a className="pp-link" href={`mailto:${contact}`}>
            {contact}
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
