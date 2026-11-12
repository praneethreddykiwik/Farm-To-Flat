/**
 * Public privacy policy for Fooducia. Reached at /privacy with NO login and NO admin chrome —
 * the customer app's Profile → "Privacy policy" link opens it, and app-store / Razorpay reviews
 * expect a reachable policy URL. Self-contained (its own styles) so it renders correctly whether or
 * not the admin theme has loaded. Plain-language, and specific to what this app actually collects.
 *
 * India-compliant (DPDP Act 2023 + IT Act 2000 / SPDI Rules 2011 + Google Play). The registered
 * entity (ENTITY), office address (REG_ADDRESS) and named Grievance Officer (GRIEVANCE_OFFICER)
 * are set in the constants below — keep them current if any changes. This is a thorough standard
 * policy, not legal advice; have counsel review material changes.
 */
import { useSupportEmail } from '../lib/publicSupport.js';

const UPDATED = '3 November 2026';
const EFFECTIVE = '3 November 2026';

// Registered legal entity, office address, and named Grievance Officer (DPDP Act / IT Rules).
const ENTITY = 'Kiwik Consulting Services';
const REG_ADDRESS =
  '753, Prashanth Nagar, Block A, Near Sai Baba Temple, Vanasthalipuram, Hyderabad, Ranga Reddy District, Telangana – 500070, India';
const GRIEVANCE_OFFICER = 'Praneeth Ramaswamy';

