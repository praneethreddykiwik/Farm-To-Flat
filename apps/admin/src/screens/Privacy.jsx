/**
 * Public privacy policy for Farm to Flat. Reached at /privacy with NO login and NO admin chrome —
 * the customer app's Profile → "Privacy policy" link opens it, and app-store / Razorpay reviews
 * expect a reachable policy URL. Self-contained (its own styles) so it renders correctly whether or
 * not the admin theme has loaded. Plain-language, and specific to what this app actually collects.
 */
const UPDATED = '14 September 2026';
const CONTACT = 'hr@criskasecurity.com';

const SECTIONS = [
  {
    h: 'Who we are',
    p: [
      'Farm to Flat is a demand-aggregation grocery service that delivers fresh produce to gated communities in Hyderabad, India. This policy explains what the Farm to Flat mobile app collects, why, and the choices you have. It applies to the app and to orders placed through it.',
    ],
  },
  {
    h: 'What we collect',
    list: [
      [
        'Your mobile number',
        'to sign you in with a one-time password (OTP) and to reach you about your orders.',
      ],
      [
        'Your name and delivery address',
        'the community, block, flat and floor you choose — so we can deliver to the right door.',
      ],
      ['Your orders', 'what you ordered, when, and its delivery and payment status.'],
      [
        'Payment confirmation',
        'payments are processed by Razorpay. We receive a confirmation and reference for each payment; we do not see or store your full card number, UPI PIN, or bank credentials.',
      ],
      [
        'Device notification token',
        'only if you allow notifications, so we can tell you when your order is confirmed, packed, on the way, or delivered.',
      ],
      [
        'Basic app diagnostics',
        'app version and error information that helps us keep the app working.',
      ],
    ],
  },
  {
    h: 'What we do NOT collect',
    p: [
      'We do not ask for or store your card number, UPI PIN, CVV, or bank passwords — those go directly to our payment partner. We do not track your location in the background. We do not collect data from other apps on your device, and we do not build advertising profiles.',
    ],
  },
  {
    h: 'How we use your information',
    list: [
      ['To run your orders', 'take, pack, deliver, and support the orders you place.'],
      ['To sign you in', 'verify your number and keep you signed in securely.'],
      [
        'To keep you informed',
        'send order-status notifications you can turn off any time in your phone settings.',
      ],
      [
        'To improve the service',
        'understand demand so we can buy and deliver better. We never sell your personal data.',
      ],
    ],
  },
  {
    h: 'Who we share it with',
    p: ['We share only what is needed to deliver your order and run the service:'],
    list: [
      ['Delivery team', 'your name, flat, and contact number for the order being delivered.'],
      ['Razorpay', 'our payment processor, to take payment securely (see razorpay.com/privacy).'],
      [
        'Our technology providers',
        'Supabase (secure database hosting) and Expo (app updates and notification delivery), acting on our instructions.',
      ],
    ],
    after: [
      'We do not sell your personal information to anyone. We may disclose information if the law requires it.',
    ],
  },
  {
    h: 'How long we keep it',
    p: [
      'We keep your account and order information for as long as your account is active and as needed to provide the service and meet legal and accounting obligations. You can ask us to delete your account and personal data at any time (see “Your choices”).',
    ],
  },
  {
    h: 'How we protect it',
    p: [
      'Access to the app requires a one-time password sent to your number. Data travels over encrypted (HTTPS) connections and is stored with a reputable cloud provider. Payment details are handled by our PCI-compliant payment partner and never pass through our own systems. No method of transmission or storage is perfectly secure, but we work to protect your information.',
    ],
  },
  {
    h: 'Your choices',
    list: [
      ['Notifications', 'turn order notifications on or off in your phone’s settings for the app.'],
      [
        'Access, correction, deletion',
        'ask us for a copy of your data, correct it, or delete your account and personal data.',
      ],
      ['Contact', `email us at ${CONTACT} and we will respond within a reasonable time.`],
    ],
  },
  {
    h: 'Children',
    p: [
      'Farm to Flat is intended for adults who can place grocery orders. It is not directed at children under 13, and we do not knowingly collect their information.',
    ],
  },
  {
    h: 'Changes to this policy',
    p: [
      'We may update this policy as the service grows. We will change the “Last updated” date above, and significant changes will be highlighted in the app.',
    ],
  },
  {
    h: 'Contact us',
    p: [
      `Questions about this policy or your data? Email ${CONTACT}. Farm to Flat, Hyderabad, India.`,
    ],
  },
];

export function Privacy() {
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
          <h1 className="pp-title">Privacy Policy</h1>
          <p className="pp-updated">Last updated {UPDATED}</p>
        </header>

        <p className="pp-lede">
          Your trust matters. This policy is written in plain language so you know exactly what the
          Farm to Flat app collects and why — no jargon, no surprises.
        </p>

        {SECTIONS.map((sec) => (
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
          <a className="pp-link" href={`mailto:${CONTACT}`}>
            {CONTACT}
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
