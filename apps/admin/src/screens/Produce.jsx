/**
 * Hand-drawn produce, as scalable SVG — the public site's visual signature.
 *
 * Why not the photos? The supplied produce PNGs were watermarked stock previews; shipping those
 * would look cheap and isn't licensed. These vectors cost nothing to load, stay crisp at any size,
 * tint to the brand, and — being real DOM — can be floated, spun and thrown around the page.
 *
 * Each piece is a tiny component drawing inside a 0 0 100 100 box, so they all compose at the same
 * scale. <ProduceLayer> scatters them as a parallax/float field behind a section; <ProduceBurst>
 * throws a handful out from a point (used in the hero) and lets them settle into a gentle bob.
 */

/* ---- individual pieces (viewBox 0 0 100 100) ---------------------------------- */

export function Tomato() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="50" cy="78" rx="30" ry="6" fill="rgba(0,0,0,0.10)" />
      <circle cx="50" cy="56" r="34" fill="#e4512b" />
      <circle cx="50" cy="56" r="34" fill="url(#pr-tom-sh)" />
      <path
        d="M50 20c5-8 13-10 18-8-2 6-5 10-11 11 7-1 12 1 16 5-5 4-11 5-16 2 4 3 6 8 6 14-6-2-10-6-12-12-2 6-6 10-12 12 0-6 2-11 6-14-5 3-11 2-16-2 4-4 9-6 16-5-6-1-9-5-11-11 5-2 13 0 18 8z"
        fill="#3e9b4f"
      />
      <ellipse cx="40" cy="48" rx="7" ry="9" fill="#fff" opacity="0.35" />
      <defs>
        <radialGradient id="pr-tom-sh" cx="38%" cy="34%" r="62%">
          <stop offset="0%" stopColor="#ff9068" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#ff9068" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function Lemon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="52" cy="80" rx="28" ry="5" fill="rgba(0,0,0,0.10)" />
      <ellipse cx="50" cy="55" rx="36" ry="27" transform="rotate(-24 50 55)" fill="#f6d222" />
      <ellipse
        cx="50"
        cy="55"
        rx="36"
        ry="27"
        transform="rotate(-24 50 55)"
        fill="url(#pr-lem-sh)"
      />
      <circle cx="83" cy="33" r="4" fill="#f6d222" />
      <path d="M79 31c3-5 8-6 11-5-1 4-4 7-8 7z" fill="#5aa05a" />
      <ellipse
        cx="36"
        cy="46"
        rx="9"
        ry="5"
        transform="rotate(-24 36 46)"
        fill="#fff"
        opacity="0.4"
      />
      <defs>
        <radialGradient id="pr-lem-sh" cx="34%" cy="32%" r="60%">
          <stop offset="0%" stopColor="#fff3a8" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#fff3a8" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function Chili() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M22 30c6-3 11 2 14 8 6 12 20 28 42 34 5 1 6 8 0 9-30 4-52-18-60-38-3-7-2-11 4-13z"
        fill="#e02c2c"
      />
      <path
        d="M22 30c6-3 11 2 14 8 6 12 20 28 42 34 5 1 6 8 0 9-30 4-52-18-60-38-3-7-2-11 4-13z"
        fill="url(#pr-chi-sh)"
      />
      <path d="M20 31c-4-5-3-12 2-16 2 5 5 7 9 6-2 5-6 9-11 10z" fill="#4aa24a" />
      <defs>
        <linearGradient id="pr-chi-sh" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff7a6b" stopOpacity="0.7" />
          <stop offset="55%" stopColor="#ff7a6b" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Carrot() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M28 30l12-14M38 28l6-18M46 30l14-12"
        stroke="#4aa24a"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M30 34c14-8 28-6 36 2L46 84c-3 6-9 6-12 0z" fill="#ef7a1a" />
      <path d="M30 34c14-8 28-6 36 2L46 84c-3 6-9 6-12 0z" fill="url(#pr-car-sh)" />
      <path
        d="M40 44h18M38 56h16M40 68h10"
        stroke="#c45f10"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      <defs>
        <linearGradient id="pr-car-sh" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffb160" stopOpacity="0.8" />
          <stop offset="60%" stopColor="#ffb160" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Broccoli() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M42 54h16l-3 28c-1 6-9 6-10 0z" fill="#cfe8b0" />
      <circle cx="34" cy="42" r="16" fill="#2f8f4e" />
      <circle cx="66" cy="42" r="16" fill="#2f8f4e" />
      <circle cx="50" cy="30" r="18" fill="#37a559" />
      <circle cx="50" cy="46" r="15" fill="#2f8f4e" />
      <g fill="#49bf6c" opacity="0.8">
        <circle cx="44" cy="26" r="4" />
        <circle cx="56" cy="27" r="4" />
        <circle cx="50" cy="20" r="4" />
        <circle cx="31" cy="40" r="4" />
        <circle cx="67" cy="40" r="4" />
        <circle cx="50" cy="42" r="4" />
      </g>
    </svg>
  );
}

