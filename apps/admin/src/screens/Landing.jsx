/**
 * The public site — what a customer sees at fooducia.in before they install anything.
 *
 * It shares this bundle with the operator panel because the two live on the same domain: `/` is
 * this page, `/admin` is the console. Every style here is scoped under `.lp` so the two cannot
 * bleed into each other.
 *
 * WHAT THE PAGE IS TRYING TO DO: an app you have never used is an abstraction. So the page is built
 * around the product itself — real screens captured from the running app, in a device frame, in the
 * order a customer actually meets them. The two things a screenshot cannot show, a moving order and
 * a notification waiting on a decision, are rebuilt here in the app's own design language and
 * animated, rather than faked with a picture of one.
 *
 * Every number and rule stated below is one the product actually enforces (minimum basket, the
 * four-digit door code, per-community windows, the three languages). Nothing here is aspirational.
 */
import { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import '../styles/landing.css';
import mark from '../assets/fooducia-mark.png';
import { COMPANY } from './terms-content.js';
import { ProduceLayer, ProduceBurst, ProduceScatter, Tomato as BentoTomato } from './Produce.jsx';

// Statutory identity line — renders only the values the owner has filled in COMPANY (entity, CIN,
// FSSAI licence, GSTIN). Blank until then, exactly like Zomato/Blinkit footers once completed.
const COMPANY_LINE = [
  COMPANY.legalName,
  COMPANY.cin && `CIN ${COMPANY.cin}`,
  COMPANY.fssai && `FSSAI ${COMPANY.fssai}`,
  COMPANY.gstin && `GSTIN ${COMPANY.gstin}`,
]
  .filter(Boolean)
  .join(' · ');

/** Swap these for the real listings the day they go live; nothing else needs to change. */
const APP_STORE_URL = '';
const PLAY_STORE_URL = '';

/** The device shell. Its screen aperture is transparent, so the screenshot shows through it. */
const FRAME = '/iphone-frame.webp';

const SHOT = {
  home: '/shots/home.webp',
  catalog: '/shots/catalog.webp',
  grid: '/shots/grid.webp',
  basket: '/shots/basket.webp',
  basketMin: '/shots/basket-min.webp',
  wallet: '/shots/wallet.webp',
  tracking: '/shots/tracking.webp',
};

/* ── little icons ─────────────────────────────────────────────────────────── */
const Ic = ({ d, size = 20, ...p }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...p}
  >
    {d}
  </svg>
);
const IcLeaf = (p) => (
  <Ic
    {...p}
    d={
      <>
        <path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 10-4 14-9 14z" />
        <path d="M4 20c3-6 6-8 11-9" />
      </>
    }
  />
);
const IcClock = (p) => (
  <Ic
    {...p}
    d={
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    }
  />
);
const IcGlobe = (p) => (
  <Ic
    {...p}
    d={
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
      </>
    }
  />
);
const IcWallet = (p) => (
  <Ic
    {...p}
    d={
      <>
        <rect x="3" y="6" width="18" height="13" rx="3" />
        <path d="M3 10h18M16.5 14.5h.01" />
      </>
    }
  />
);
const IcShield = (p) => <Ic {...p} d={<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />} />;
const IcTruck = (p) => (
  <Ic
    {...p}
    d={
      <>
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="1.6" />
        <circle cx="17" cy="18" r="1.6" />
      </>
    }
  />
);
const IcCheck = (p) => <Ic {...p} d={<path d="M20 6L9 17l-5-5" />} />;
const IcBell = (p) => (
  <Ic
    {...p}
    d={
      <>
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21a2 2 0 0 0 4 0" />
      </>
    }
  />
);
const IcPin = (p) => (
  <Ic
    {...p}
    d={
      <>
        <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.6" />
      </>
    }
  />
);
const IcCamera = (p) => (
  <Ic
    {...p}
    d={
      <>
        <path d="M3 8h4l2-2h6l2 2h4v11H3z" />
        <circle cx="12" cy="13" r="3.4" />
      </>
    }
  />
);
const IcMic = (p) => (
  <Ic
    {...p}
    d={
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </>
    }
  />
);

/* ── the device ───────────────────────────────────────────────────────────── */
/**
 * A real device, not a drawn one.
 *
 * The shell is a photographed iPhone with a genuinely transparent screen aperture, so the screen
 * sits BEHIND it and the metal, the buttons, the bezel curve and the Dynamic Island are all real
 * rather than approximated in CSS. The aperture's position was measured out of the asset's alpha
 * channel (see the percentages in landing.css), which is why the screen lines up with it exactly.
 */
function Phone({ src, alt, small, float, children, className = '' }) {
  return (
    <div
      className={`lp-phone${small ? ' lp-phone--sm' : ''}${float ? ' lp-phone__float' : ''} ${className}`}
    >
      <div className="lp-phone__screen">
        {src ? <img src={src} alt={alt} loading="lazy" decoding="async" /> : children}
      </div>
      <img className="lp-phone__shell" src={FRAME} alt="" aria-hidden="true" />
    </div>
  );
}

/* ── the field ────────────────────────────────────────────────────────────────
   Drawn rather than photographed: a stock photo of a farm is the one thing on a
   page like this that always looks borrowed. */