const SECTIONS = (CONTACT) => [
  {
    h: '1. Who we are',
    p: [
      `Fooducia is a demand-aggregation grocery service that delivers fresh produce to residential communities in Hyderabad, India. The Fooducia mobile app and website (together, the “Service”) are operated by ${ENTITY} (“Fooducia”, “we”, “us”, “our”), with its registered office at ${REG_ADDRESS}.`,
      'For the purposes of India’s Digital Personal Data Protection Act, 2023 (the “DPDP Act”), Fooducia is the “Data Fiduciary” that decides how and why your personal data is processed, and you are the “Data Principal”. This policy also follows the Information Technology Act, 2000 and the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011 (the “SPDI Rules”).',
      'This policy explains what personal data the Service collects, why, who we share it with, how long we keep it, how we protect it, and the rights and choices you have. By creating an account or placing an order, you agree to this policy.',
    ],
  },
  {
    h: '2. The information we collect',
    p: [
      'We collect only what we need to run your orders (the principle of data minimisation). This includes:',
    ],
    list: [
      [
        'Your mobile number',
        'to sign you in with a one-time password (OTP) delivered over WhatsApp or SMS, and to reach you about your orders.',
      ],
      [
        'Your name and delivery address',
        'the community, block, flat and floor you choose — so we can deliver to the right door.',
      ],
      ['Your orders', 'what you ordered, when, the amount, and the delivery and payment status.'],
      [
        'Payment confirmation',
        'payments are processed by Razorpay. We receive only a confirmation and a payment reference; we never see or store your full card number, UPI PIN, CVV, or bank credentials.',
      ],
      [
        'Approximate location',
        'only when you tap to check whether your community is serviceable. It is used once, in the foreground; we do not track your location in the background.',
      ],
      [
        'Camera and photos',
        'only when you choose to photograph a vegetable to search for it, or attach a photo to a complaint. We do not scan your photo library.',
      ],
      [
        'Microphone / voice',
        'only while you use voice search; your speech is converted to text to find items. We do not record in the background.',
      ],
      [
        'Device notification token',
        'only if you allow notifications, so we can tell you when your order is confirmed, packed, on the way, or delivered.',
      ],
      [
        'App diagnostics and crash data',
        'app version and anonymous error/crash reports (via Sentry) that help us keep the app working. See “Crash reporting”.',
      ],
    ],
  },
  {
    h: '3. Device permissions and why we ask',
    p: [
      'The app requests only the permissions it needs for a feature you use, and each is optional. You can grant or revoke any of them at any time in your device settings:',
    ],
    list: [
      [
        'Location (approximate/precise)',
        'a one-time, foreground check of whether we deliver to your community.',
      ],
      ['Camera', 'to photograph a vegetable to find it, or to show us a problem with an order.'],
      ['Photos / media', 'to attach a photo you choose to a search or a complaint.'],
      ['Microphone', 'for voice search of the catalogue.'],
      ['Notifications', 'to send you order-status updates.'],
    ],
    after: [
      'Declining a permission only disables that one feature; the rest of the app continues to work.',
    ],
  },
  {
    h: '4. What we do NOT collect',
    p: [
      'We do not ask for or store your card number, UPI PIN, CVV, or bank passwords — those go directly to our payment partner. We do not track your location in the background. We do not read your contacts, SMS, or call logs. We do not collect data from other apps on your device, we do not use third-party advertising trackers, and we do not build advertising profiles or sell your data.',
    ],
  },
  {
    h: '5. Why we use your data, and our legal basis',
    p: [
      'Under the DPDP Act we process your personal data based on the consent you give when you sign up and order, and for the legitimate purposes of providing the Service you ask for. Specifically, we use your data to:',
    ],
    list: [
      ['Run your orders', 'take, pack, deliver, and support the orders you place.'],
      ['Sign you in', 'verify your number and keep you signed in securely.'],
      ['Keep you informed', 'send order-status notifications you can turn off any time.'],
      ['Take payment', 'process and reconcile payments through our payment partner.'],
      [
        'Improve and secure the Service',
        'understand demand to buy and deliver better, and detect and prevent fraud and abuse.',
      ],
      ['Meet legal obligations', 'keep invoices and records required by tax and other laws.'],
    ],
    after: ['We never sell your personal data, and we do not use it for third-party advertising.'],
  },
  {
    h: '6. Who we share it with',
    p: [
      'We share only what is needed to deliver your order and run the Service. Each of the following acts as our data processor, on our instructions and under contract:',
    ],
    list: [
      ['Delivery team', 'your name, flat, and contact number for the order being delivered.'],
      [
        'Razorpay',
        'our PCI-DSS-compliant payment processor, to take payment securely (razorpay.com/privacy).',
      ],
      ['MSG91', 'to deliver your login OTP over WhatsApp or SMS.'],
      ['Google', 'Google Sign-In, used by our staff/operator console.'],
      ['Supabase', 'secure database and storage hosting for the Service.'],
      ['Expo (EAS)', 'app updates and delivery of push notifications.'],
      ['Sentry', 'anonymous crash and error reporting (see “Crash reporting”).'],
    ],
    after: [
      'We do not sell your personal data to anyone. We may disclose data if we are legally required to, for example in response to a lawful request from a government authority or court.',
    ],
  },
  {
    h: '7. Crash reporting and analytics',
    p: [
      'To keep the app stable we use Sentry for crash and error reporting. It records technical diagnostics such as the app version, device model, operating-system version and the error that occurred. We do not use advertising networks, ad trackers, or cross-app tracking of any kind. Sentry is the only third-party analytics/diagnostics service in the app.',
    ],
  },
  {
    h: '8. Transfer of data outside India',
    p: [
      'Some of our processors may store or process data on servers located outside India. Where that happens we take steps to ensure your data continues to receive the protection this policy describes. Such transfers are made in accordance with the DPDP Act, which permits transfer to countries other than those the Government of India restricts.',
    ],
  },
  {
    h: '9. How long we keep it',
    p: [
      'We keep your account and order information for as long as your account is active and as needed to provide the Service. Order and payment records are retained for the period required by Indian tax and accounting law (generally up to eight years). When you ask us to delete your account, we delete or anonymise your personal data except where we must keep certain records to meet a legal obligation or resolve disputes.',
    ],
  },
  {
    h: '10. How we protect it',
    p: [
      'We follow reasonable security practices and procedures as required by the SPDI Rules. Access to the app requires a one-time password sent to your number. Data travels over encrypted (HTTPS/TLS) connections and is stored with a reputable cloud provider using access controls and row-level security. Payment details are handled by our PCI-DSS-compliant payment partner and never pass through our own systems. We restrict internal access to personal data to staff who need it. No method of transmission or storage is perfectly secure, but we work to protect your information and will notify you and the authorities of a personal-data breach as required by law.',
    ],
  },
  {
    h: '11. Your rights under the DPDP Act',
    p: ['As a Data Principal, you have the right to:'],
    list: [
      ['Access', 'ask for a summary of the personal data we hold about you and how we process it.'],
      [
        'Correction & completion',
        'have inaccurate or incomplete data corrected, completed or updated.',
      ],
      ['Erasure', 'ask us to delete your personal data where it is no longer needed.'],
      ['Grievance redressal', 'raise a concern with our Grievance Officer (see below).'],
      [
        'Nomination',
        'nominate another person to exercise your rights in the event of your death or incapacity.',
      ],
      ['Withdraw consent', 'withdraw your consent to processing at any time (see below).'],
    ],
    after: [
      `To exercise any of these rights, email ${CONTACT}. We will verify your request and respond within the time the law requires.`,
    ],
  },
  {
    h: '12. Withdrawing your consent',
    p: [
      `You can withdraw your consent to our processing of your personal data at any time by emailing ${CONTACT} or by deleting your account in the app. Withdrawing consent does not affect processing already carried out, and because we need certain data to deliver your orders, withdrawing it may mean we can no longer provide the Service.`,
    ],
  },
  {
    h: '13. Grievance Officer',
    p: [
      'In accordance with the DPDP Act, 2023 and the Information Technology Act, 2000 and its rules, you may contact our Grievance Officer with any concern about your personal data or this policy:',
    ],
    list: [
      ['Name', GRIEVANCE_OFFICER],
      ['Email', CONTACT],
      ['Address', REG_ADDRESS],
    ],
    after: [
      'We acknowledge grievances within 24–48 hours and work to resolve them within the period required by law (and, for grievances under the SPDI Rules, within one month).',
    ],
  },
  {
    h: '14. Complaints to the Data Protection Board',
    p: [
      'If you are not satisfied with how we have handled your concern, you have the right to lodge a complaint with the Data Protection Board of India established under the DPDP Act, 2023.',
    ],
  },
  {
    h: '15. Children',
    p: [
      'The Service is intended for adults (18 years and over) who can place grocery orders. Under the DPDP Act a “child” is anyone under 18. We do not knowingly process a child’s personal data without verifiable consent from a parent or lawful guardian, and we do not track children or direct advertising at them. If you believe a child has given us personal data, contact us and we will delete it.',
    ],
  },
  {
    h: '16. Deleting your account and data',
    p: [
      `You can delete your account and personal data at any time from within the app (Profile → Delete account), through our account-deletion page, or by emailing ${CONTACT}. We will delete or anonymise your personal data, except for records we are legally required to retain (for example, tax invoices). Deletion usually completes within 30 days.`,
    ],
  },
  {
    h: '17. Changes to this policy',
    p: [
      'We may update this policy as the Service grows or the law changes. We will update the “Last updated” date above and, for significant changes, highlight them in the app. Your continued use of the Service after a change means you accept the updated policy.',
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

export function Privacy() {
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
            <span>Fooducia</span>
          </div>
          <h1 className="pp-title">Privacy Policy</h1>
          <p className="pp-updated">Last updated {UPDATED}</p>
        </header>

        <p className="pp-lede">
          Your trust matters. This policy is written in plain language so you know exactly what the
          Fooducia app collects and why — no jargon, no surprises.
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