export function Onion() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="50" cy="82" rx="26" ry="5" fill="rgba(0,0,0,0.10)" />
      <path
        d="M50 24c16 0 28 16 28 34 0 16-12 24-28 24s-28-8-28-24c0-18 12-34 28-34z"
        fill="#b0497e"
      />
      <path
        d="M50 24c16 0 28 16 28 34 0 16-12 24-28 24s-28-8-28-24c0-18 12-34 28-34z"
        fill="url(#pr-oni-sh)"
      />
      <path
        d="M50 26c0 18 0 40 0 56M38 30c-4 16-4 36 2 52M62 30c4 16 4 36-2 52"
        stroke="#7d2f59"
        strokeWidth="2"
        fill="none"
        opacity="0.5"
      />
      <path
        d="M46 24c-2-6 0-10 4-12 4 2 6 6 4 12M50 14c0-4 3-7 6-7-1 5-3 7-6 7"
        stroke="#6aa84f"
        strokeWidth="3.4"
        fill="none"
        strokeLinecap="round"
      />
      <defs>
        <radialGradient id="pr-oni-sh" cx="38%" cy="34%" r="62%">
          <stop offset="0%" stopColor="#d884ad" stopOpacity="0.8" />
          <stop offset="60%" stopColor="#d884ad" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function Leaf() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M20 80C20 40 48 20 82 20c4 34-16 62-56 62-2 0-4 0-6-2z" fill="#3ba35a" />
      <path d="M20 80C20 40 48 20 82 20c4 34-16 62-56 62-2 0-4 0-6-2z" fill="url(#pr-leaf-sh)" />
      <path
        d="M26 74C40 52 58 38 78 30"
        stroke="#2b7d44"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M40 62l-10 2M52 50l-12 0M64 40l-12-2"
        stroke="#2b7d44"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.7"
      />
      <defs>
        <linearGradient id="pr-leaf-sh" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#8ee89f" stopOpacity="0" />
          <stop offset="100%" stopColor="#8ee89f" stopOpacity="0.7" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Banana() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M18 34c2 30 24 50 56 48 8-1 10-8 4-11-26-4-40-20-44-42-2-8-12-5-16 5z"
        fill="#f4cf2e"
      />
      <path
        d="M18 34c2 30 24 50 56 48 8-1 10-8 4-11-26-4-40-20-44-42-2-8-12-5-16 5z"
        fill="url(#pr-ban-sh)"
      />
      <path d="M74 82c6-1 8-6 4-9" stroke="#c9a21e" strokeWidth="2" fill="none" />
      <path
        d="M22 30c-2-4-1-8 3-9"
        stroke="#6b5e12"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <defs>
        <linearGradient id="pr-ban-sh" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fde98a" stopOpacity="0.8" />
          <stop offset="55%" stopColor="#fde98a" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Mint() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 86V46" stroke="#5aa050" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M50 52C34 52 26 42 26 28c16 0 24 10 24 24z" fill="#45b05f" />
      <path d="M50 52C66 52 74 42 74 28c-16 0-24 10-24 24z" fill="#3a9a51" />
      <path d="M50 38C38 36 32 28 32 16c13 1 19 10 18 22z" fill="#4dbc68" />
      <path d="M50 38C62 36 68 28 68 16c-13 1-19 10-18 22z" fill="#43a85b" />
      <path d="M50 30c-6-2-9-8-9-16 7 1 10 7 9 16z" fill="#58c974" />
    </svg>
  );
}