function Field() {
  return (
    <svg viewBox="0 0 1000 340" role="img" aria-label="Sunrise over the fields outside Hyderabad">
      <defs>
        <linearGradient id="lpSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dCEBF6" />
          <stop offset="52%" stopColor="#F4EBD3" />
          <stop offset="100%" stopColor="#FAF3E2" />
        </linearGradient>
        <linearGradient id="lpHillA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bfe0c8" />
          <stop offset="100%" stopColor="#a8d4b6" />
        </linearGradient>
        <linearGradient id="lpHillB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8cc79f" />
          <stop offset="100%" stopColor="#5faa7b" />
        </linearGradient>
        <linearGradient id="lpSoil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f7d52" />
          <stop offset="100%" stopColor="#1c5c3a" />
        </linearGradient>
      </defs>

      <rect width="1000" height="340" fill="url(#lpSky)" />
      <circle className="lp-sun" cx="810" cy="86" r="42" fill="#F6D98E" opacity="0.95" />
      <circle className="lp-sun" cx="810" cy="86" r="66" fill="#F6D98E" opacity="0.26" />

      <g className="lp-drift-1" opacity="0.85">
        <ellipse cx="150" cy="70" rx="56" ry="19" fill="#fff" />
        <ellipse cx="196" cy="64" rx="38" ry="22" fill="#fff" />
        <ellipse cx="110" cy="64" rx="30" ry="16" fill="#fff" />
      </g>
      <g className="lp-drift-2" opacity="0.6">
        <ellipse cx="420" cy="118" rx="44" ry="15" fill="#fff" />
        <ellipse cx="456" cy="113" rx="30" ry="18" fill="#fff" />
      </g>

      <g className="lp-bird" stroke="#5b6b61" strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M120 96l9-7 9 7" />
        <path d="M146 106l7-5 7 5" />
      </g>
      <g
        className="lp-bird lp-bird--b"
        stroke="#5b6b61"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      >
        <path d="M60 132l7-5 7 5" />
      </g>

      {/* the hills */}
      <path
        d="M0 196c140-34 232 16 368-6s236-56 372-30 190 44 260 36v144H0z"
        fill="url(#lpHillA)"
      />
      <path
        d="M0 232c150-28 248 22 384 2s246-44 352-22 196 34 264 28v100H0z"
        fill="url(#lpHillB)"
      />

      {/* a village on the ridge */}
      <g fill="#4a7f61" opacity="0.65">
        <rect x="118" y="206" width="22" height="18" rx="2" />
        <path d="M114 206l15-11 15 11z" />
        <rect x="150" y="212" width="17" height="12" rx="2" />
        <path d="M146 212l13-9 13 9z" />
        <rect x="88" y="214" width="16" height="10" rx="2" />
        <path d="M85 214l11-8 11 8z" />
      </g>

      {/* the soil */}
      <path d="M0 268c160-20 320 10 500 2s340-24 500-8v78H0z" fill="url(#lpSoil)" />

      {/* rows of crops, each swaying on its own clock */}
      {Array.from({ length: 26 }).map((_, i) => {
        const x = 20 + i * 38;
        const y = 300 - (i % 3) * 5;
        const cls = ['lp-sway', 'lp-sway lp-sway--b', 'lp-sway lp-sway--c'][i % 3];
        return (
          <g key={x} className={cls} style={{ transformOrigin: `${x}px ${y + 22}px` }}>
            <path
              d={`M${x} ${y + 22}V${y}`}
              stroke="#8fd46a"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path d={`M${x} ${y + 6}c-9-4-12-12-12-12s10 1 12 12z`} fill="#9ade74" />
            <path d={`M${x} ${y + 2}c9-4 12-12 12-12s-10 1-12 12z`} fill="#7cc95c" />
          </g>
        );
      })}

      {/* two people working the row */}
      <g className="lp-walk">
        <g transform="translate(0 0)">
          <circle cx="250" cy="268" r="7" fill="#2b3f33" />
          <path
            d="M250 275v18M250 281l-8 7M250 281l8 7M250 293l-6 12M250 293l6 12"
            stroke="#2b3f33"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <path d="M238 262h24" stroke="#d9a441" strokeWidth="4" strokeLinecap="round" />
        </g>
        <g transform="translate(64 10)" opacity="0.9">
          <circle cx="250" cy="268" r="6" fill="#36523f" />
          <path
            d="M250 274v15M250 279l-7 6M250 279l7 6M250 289l-5 10M250 289l5 10"
            stroke="#36523f"
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
          />
          <path d="M240 263h20" stroke="#c98f3a" strokeWidth="3.4" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

/* ── reveal on scroll, by POSITION rather than by intersection events ───────────
 *
 * This used an IntersectionObserver, and an IntersectionObserver only notifies when an element's
 * intersection CHANGES. Opening the page on an anchor — /#get is the "Get the app" link, and so the
 * URL people actually paste — jumps the document straight to the bottom: every element goes from
 * "below the viewport" to "above the viewport" without ever being sampled as visible, the callback
 * never runs for it, and it stays at opacity 0 for good. The result was a blank cream page with
 * nothing on it but the timeline rail.
 *
 * Reading position is correct however the reader arrived: anything at or above the fold line is
 * shown, whether they scrolled to it, jumped past it, or loaded straight into it.
 *
 * AND IT MARKS AN ATTRIBUTE, NOT A CLASS. The timeline steps render their className as a template
 * string that includes `is-on`, which changes on every scroll — so React rewrote the whole class
 * attribute and wiped any class added here, on the very next scroll event. With the old observer
 * that was fatal, because it had already stopped watching the element and never put the class back;
 * the six steps stayed invisible for the rest of the session. React does not manage `data-rv`,
 * because nothing renders it, so marking that survives every re-render.
 */
function useReveal() {
  useEffect(() => {
    // Reveal does not need per-frame precision, and running a whole-document query + rect reads on
    // every Lenis scroll tick was a big source of jank. Throttle to one check per animation frame,
    // and stop listening entirely once every element has been revealed.
    let ticking = false;
    const run = () => {
      ticking = false;
      const line = window.innerHeight * 0.92;
      const pending = document.querySelectorAll('.lp-rv:not([data-rv])');
      pending.forEach((el) => {
        if (el.getBoundingClientRect().top < line) el.setAttribute('data-rv', 'in');
      });
      if (!document.querySelector('.lp-rv:not([data-rv])')) detach();
    };
    const show = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(run);
    };
    function detach() {
      window.removeEventListener('scroll', show);
      window.removeEventListener('resize', show);
      window.removeEventListener('load', show);
      ro?.disconnect();
    }
    show();
    const raf = requestAnimationFrame(show);
    window.addEventListener('scroll', show, { passive: true });
    window.addEventListener('resize', show);
    window.addEventListener('load', show);
    // The browser's jump to a #hash does not land until the six lazy-loaded screenshots have
    // decoded and the page has stopped growing under it — which is well after this effect, and
    // after any fixed timeout worth writing. Watching the document's own height instead catches
    // the jump whenever it actually happens: every layout change re-checks what is now on screen.
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(show) : null;
    ro?.observe(document.documentElement);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('scroll', show);
      window.removeEventListener('resize', show);
      window.removeEventListener('load', show);
    };
  }, []);
}

/* ── smooth inertia scrolling (the Miro / premium-site feel) ───────────────────
 * Lenis gives the whole page buttery wheel + anchor scrolling. It still drives the native scroll
 * position and fires real scroll events, so the parallax, reveals and progress bar all keep working
 * on top of it. Disabled for reduced-motion; destroyed on unmount so leaving the page is clean.
 */
