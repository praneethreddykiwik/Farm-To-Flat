/**
 * Public terms & conditions for Farm to Flat. Reached at /terms with NO login and NO admin chrome —
 * mirrors Privacy.jsx (self-contained styles, same structure) so it renders correctly on its own and
 * matches the linked page visually. Covers what Indian e-commerce rules require a seller to disclose:
 * seller identity, pricing/GST, delivery, cancellation/refund, and a named grievance officer
 * (Consumer Protection (E-Commerce) Rules, 2020; IT Act, 2000 s.79 safe-harbour requires one too).
 */
import { useSupportEmail } from '../lib/publicSupport.js';

const UPDATED = '18 September 2026';

const SECTIONS = (CONTACT) => [
  {
    h: 'Who we are',
    p: [
      'Farm to Flat ("we", "us") operates a mobile app that lets residents of participating gated communities in Hyderabad, India pre-order fresh vegetables, greens and meat for delivery in a chosen morning or evening window. By creating an account or placing an order, you agree to these terms.',
    ],
  },
  {
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
    h: 'Delivery',
    p: [
      'We deliver to the flat, block and community you select, within the delivery window you choose at checkout. Delivery windows and serviceable communities may change; we will show current options in the app before you order. Please ensure someone is available to receive the order, or provide delivery instructions for the gate/guard.',
    ],
  },
  {
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
    h: 'Your responsibilities',
    p: [
      'Please use the app lawfully and in good faith: provide a real, accessible delivery address; do not place orders you do not intend to honour; and treat our delivery staff with courtesy. We may decline or cancel orders that appear fraudulent or abusive, or restrict an account that repeatedly does this.',
    ],
  },
  {
    h: 'Our liability',
    p: [
      'We work to source and deliver fresh, good-quality produce, but fresh produce naturally varies. Our liability for any order is limited to the amount you paid for that order. We are not liable for delays or failures caused by events beyond our reasonable control (severe weather, community access restrictions, and similar).',
    ],
  },
  {
    h: 'Changes to these terms',
    p: [
      'We may update these terms as the service grows. We will change the "Last updated" date above, and material changes will be highlighted in the app before they take effect.',
    ],
  },
  {
    h: 'Governing law & jurisdiction',
    p: [
      'These terms are governed by the laws of India. Any dispute arising from these terms or your use of the app will be subject to the exclusive jurisdiction of the courts in Hyderabad, Telangana.',
    ],
  },
  {
    h: 'Grievance officer',
    p: [
      `In accordance with the Information Technology Act, 2000 and the Consumer Protection (E-Commerce) Rules, 2020, the name and contact details of the Grievance Officer are provided below. If you have a complaint about an order, a privacy concern, or content on the app, please write to us and we will acknowledge it within 48 hours and resolve it within 30 days.`,
    ],
    list: [
      ['Grievance Officer', 'Farm to Flat Operations'],
      ['Email', CONTACT],
      ['Address', 'Farm to Flat, Hyderabad, Telangana, India'],
    ],
  },
  {
    h: 'Contact us',
    p: [`Questions about these terms? Email ${CONTACT}. Farm to Flat, Hyderabad, India.`],
  },
];

export function Terms() {
  const contact = useSupportEmail();
  const sections = SECTIONS(contact);
  return (
    <div style={s.page}>
      <style>{CSS}</style>
      <main className="pp-wrap">
        <header className="pp-head">
          <div className="pp-brand">
            <span className="pp-leaf" aria-hidden>
              🌿
            </span>
            <span>Farm to Flat</span>
          </div>
          <h1 className="pp-title">Terms & Conditions</h1>
          <p className="pp-updated">Last updated {UPDATED}</p>
        </header>

        <p className="pp-lede">
          These terms explain how ordering, delivery, cancellation and refunds work on Farm to Flat,
          and what to expect from us and from you as a customer — in plain language.
        </p>

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
          <span>© {new Date().getFullYear()} Farm to Flat</span>
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