export function Garlic() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="50" cy="82" rx="24" ry="5" fill="rgba(0,0,0,0.10)" />
      <path
        d="M50 26c14 0 24 18 24 34 0 14-10 22-24 22s-24-8-24-22c0-16 10-34 24-34z"
        fill="#f2ece2"
      />
      <path
        d="M50 26c14 0 24 18 24 34 0 14-10 22-24 22s-24-8-24-22c0-16 10-34 24-34z"
        fill="url(#pr-gar-sh)"
      />
      <path
        d="M50 28v54M36 34c-5 14-5 34 0 48M64 34c5 14 5 34 0 48"
        stroke="#d8cdb8"
        strokeWidth="2"
        fill="none"
      />
      <path d="M50 26c-3-6-2-12 2-16 4 4 5 10 2 16" fill="#efe8da" />
      <defs>
        <radialGradient id="pr-gar-sh" cx="38%" cy="32%" r="62%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** The full set, keyed, so layers can pick by name. */
export const PIECES = {
  tomato: Tomato,
  lemon: Lemon,
  chili: Chili,
  carrot: Carrot,
  broccoli: Broccoli,
  onion: Onion,
  leaf: Leaf,
  banana: Banana,
  mint: Mint,
  garlic: Garlic,
};

/* ---- ambient scatter field ---------------------------------------------------- */
/**
 * A decorative, non-interactive layer of produce that floats behind a section. Each item carries
 * CSS custom props the stylesheet reads (position, size, drift distance, duration), so the motion
 * lives in landing.css and respects prefers-reduced-motion there.
 */
export function ProduceLayer({ items = [], className = '' }) {
  return (
    <div className={`pr-layer ${className}`} aria-hidden="true">
      {items.map((it, i) => {
        const Piece = PIECES[it.k];
        if (!Piece) return null;
        return (
          <span
            key={i}
            className="pr-float"
            style={{
              left: `${it.x}%`,
              top: `${it.y}%`,
              width: `${it.s}px`,
              height: `${it.s}px`,
              opacity: it.o ?? 0.9,
              '--pr-dur': `${it.d ?? 9}s`,
              '--pr-delay': `${it.delay ?? 0}s`,
              '--pr-rot': `${it.r ?? 0}deg`,
              '--pr-drift': `${it.drift ?? 16}px`,
              '--pr-par': it.par ?? 0.04,
            }}
          >
            <Piece />
          </span>
        );
      })}
    </div>
  );
}

/* ---- hero burst --------------------------------------------------------------- */
/**
 * A handful of produce "thrown" out from behind the phone on load, each flying to its resting spot
 * and then bobbing. The fly-in is a CSS keyframe keyed off --pr-fx/--pr-fy (where it starts) and the
 * final left/top (where it lands). Purely decorative.
 */
const BURST = [
  { k: 'tomato', x: -14, y: 8, s: 76, fx: 120, fy: 120, r: -18, d: 8 },
  { k: 'lemon', x: 86, y: 2, s: 66, fx: -90, fy: 140, r: 16, d: 9 },
  { k: 'chili', x: 94, y: 58, s: 72, fx: -120, fy: -40, r: 24, d: 10 },
  { k: 'broccoli', x: -10, y: 62, s: 70, fx: 130, fy: -30, r: -14, d: 9 },
  { k: 'carrot', x: 78, y: 86, s: 60, fx: -60, fy: -120, r: 20, d: 11 },
  { k: 'mint', x: 8, y: 92, s: 54, fx: 80, fy: -110, r: -22, d: 8.5 },
];

export function ProduceBurst() {
  return (
    <div className="pr-burst" aria-hidden="true">
      {BURST.map((it, i) => {
        const Piece = PIECES[it.k];
        return (
          <span
            key={i}
            className="pr-burst__item"
            style={{
              left: `${it.x}%`,
              top: `${it.y}%`,
              width: `${it.s}px`,
              height: `${it.s}px`,
              '--pr-fx': `${it.fx}px`,
              '--pr-fy': `${it.fy}px`,
              '--pr-rot': `${it.r}deg`,
              '--pr-dur': `${it.d}s`,
              '--pr-delay': `${0.15 + i * 0.08}s`,
            }}
          >
            <Piece />
          </span>
        );
      })}
    </div>
  );
}