function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return undefined;
    // lerp-based smoothing feels responsive (snappy) rather than floaty/laggy; the duration+easing
    // form is kept only for programmatic scrollTo on anchor clicks.
    const lenis = new Lenis({
      lerp: 0.12,
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: false,
    });
    let raf = 0;
    const loop = (time) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // in-page links glide instead of jumping
    const onClick = (e) => {
      const a = e.target.closest?.('a[href^="#"]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.length < 2) return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        lenis.scrollTo(target, { offset: -72 });
      }
    };
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('click', onClick);
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);
}

/* ── scroll-linked parallax (Miro-style depth) ─────────────────────────────────
 * Any element with a data-par attribute drifts vertically as the page scrolls, at a rate set by the
 * attribute's value — so decorative produce and section visuals move at different depths and the
 * page feels layered rather than flat. Transform-only and rAF-throttled, so it is cheap; disabled
 * for reduced-motion and coarse pointers. It never touches layout, so nothing can shift or break.
 */
function useParallax() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return undefined;
    const els = Array.from(document.querySelectorAll('[data-par]'));
    if (!els.length) return undefined;
    let raf = 0;
    const update = () => {
      const vh = window.innerHeight;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -300 || r.top > vh + 300) continue;
        // clamp to [-1, 1] so elements far from centre don't accumulate a huge offset
        const delta = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
        const speed = parseFloat(el.dataset.par) || 0;
        el.style.transform = `translate3d(0, ${(-delta * speed).toFixed(1)}px, 0)`;
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
}

/* ── the timeline ─────────────────────────────────────────────────────────── */
const STEPS = [
  {
    t: 'Sign in with a number, not a password',
    p: 'A mobile number and a six-digit code sent on WhatsApp. There is no password to choose, forget, or have stolen — because there is no password at all.',
    chips: ['6-digit code', 'On WhatsApp', 'No password, ever'],
    shot: SHOT.home,
    alt: 'The Fooducia home screen, greeting the customer with their saved flat',
  },
  {
    t: 'Tell us the door, once',
    p: 'Your community, your block, your flat. The bag is addressed to a door rather than to a pin on a map, which is why it reaches the right one on the first try.',
    chips: ['Community', 'Block', 'Flat'],
    shot: SHOT.catalog,
    alt: "Today's catalog, filtered by category",
  },
  {
    t: "Shop today's harvest",
    p: 'The catalog is what is being picked, not a warehouse list. Every item carries the name people actually use — palakura, gongura, menthikura — beside the English one, and where it was grown.',
    chips: ['English · हिन्दी · తెలుగు', 'Sourced per item', 'Veg / non-veg filter'],
    shot: SHOT.grid,
    alt: 'The catalog grid showing produce with Telugu names and sourcing',
  },
  {
    t: 'Watch the basket do the arithmetic',
    p: 'Quantities in grams and pieces, not vague "units". The basket follows you as you browse and tells you exactly how far you are from free coriander, from a coupon, or from the ₹500 minimum.',
    chips: ['₹500 minimum', 'Free delivery', 'Notes per item'],
    shot: SHOT.basketMin,
    alt: 'The basket with the minimum-basket prompt',
  },
  {
    t: 'Choose when, with the clock running',
    p: 'Every community sets its own delivery windows, and each one shows a live countdown to the moment ordering closes. Miss the cutoff and the window closes itself rather than quietly taking an order nobody can fill.',
    chips: ['Per-community windows', 'Live cutoff countdown'],
    shot: SHOT.basket,
    alt: 'The basket, shown entirely in Telugu',
  },
  {
    t: 'Pay the way you already pay',
    p: 'Card, UPI, your Fooducia wallet, or cash at the door. The wallet is prepaid, never expires, and is applied automatically — anything left over goes to the gateway.',
    chips: ['UPI', 'Card', 'Wallet', 'Cash on delivery'],
    shot: SHOT.wallet,
    alt: 'The wallet screen, showing balance and statement',
  },
];

/** Real names from the catalog, in the three languages the app ships. */
const TICKER = [
  ['గోంగూర', 'Sorrel leaves'],
  ['पालक', 'Spinach'],
  ['కరివేపాకు', 'Curry leaves'],
  ['मेथी', 'Fenugreek'],
  ['పచ్చిమిర్చి', 'Green chilli'],
  ['बैंगन', 'Brinjal'],
  ['బీట్‌రూట్', 'Beetroot'],
  ['टमाटर', 'Tomato'],
  ['వెల్లుల్లి', 'Garlic'],
  ['अदरक', 'Ginger'],
  ['ఉల్లికాడలు', 'Spring onion'],
  ['नींबू', 'Lemon'],
];

const DOCS = [
  {
    h: 'Delivery',
    rows: [
      ['Windows', 'Set per community, with a live countdown'],
      ['Cutoff', 'Ordering closes before the window opens'],
      ['Charge', 'Free above the minimum basket'],
      ['Proof', 'A four-digit code you read at the door'],
    ],
  },
  {
    h: 'Baskets & pricing',
    rows: [
      ['Minimum', '₹500 per order'],
      ['Quantities', 'Grams, pieces and bunches'],
      ['Prices', 'Fixed at checkout, not at browse'],
      ['Coupons', 'From a brochure or a packet sticker'],
    ],
  },
  {
    h: 'Payments & refunds',
    rows: [
      ['Methods', 'UPI, card, wallet, cash on delivery'],
      ['Wallet', 'Prepaid, never expires, spends only here'],
      ['Refunds', 'Back to the source, or to the wallet'],
      ['Receipts', 'Every paisa shown in the statement'],
    ],
  },
  {
    h: 'If something is wrong',
    rows: [
      ['Raise it', 'Photograph the item in the app'],
      ['Decision', 'A human reviews it, not a rule'],
      ['Outcome', 'Replaced on the next run, or refunded'],
      ['Account', 'Delete it, and the data goes with it'],
    ],
  },
];

