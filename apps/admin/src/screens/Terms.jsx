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
.pp-langs{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;}
.pp-lang{font:inherit;font-size:13.5px;padding:6px 14px;border-radius:999px;cursor:pointer;
  border:1px solid #dde5df;background:#fff;color:#33453b;}
.pp-lang:hover{border-color:#1e7a4c;}
.pp-lang--on{background:#1e7a4c;border-color:#1e7a4c;color:#fff;font-weight:600;}
.pp-note{font-size:13.5px;color:#5c6b62;background:#eef3ef;border:1px solid #dde5df;
  border-radius:10px;padding:12px 14px;margin:0 0 30px;}
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
