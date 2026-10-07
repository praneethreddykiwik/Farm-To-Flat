import { useState } from 'react';
/**
 * Public terms & conditions for Fooducia. Reached at /terms with NO login and NO admin chrome —
 * mirrors Privacy.jsx (self-contained styles, same structure) so it renders correctly on its own and
 * matches the linked page visually. Covers what Indian e-commerce rules require a seller to disclose:
 * seller identity, pricing/GST, delivery, cancellation/refund, and a named grievance officer
 * (Consumer Protection (E-Commerce) Rules, 2020; IT Act, 2000 s.79 safe-harbour requires one too).
 */
import { useSupportEmail } from '../lib/publicSupport.js';
import { CHROME, SECTIONS, UPDATED } from './terms-content.js';
import { CSS, s } from './policy-styles.js';

const LANGS = [
  { code: 'en', native: 'English' },
  { code: 'hi', native: 'हिंदी' },
  { code: 'te', native: 'తెలుగు' },
];

/**
 * Which language to render. `?lang=` wins so the app can link straight to the reader's own
 * language; otherwise the browser's preference, which is a better guess than English for someone
 * who got here from a Hindi phone.
 */
function pickLang() {
  const asked = new URLSearchParams(window.location.search).get('lang');
  if (SECTIONS[asked]) return asked;
  for (const tag of navigator.languages || [navigator.language || '']) {
    const code = String(tag).slice(0, 2).toLowerCase();
    if (SECTIONS[code]) return code;
  }
  return 'en';
}

export function Terms() {
  const contact = useSupportEmail();
  const [lang, setLang] = useState(pickLang);
  const chrome = CHROME[lang];
  const sections = SECTIONS[lang](contact);

  // Keep the URL in step, so the page can be shared or reloaded in the language being read.
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
          <h1 className="pp-title">{chrome.title}</h1>
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

        <p className="pp-lede">{chrome.lede}</p>
        {chrome.governingNote ? <p className="pp-note">{chrome.governingNote}</p> : null}

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
          </section>
        ))}

        <footer className="pp-foot">
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