const FAQ = [
  [
    'How is this different from a quick-commerce app?',
    'Quick commerce ships what is already sitting in a dark store. Fooducia takes orders through the evening, hands the combined list to the market and the farm in the morning, and delivers on the same run. That is why there is a cutoff and a delivery window instead of a ten-minute promise — and why what arrives was picked after you asked for it.',
  ],
  [
    'Which areas do you deliver to?',
    'Fooducia delivers community by community in Hyderabad rather than by postcode, because the last hundred metres — the right tower, the right floor — is where grocery delivery usually fails. Each community has its own windows and its own cutoff. If yours is not on the list yet, the app will tell you so plainly instead of taking an order it cannot fill.',
  ],
  [
    'Can I shop in Telugu or Hindi?',
    'Yes, and not only the product names. Switch the language and the whole app follows — the basket, the checkout, the order status, the notifications. Produce also keeps the names people actually say at the market, so searching "palak", "palakura" or "पालक" all find the same bunch of spinach.',
  ],
  [
    'What happens if I am not at home?',
    'The order moves to Out for delivery with your window, and you get a notification when the bag is close. At the door, the four-digit code is the proof the bag changed hands — nobody can mark your order delivered without it.',
  ],
  [
    'Is my address and number safe?',
    'Your number signs you in and nothing else; there is no password to leak. Addresses are only visible to the people fulfilling your order, and only for as long as that takes. You can delete your account from inside the app, and the data goes with it.',
  ],
];

/** The stat band. Numbers count up when the row scrolls in; the first cell is plain text. */
const BAND = [
  { text: 'Same morning', label: 'Cut at dawn, delivered before breakfast' },
  { num: 3, suf: ' languages', label: 'The whole app, not just the labels' },
  { pre: '₹', num: 500, label: 'Minimum basket · delivery free above it' },
  { num: 4, suf: ' digits', label: 'The door code that proves it was handed over' },
];

/** Counts from 0 to `to` once, the first time it scrolls into view. Respects reduced motion. */
function CountUp({ to, ms = 1100 }) {
  const ref = useRef(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      setN(to);
      return undefined;
    }
    let raf = 0;
    let started = false;
    const run = (t0) => {
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / ms);
        // ease-out cubic
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started) {
          started = true;
          run(performance.now());
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, ms]);
  return <span ref={ref}>{n.toLocaleString('en-IN')}</span>;
}

/** A hairline that draws itself across the page as it scrolls in (Antimetal-style divider). */
function Divider() {
  return (
    <div className="lp-wrap">
      <div className="lp-div lp-rv" aria-hidden="true" />
    </div>
  );
}

/** Prompts the AI-planner terminal types out, then clears, in a loop. Real feature (aiPlan). */
const PROMPTS = [
  'a week of South Indian dinners for 4',
  'everything for a weekend biryani',
  'low-oil meals, mostly leafy greens',
  'a ₹1200 basket for two, no onion',
];

/**
 * A Steel-style terminal card that types a request to the AI planner, holds, then clears and types
 * the next — a living demo of a real feature (the planner turns a sentence into a basket).
 */
function PlannerTerminal() {
  const [text, setText] = useState('');
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      setText(PROMPTS[0]);
      return undefined;
    }
    let p = 0;
    let i = 0;
    let mode = 'type';
    let timer = 0;
    const step = () => {
      const full = PROMPTS[p];
      if (mode === 'type') {
        i += 1;
        setText(full.slice(0, i));
        if (i >= full.length) {
          mode = 'hold';
          timer = setTimeout(step, 1600);
          return;
        }
        timer = setTimeout(step, 42 + Math.random() * 40);
      } else if (mode === 'hold') {
        mode = 'erase';
        timer = setTimeout(step, 40);
      } else {
        i -= 2;
        if (i <= 0) {
          i = 0;
          p = (p + 1) % PROMPTS.length;
          mode = 'type';
          timer = setTimeout(step, 240);
          return;
        }
        setText(full.slice(0, i));
        timer = setTimeout(step, 22);
      }
    };
    timer = setTimeout(step, 400);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div
      className="lp-term lp-rv"
      role="img"
      aria-label="The Fooducia planner turning a request into a basket"
    >
      <div className="lp-term__bar">
        <i /> <i /> <i />
        <span className="lp-term__title">Fooducia · planner</span>
      </div>
      <div className="lp-term__body">
        <p className="lp-term__line">
          <span className="lp-term__prompt">plan</span>
          <span className="lp-term__arrow">❯</span>
          <span className="lp-term__typed">{text}</span>
          <span className="lp-term__caret" />
        </p>
        <div className="lp-term__out">
          {[
            '🥬 Palak · 2 bunches',
            '🍅 Tomato · 1 kg',
            '🧅 Onion · 500 g',
            '🌶 Chilli · 100 g',
          ].map((r) => (
            <span className="lp-term__chip" key={r}>
              {r}
            </span>
          ))}
          <span className="lp-term__chip lp-term__chip--ghost">+ 6 more → basket</span>
        </div>
      </div>
    </div>
  );
}

/** Produce names the hero search cycles through, in the three languages the app ships. */
const SEARCH_WORDS = [
  'palak',
  'పాలకూర',
  'tomato',
  'టమాటా',
  'coriander',
  'कोथमीर',
  'ginger',
  'అల్లం',
  'green chilli',
  'నిమ్మకాయ',
];

export function Landing() {
  useSmoothScroll();
  useReveal();
  useParallax();
  const [stuck, setStuck] = useState(false);
  const railRef = useRef(null);
  const fillRef = useRef(null);
  const stepRefs = useRef([]);
  const [activeStep, setActiveStep] = useState(-1);
  const [searchWord, setSearchWord] = useState(SEARCH_WORDS[0]);

  // Cycle the hero search placeholder — a small, living detail that shows the catalogue is
  // multilingual without a word of marketing copy.
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % SEARCH_WORDS.length;
      setSearchWord(SEARCH_WORDS[i]);
    }, 1900);
    return () => clearInterval(id);
  }, []);

  // Cursor parallax over the hero (Antimetal/Octolane feel): the thrown produce and the aurora
  // lean toward the pointer. Written to CSS custom properties so there is no per-frame re-render,
  // and skipped entirely for anyone who prefers reduced motion or is on a touch device.
  useEffect(() => {
    const hero = document.querySelector('.lp-hero');
    if (!hero) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
    if (reduce || coarse) return undefined;
    const onMove = (e) => {
      const r = hero.getBoundingClientRect();
      const mx = (e.clientX - r.left) / r.width - 0.5;
      const my = (e.clientY - r.top) / r.height - 0.5;
      hero.style.setProperty('--lp-mx', mx.toFixed(3));
      hero.style.setProperty('--lp-my', my.toFixed(3));
    };
    hero.addEventListener('pointermove', onMove);
    return () => hero.removeEventListener('pointermove', onMove);
  }, []);

  // The rail fills to the badge of the step you are actually reading, so the page reads as the
  // journey it describes. Measuring each step beats a fraction of the whole block: the steps are
  // not equal heights, so a global fraction put the green line in the gap between two of them.
  useEffect(() => {
    let ticking = false;
    const run = () => {
      ticking = false;
      const y = window.scrollY;
      setStuck(y > 8); // React bails when the boolean is unchanged — so this re-renders only twice.
      // Reading-progress bar and hero drift — CSS vars, no re-render.
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      doc.style.setProperty('--lp-progress', max > 0 ? (y / max).toFixed(4) : '0');
      const stage = document.querySelector('.lp-hero__stage');
      if (stage) stage.style.setProperty('--lp-par', `${Math.min(y, 900) * 0.07}px`);
      const rail = railRef.current;
      const fillEl = fillRef.current;
      if (!rail || !fillEl) return;
      const line = window.innerHeight * 0.55;
      let last = -1;
      stepRefs.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top < line) last = i;
      });
      setActiveStep(last); // changes ~6× across the whole page; React bails otherwise.
      // The rail fill height is written straight to the DOM (a ref), NOT React state — updating it
      // through setState ran a full component re-render on every single scroll frame, which was the
      // main cause of the scroll feeling laggy under smooth scroll.
      let h = 0;
      if (last >= 0) {
        const badge = stepRefs.current[last]?.querySelector('.lp-step__n');
        if (badge) {
          const b = badge.getBoundingClientRect();
          const top = rail.getBoundingClientRect().top;
          h = Math.max(0, Math.min(rail.offsetHeight, b.top + b.height / 2 - top));
        }
      }
      fillEl.style.height = `${h}px`;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(run);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div className="lp">
      <div className="lp__sky" aria-hidden="true">
        <span className="lp__cloud lp__cloud--1" />
        <span className="lp__cloud lp__cloud--2" />
        <span className="lp__cloud lp__cloud--3" />
      </div>

      <div className="lp__body">
        {/* Reading-progress bar (2025 micro-interaction). */}
        <div className="lp-progress" aria-hidden="true" />

        {/* Announcement ribbon — Steel-style: one line, a live status, an arrow. */}
        <a className="lp-ann" href="#get">
          <span className="lp-ann__badge">NEW</span>
          Launching community by community across Hyderabad
          <span className="lp-ann__arrow" aria-hidden="true">
            →
          </span>
        </a>

        <header className={`lp-nav${stuck ? ' is-stuck' : ''}`}>
          <div className="lp-wrap lp-nav__in">
            <a className="lp-nav__brand" href="#top">
              <img src={mark} alt="" width={30} height={30} />
              Fooducia
            </a>
            <nav className="lp-nav__links">
              <a href="#how">How it works</a>
              <a href="#track">Live tracking</a>
              <a href="#language">Your language</a>
              <a href="#details">The details</a>
            </nav>
            <a className="lp-btn lp-btn--primary" href="#get">
              Get the app
            </a>
          </div>
        </header>

        {/* ── hero ───────────────────────────────────────────────────────── */}
        <section className="lp-hero" id="top">
          {/* Octolane-style living aurora: slow prismatic ribbons in produce tones. */}
          <div className="lp-aurora" aria-hidden="true">
            <span className="lp-aurora__blob lp-aurora__blob--1" />
            <span className="lp-aurora__blob lp-aurora__blob--2" />
            <span className="lp-aurora__blob lp-aurora__blob--3" />
            <span className="lp-aurora__blob lp-aurora__blob--4" />
          </div>
          <ProduceLayer
            className="pr-layer--hero"
            items={[
              { k: 'leaf', x: 6, y: 18, s: 54, r: -18, d: 11, drift: 22, o: 0.5, delay: 0 },
              { k: 'lemon', x: 90, y: 24, s: 44, r: 14, d: 13, drift: 18, o: 0.5, delay: 1.2 },
              { k: 'mint', x: 72, y: 70, s: 40, r: 8, d: 10, drift: 20, o: 0.45, delay: 0.6 },
              { k: 'chili', x: 14, y: 76, s: 46, r: 26, d: 12, drift: 24, o: 0.45, delay: 1.8 },
            ]}
          />
          <div className="lp-wrap lp-hero__grid">
            <div className="lp-hero__copy">
              <span className="lp-eyebrow" style={{ '--i': 0 }}>
                Hyderabad · harvested to order
              </span>
              <h1 style={{ '--i': 1 }}>
                Order tonight.
                <br />
                It is <em>picked in the morning</em>.
              </h1>
              <p className="lp-lede" style={{ '--i': 2 }}>
                Most vegetables reach your kitchen four days after they left the soil. Fooducia was
                built to close that gap: your order goes to the farm overnight, it is cut at dawn,
                and it is at your door before breakfast.
              </p>
              {/* Glide-style prompt box: a real-feeling search that cycles produce the app sells. */}
              <div className="lp-search" style={{ '--i': 3 }}>
                <IcLeaf size={18} className="lp-search__leaf" />
                <span className="lp-search__text">
                  Search “<em key={searchWord}>{searchWord}</em>”
                </span>
                {/* Voice search and the AI lens — both real features of the app. */}
                <a
                  className="lp-search__tool"
                  href="#get"
                  title="Search by voice — in the app"
                  aria-label="Search by voice"
                >
                  <IcMic size={18} />
                </a>
                <a
                  className="lp-search__tool"
                  href="#get"
                  title="Point the camera, get the item — Lens, in the app"
                  aria-label="Search with the camera lens"
                >
                  <IcCamera size={18} />
                </a>
                <a className="lp-search__go" href="#get" aria-label="Get the app">
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </a>
              </div>
              <div className="lp-hero__cta" style={{ '--i': 4 }}>
                <StoreBadges />
              </div>
              {/* Twin-style social proof row. */}
              <div className="lp-social" style={{ '--i': 5 }}>
                <span className="lp-social__stars" aria-hidden="true">
                  ★★★★★
                </span>
                <span>
                  <b>3 farms</b> · Chevella, Shamshabad, Araku
                </span>
                <span className="lp-social__dot" aria-hidden="true">
                  ·
                </span>
                <span>
                  <b>Same-morning</b> delivery
                </span>
              </div>
              <div className="lp-hero__proof" style={{ '--i': 6 }}>
                <span>
                  <IcLeaf size={17} /> Never from a cold room
                </span>
                <span>
                  <IcGlobe size={17} /> English · हिन्दी · తెలుగు
                </span>
                <span>
                  <IcShield size={17} /> No password, ever
                </span>
              </div>
            </div>

            <div className="lp-stage lp-hero__stage">
              <div style={{ position: 'relative' }}>
                <ProduceBurst />
                <Phone src={SHOT.home} alt="The Fooducia home screen on an iPhone" float />
                <div className="lp-pin lp-pin--tl">
                  <span className="lp-pin__dot" style={{ background: 'var(--lp-leaf-soft)' }}>
                    <IcTruck size={18} style={{ color: 'var(--lp-leaf-deep)' }} />
                  </span>
                  <span>
                    <b>Out for delivery</b>
                    <small>2 stops away</small>
                  </span>
                </div>
                <div className="lp-pin lp-pin--br">
                  <span className="lp-pin__dot" style={{ background: 'var(--lp-butter)' }}>
                    <IcClock size={18} style={{ color: '#8a6a12' }} />
                  </span>
                  <span>
                    <b>Closes in 02:14</b>
                    <small>Thu · 6–8:30 am</small>
                  </span>
                </div>
              </div>
            </div>
          </div>
          {/* Octolane-style scroll cue. */}
          <a className="lp-scroll" href="#how" aria-label="Scroll to explore">
            <span className="lp-scroll__t">SCROLL TO EXPLORE</span>
            <span className="lp-scroll__line" />
          </a>
        </section>

        {/* ── band — numbers count up as the row scrolls into view ─────────── */}
        <div className="lp-wrap">
          <div className="lp-band lp-rv">
            {BAND.map((b) => (
              <div className="lp-band__cell" key={b.label}>
                <div className="lp-band__n">
                  {b.num != null ? (
                    <>
                      {b.pre}
                      <CountUp to={b.num} />
                      {b.suf}
                    </>
                  ) : (
                    b.text
                  )}
                </div>
                <div className="lp-band__l">{b.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── what is in the catalog today, rolling past ─────────────────── */}
        <div className="lp-ticker" aria-hidden="true">
          <div className="lp-ticker__track">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span className="lp-ticker__item" key={`${t[0]}-${i}`}>
                {t[0]} <span>{t[1]}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── timeline ───────────────────────────────────────────────────── */}
        <section className="lp-sec lp-sec--produce" id="how">
          <ProduceLayer
            items={[
              { k: 'lemon', x: 2, y: 8, s: 48, r: -14, d: 12, drift: 20, o: 0.28 },
              { k: 'mint', x: 95, y: 40, s: 44, r: 10, d: 11, drift: 22, o: 0.28, delay: 1 },
              { k: 'tomato', x: 92, y: 88, s: 50, r: -8, d: 13, drift: 18, o: 0.26, delay: 0.5 },
              { k: 'chili', x: 4, y: 72, s: 46, r: 22, d: 14, drift: 24, o: 0.26, delay: 1.6 },
            ]}
          />
          <div className="lp-wrap">
            <div className="lp-sec__head lp-rv">
              <span className="lp-eyebrow">The flow, end to end</span>
              <h2>Six screens between a craving and a delivery.</h2>
              <p className="lp-lede">
                Every screen below is the real app, captured from a running build — not a mock-up.
                This is the whole journey, in the order you meet it.
              </p>
            </div>

            <div className="lp-tl">
              <div className="lp-tl__rail" ref={railRef} aria-hidden="true">
                <i ref={fillRef} />
              </div>
              {STEPS.map((s, i) => (
                <article
                  className={`lp-step lp-rv${i % 2 ? ' lp-step--flip' : ''}${i <= activeStep ? ' is-on' : ''}`}
                  key={s.t}
                  ref={(el) => {
                    stepRefs.current[i] = el;
                  }}
                >
                  <div className="lp-step__n">{String(i + 1).padStart(2, '0')}</div>
                  <div className="lp-step__body">
                    <h3>{s.t}</h3>
                    <p>{s.p}</p>
                    <div className="lp-step__meta">
                      {s.chips.map((c) => (
                        <span className="lp-chip" key={c}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="lp-step__art">
                    <Phone src={s.shot} alt={s.alt} small />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── live tracking ──────────────────────────────────────────────── */}
        <section className="lp-sec lp-sec--produce" id="track">
          <ProduceScatter n={5} seed={2} opacity={0.4} size={[44, 68]} />
          <div className="lp-wrap">
            <div className="lp-track lp-rv">
              <div className="lp-stage lp-track__stage" data-par="34">
                <Phone
                  src={SHOT.tracking}
                  alt="An order being tracked in the app: confirmed, packed, on its way, delivered, with the items and the total"
                />
              </div>
              <div className="lp-track__copy">
                <span className="lp-eyebrow">Live, not a status page</span>
                <h2>You watch it happen.</h2>
                <p>
                  Confirmed, harvested, packed, on its way, delivered. The order moves in front of
                  you as the morning happens — and when the bag reaches your door, you read out a
                  four-digit code. That code is the proof it changed hands; nobody can close your
                  order without it.
                </p>
                <p>
                  If something has to change — a crop short that morning, a substitution — the app
                  asks you rather than deciding for you. You accept or decline from the
                  notification, before anything is packed.
                </p>
                <div className="lp-step__meta">
                  <span className="lp-chip">
                    <IcBell size={14} /> Ask, don&apos;t assume
                  </span>
                  <span className="lp-chip">
                    <IcCheck size={14} /> Door code on handover
                  </span>
                  <span className="lp-chip">
                    <IcCamera size={14} /> Photograph a problem
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Divider />

        {/* ── planner (Steel-style terminal) ─────────────────────────────── */}
        <section className="lp-sec lp-sec--produce">
          <ProduceLayer
            items={[
              { k: 'garlic', x: 4, y: 24, s: 46, r: -16, d: 12, drift: 20, o: 0.24 },
              { k: 'lemon', x: 93, y: 68, s: 44, r: 14, d: 13, drift: 18, o: 0.24, delay: 1 },
            ]}
          />
          <div className="lp-wrap">
            <div className="lp-plan">
              <div className="lp-plan__copy lp-rv">
                <span className="lp-eyebrow">Tell it what you&apos;re cooking</span>
                <h2>Say the meal. Get the basket.</h2>
                <p className="lp-lede">
                  Describe dinner in a sentence and the planner fills a basket with the exact
                  produce and quantities — in your language. Or point the camera at a vegetable and
                  Lens finds it in today&apos;s catalogue.
                </p>
                <div className="lp-step__meta">
                  <span className="lp-chip">Voice or text</span>
                  <span className="lp-chip">Camera lens</span>
                  <span className="lp-chip">Quantities, not guesses</span>
                </div>
              </div>
              <PlannerTerminal />
            </div>
          </div>
        </section>

        <Divider />

        {/* ── language ───────────────────────────────────────────────────── */}
        <section className="lp-sec lp-sec--produce" id="language">
          <ProduceLayer
            items={[
              { k: 'mint', x: 3, y: 60, s: 46, r: -12, d: 12, drift: 22, o: 0.24 },
              { k: 'chili', x: 95, y: 18, s: 44, r: 18, d: 13, drift: 20, o: 0.24, delay: 0.8 },
            ]}
          />
          <div className="lp-wrap lp-lang">
            <div className="lp-sec__head lp-rv" style={{ marginBottom: 0 }}>
              <span className="lp-eyebrow">Shop the way you speak</span>
              <h2>Not a translated label. The whole app.</h2>
              <p className="lp-lede">
                Switch to Telugu or Hindi and everything follows — the basket, the checkout, the
                order status, the notifications. Produce keeps the names people actually use at the
                market, so &quot;palak&quot;, &quot;palakura&quot; and &quot;पालक&quot; all find the
                same bunch of spinach.
              </p>
              <div className="lp-lang__words">
                {[
                  ['గోంగూర', 'Sorrel leaves'],
                  ['పాలకూర', 'Spinach'],
                  ['मेथी', 'Fenugreek'],
                  ['కరివేపాకు', 'Curry leaves'],
                  ['बैंगन', 'Brinjal'],
                  ['పచ్చిమిర్చి', 'Green chilli'],
                ].map(([a, b]) => (
                  <span className="lp-word" key={a}>
                    {a}
                    <small>{b}</small>
                  </span>
                ))}
              </div>
            </div>
            <div className="lp-stage lp-lang__stage lp-rv">
              <Phone
                src={SHOT.basket}
                alt="The basket screen rendered entirely in Telugu"
                small
                float
              />
            </div>
          </div>
        </section>

        {/* ── the field ──────────────────────────────────────────────────── */}
        <section className="lp-sec lp-sec--produce">
          <ProduceScatter n={6} seed={5} opacity={0.4} size={[42, 64]} />
          <div className="lp-wrap">
            <div className="lp-sec__head lp-rv">
              <span className="lp-eyebrow">Where it comes from</span>
              <h2>A short morning between the field and your floor.</h2>
              <p className="lp-lede">
                Orders close in the evening. The combined list goes out overnight, and what comes
                back is cut that morning at Chevella, Shamshabad and Araku — then packed per flat,
                not per warehouse shelf.
              </p>
            </div>
            <div className="lp-field lp-rv">
              <Field />
              <div className="lp-field__cap">
                <span>
                  <i /> Chevella — leafy greens
                </span>
                <span>
                  <i /> Shamshabad — tomato, spring onion
                </span>
                <span>
                  <i /> Araku — ginger and hill produce
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── cards ──────────────────────────────────────────────────────── */}
        <section className="lp-sec lp-sec--produce">
          <ProduceLayer
            items={[
              { k: 'carrot', x: 3, y: 12, s: 56, r: -20, d: 12, drift: 20, o: 0.3 },
              { k: 'onion', x: 93, y: 20, s: 52, r: 16, d: 13, drift: 18, o: 0.3, delay: 1 },
              { k: 'garlic', x: 88, y: 78, s: 50, r: -10, d: 11, drift: 22, o: 0.3, delay: 0.5 },
              { k: 'leaf', x: 6, y: 82, s: 46, r: 24, d: 14, drift: 24, o: 0.3, delay: 1.6 },
            ]}
          />
          <div className="lp-wrap">
            <div className="lp-sec__head lp-rv">
              <span className="lp-eyebrow">Built into the app</span>
              <h2>The small things that decide whether you order again.</h2>
            </div>
            <div className="lp-bento">
              {[
                [
                  IcWallet,
                  'A wallet that is actually a wallet',
                  'Prepaid, never expires, spends only here. It is applied automatically at checkout and anything left over goes to the gateway. Every top-up, debit and refund is itemised in the statement.',
                  'var(--lp-leaf-soft)',
                ],
                [
                  IcClock,
                  'Windows with a visible clock',
                  'Each community sets its own delivery windows, and each shows a live countdown to the cutoff. When it closes, it closes — rather than accepting an order the morning cannot fill.',
                  'var(--lp-butter)',
                ],
                [
                  IcPin,
                  'Addressed to a door, not a pin',
                  'Community, block, flat. Saved once, and used for every order after it — the bag reaches the right door the first time, not the right building.',
                  'var(--lp-sky)',
                ],
                [
                  IcCamera,
                  'Complaints a human reads',
                  'If something is wrong, photograph it. It lands in the console as a decision, and comes back as a replacement or a refund.',
                  'var(--lp-blush)',
                ],
                [
                  IcShield,
                  'No password to steal',
                  'Your number and a six-digit code on WhatsApp. No password on the account — nothing to reuse, leak or guess.',
                  'var(--lp-mint)',
                ],
                [
                  IcCheck,
                  'Proof at the door',
                  'A four-digit code read out at handover closes the order — the difference between “marked delivered” and actually delivered.',
                  'var(--lp-leaf-soft)',
                ],
              ].map(([Icon, t, p, bg], i) => (
                <article className={`lp-card lp-rv${i === 0 ? ' lp-card--feature' : ''}`} key={t}>
                  {i === 0 && (
                    <div className="lp-card__art" aria-hidden="true">
                      <BentoTomato />
                    </div>
                  )}
                  <span className="lp-card__ic" style={{ background: bg }}>
                    <Icon size={i === 0 ? 24 : 21} />
                  </span>
                  <h3>{t}</h3>
                  <p>{p}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── documentation ──────────────────────────────────────────────── */}
        <section className="lp-sec lp-sec--produce" id="details">
          <ProduceScatter n={4} seed={8} opacity={0.32} size={[40, 58]} />
          <div className="lp-wrap">
            <div className="lp-sec__head lp-rv">
              <span className="lp-eyebrow">The details, in plain terms</span>
              <h2>Everything worth knowing before you order.</h2>
              <p className="lp-lede">
                No asterisks. These are the rules the app actually enforces.
              </p>
            </div>
            <div className="lp-docs">
              {DOCS.map((d) => (
                <section className="lp-doc lp-rv" key={d.h}>
                  <h3>{d.h}</h3>
                  <dl className="lp-dl">
                    {d.rows.map(([k, v]) => (
                      <div key={k} style={{ display: 'contents' }}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </div>
        </section>

        {/* ── faq ────────────────────────────────────────────────────────── */}
        <section className="lp-sec lp-sec--produce">
          <ProduceScatter n={4} seed={11} opacity={0.3} size={[40, 56]} />
          <div className="lp-wrap">
            <div className="lp-sec__head lp-rv">
              <span className="lp-eyebrow">Questions</span>
              <h2>The ones people actually ask.</h2>
            </div>
            <div className="lp-faq">
              {FAQ.map(([q, a]) => (
                <details className="lp-q lp-rv" key={q}>
                  <summary>{q}</summary>
                  <p className="lp-q__a">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <Divider />

        {/* ── closing ────────────────────────────────────────────────────── */}
        <section className="lp-sec lp-sec--produce" id="get">
          <ProduceLayer
            items={[
              { k: 'carrot', x: 4, y: 20, s: 52, r: -18, d: 12, drift: 22, o: 0.3 },
              { k: 'broccoli', x: 92, y: 14, s: 54, r: 12, d: 13, drift: 18, o: 0.3, delay: 0.8 },
              { k: 'banana', x: 90, y: 80, s: 56, r: -10, d: 14, drift: 20, o: 0.28, delay: 0.4 },
              { k: 'onion', x: 6, y: 82, s: 48, r: 20, d: 11, drift: 24, o: 0.28, delay: 1.4 },
            ]}
          />
          <div className="lp-wrap">
            <div className="lp-end lp-rv">
              {/* the harvest spills across the top; the green panel is pulled up over it */}
              <div className="lp-end__band" aria-hidden="true">
                <img className="lp-end__band-img" src="/produce-band.webp" alt="" />
              </div>
              <div className="lp-end__panel">
                <span className="lp-eyebrow">Hyderabad</span>
                <h2>Harvested after you order.</h2>
                <p>
                  Install Fooducia, add your community, and put in your first basket before
                  tonight&apos;s cutoff. It arrives with the morning.
                </p>
                <StoreBadges onDark />
              </div>
            </div>
          </div>
        </section>

        {/* ── footer ─────────────────────────────────────────────────────── */}
        <footer className="lp-foot">
          <div className="lp-wrap">
            <div className="lp-foot__top">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320 }}>
                <span className="lp-foot__brand">
                  <img src={mark} alt="" width={30} height={30} />
                  Fooducia
                </span>
                <p className="lp-foot__blurb">
                  Vegetables harvested after you order them, delivered to Hyderabad apartments the
                  same morning.
                </p>
              </div>
              <div className="lp-foot__cols">
                <div className="lp-foot__col">
                  <b>Product</b>
                  <a href="#how">How it works</a>
                  <a href="#track">Live tracking</a>
                  <a href="#language">Your language</a>
                  <a href="#details">The details</a>
                </div>
                <div className="lp-foot__col">
                  <b>Legal</b>
                  <a href="/privacy">Privacy</a>
                  <a href="/terms">Terms</a>
                  <a href="/refunds">Cancellation &amp; refunds</a>
                  <a href="/shipping">Shipping &amp; delivery</a>
                  <a href="/account-deletion">Account deletion</a>
                </div>
                <div className="lp-foot__col">
                  <b>Get in touch</b>
                  <a href="/contact">Contact us</a>
                  <a href="mailto:support@fooducia.in">support@fooducia.in</a>
                </div>
              </div>
            </div>
            <div className="lp-foot__rule" />
            {COMPANY_LINE ? <div className="lp-foot__legal">{COMPANY_LINE}</div> : null}
            <div className="lp-foot__bot">
              <span>© {new Date().getFullYear()} Fooducia. Made in Hyderabad.</span>
              <a
                className="lp-powered"
                href="https://kiwik.one"
                target="_blank"
                rel="noreferrer noopener"
              >
                <img src="/kiwik-mark.png" alt="" />
                <span>
                  Powered by <b>Kiwik.one</b>
                </span>
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** The two store badges, drawn as vectors so they stay sharp and match the page's weight. */
function StoreBadges({ onDark }) {
  const items = [
    {
      href: APP_STORE_URL,
      small: 'Download on the',
      big: 'App Store',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16.37 12.78c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.61-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.86-.76-1.47.02-2.83.86-3.58 2.17-1.53 2.65-.39 6.57 1.1 8.72.73 1.05 1.6 2.23 2.74 2.19 1.1-.05 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.3-.88-2.32-3.47zM14.2 5.9c.6-.74 1.01-1.76.9-2.78-.87.04-1.93.58-2.56 1.31-.56.65-1.05 1.69-.92 2.69.97.07 1.96-.49 2.58-1.22z" />
        </svg>
      ),
    },
    {
      href: PLAY_STORE_URL,
      small: 'Get it on',
      big: 'Google Play',
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.6 2.4a1 1 0 0 0-.5.87v17.46a1 1 0 0 0 .5.87l9.3-9.6z" fill="#34A853" />
          <path d="M16.9 8.1L5.2 1.6a1 1 0 0 0-1.1.03l9.3 9.57z" fill="#EA4335" />
          <path d="M16.9 15.9l-3.5-3.6 3.5-3.6 3.3 1.84c.8.45.8 1.6 0 2.05z" fill="#FBBC04" />
          <path d="M4.1 22.37a1 1 0 0 0 1.1.03l11.7-6.5-3.5-3.6z" fill="#4285F4" />
        </svg>
      ),
    },
  ];
  const live = items.some((it) => it.href);
  return (
    <div className="lp-stores">
      {items.map((it) => (
        <a
          key={it.big}
          className="lp-store"
          href={it.href || '#get'}
          // Until the listing is live, the badge must not pretend to lead somewhere.
          aria-disabled={it.href ? undefined : 'true'}
          title={it.href ? undefined : 'Launching shortly'}
          style={onDark ? { background: '#fff', color: 'var(--lp-night)' } : undefined}
        >
          {it.icon}
          <span className="lp-store__t">
            <small>{it.small}</small>
            <b>{it.big}</b>
          </span>
        </a>
      ))}
      {/* Say so, rather than letting a greyed-out badge read as a broken link. */}
      {!live && <p className="lp-stores__note">iOS and Android · launching in Hyderabad shortly</p>}
    </div>
  );
}
