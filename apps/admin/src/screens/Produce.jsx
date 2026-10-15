/**
 * Hand-illustrated produce as scalable SVG — the site's visual signature.
 *
 * These are drawn for VOLUME: each piece has a radial body gradient lit from the upper-left, a
 * specular highlight, a contact shadow and real surface detail (dimples, ridges, seeds, veins) so it
 * reads as a glossy 3D object rather than a flat sticker. No watermarks, no licensing, crisp at any
 * size, and — being real DOM — they float, spin and get thrown around the page.
 *
 * Every piece draws inside a 0 0 100 100 box so they compose at one scale. <ProduceLayer> scatters a
 * float field behind a section; <ProduceBurst> flings a handful out from a point (the hero).
 */

/* Shared contact shadow under a piece. */
const Shadow = ({ cx = 50, cy = 90, rx = 30, ry = 5 }) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="rgba(12,24,16,0.16)" />
);

export function Tomato() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="tm-b" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#ff7446" />
          <stop offset="46%" stopColor="#ec4a24" />
          <stop offset="100%" stopColor="#b22f14" />
        </radialGradient>
        <linearGradient id="tm-leaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#57b65f" />
          <stop offset="100%" stopColor="#2f7d3c" />
        </linearGradient>
      </defs>
      <Shadow cy={92} rx={30} ry={5} />
      <path
        d="M50 24c20 0 36 14 36 34 0 20-16 34-36 34S14 78 14 58c0-20 16-34 36-34z"
        fill="url(#tm-b)"
      />
      {/* lobes */}
      <path
        d="M34 34c-6 12-7 32 2 46"
        stroke="#b83a1b"
        strokeWidth="2"
        fill="none"
        opacity="0.35"
      />
      <path d="M66 34c6 12 7 32-2 46" stroke="#b83a1b" strokeWidth="2" fill="none" opacity="0.35" />
      {/* calyx */}
      <g fill="url(#tm-leaf)">
        <path d="M50 20c5-9 14-11 20-9-2 7-6 11-13 12 8-1 14 1 18 6-5 4-12 6-18 2 5 4 7 9 7 16-7-2-12-7-14-14-2 7-7 12-14 14 0-7 2-12 7-16-6 4-13 2-18-2 4-5 10-7 18-6-7-1-11-5-13-12 6-2 15 0 20 9z" />
      </g>
      <circle cx="50" cy="26" r="3" fill="#2f7d3c" />
      {/* gloss */}
      <ellipse
        cx="38"
        cy="44"
        rx="10"
        ry="14"
        fill="#fff"
        opacity="0.4"
        transform="rotate(-18 38 44)"
      />
      <circle cx="62" cy="40" r="3" fill="#fff" opacity="0.5" />
    </svg>
  );
}

export function Lemon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="lm-b" cx="34%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#fff39b" />
          <stop offset="50%" stopColor="#f6cf1f" />
          <stop offset="100%" stopColor="#d49a06" />
        </radialGradient>
      </defs>
      <Shadow cy={88} rx={30} ry={5} />
      <g transform="rotate(-22 50 54)">
        <ellipse cx="50" cy="54" rx="40" ry="28" fill="url(#lm-b)" />
        {/* nubs */}
        <circle cx="90" cy="54" r="5" fill="#e8bb10" />
        <circle cx="10" cy="54" r="4" fill="#e8bb10" />
        {/* dimple texture */}
        <g fill="#d9a40a" opacity="0.4">
          {Array.from({ length: 26 }).map((_, i) => {
            const a = (i * 137.5 * Math.PI) / 180;
            const r = 6 + (i % 7) * 4;
            return (
              <circle key={i} cx={50 + Math.cos(a) * r * 1.3} cy={54 + Math.sin(a) * r} r="0.9" />
            );
          })}
        </g>
        <ellipse cx="36" cy="44" rx="12" ry="6" fill="#fff" opacity="0.45" />
      </g>
      <path d="M78 30c4-5 10-6 13-4-1 5-5 8-10 8z" fill="#4f9b4a" />
    </svg>
  );
}

export function Chili() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="ch-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff5a46" />
          <stop offset="45%" stopColor="#e11f1f" />
          <stop offset="100%" stopColor="#a30f14" />
        </linearGradient>
        <linearGradient id="ch-s" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5fc05f" />
          <stop offset="100%" stopColor="#2f7d3c" />
        </linearGradient>
      </defs>
      <Shadow cx={54} cy={88} rx={26} ry={4} />
      <path
        d="M24 30c7-3 12 3 15 9 7 14 22 30 44 35 6 1 7 9-1 10-32 3-55-20-63-42-3-8-2-10 5-12z"
        fill="url(#ch-b)"
      />
      <path
        d="M30 34c5 14 18 32 42 42"
        stroke="#fff"
        strokeWidth="3"
        fill="none"
        opacity="0.3"
        strokeLinecap="round"
      />
      <path d="M22 31c-4-6-3-13 3-17 2 5 5 8 9 7-2 6-7 10-12 10z" fill="url(#ch-s)" />
    </svg>
  );
}

export function Carrot() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="cr-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffa94d" />
          <stop offset="45%" stopColor="#f07d12" />
          <stop offset="100%" stopColor="#c85a08" />
        </linearGradient>
        <linearGradient id="cr-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6fc24a" />
          <stop offset="100%" stopColor="#3b8f36" />
        </linearGradient>
      </defs>
      <Shadow cx={48} cy={90} rx={24} ry={4} />
      <g stroke="url(#cr-g)" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M30 32C24 16 22 8 20 4" />
        <path d="M38 30C36 12 36 6 36 2" />
        <path d="M46 31C50 16 54 10 60 6" />
      </g>
      <path d="M28 32c14-9 30-7 40 3L50 88c-3 7-10 7-13 0z" fill="url(#cr-b)" />
      <g stroke="#b85208" strokeWidth="2" strokeLinecap="round" opacity="0.5">
        <path d="M34 42h26" />
        <path d="M35 54h22" />
        <path d="M38 66h15" />
        <path d="M41 76h8" />
      </g>
      <path
        d="M32 36c10-6 22-5 30 2"
        stroke="#fff"
        strokeWidth="2.5"
        fill="none"
        opacity="0.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Broccoli() {
  const florets = [
    [34, 36, 15, '#2b8347'],
    [66, 36, 15, '#2b8347'],
    [50, 26, 17, '#36a054'],
    [26, 46, 12, '#246e3c'],
    [74, 46, 12, '#246e3c'],
    [50, 44, 15, '#2f8f4e'],
  ];
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="br-st" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dff0c2" />
          <stop offset="100%" stopColor="#bcd99a" />
        </linearGradient>
      </defs>
      <Shadow cy={90} rx={24} ry={4} />
      <path d="M40 52h20l-2 30c-1 7-15 7-16 0z" fill="url(#br-st)" />
      <path d="M44 54v26M52 54v26" stroke="#aecb8a" strokeWidth="1.6" opacity="0.7" />
      {florets.map(([x, y, r, c], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={c} />
      ))}
      {/* bumpy tops */}
      <g>
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i * 137.5 * Math.PI) / 180;
          const rr = 4 + (i % 9) * 3.4;
          const x = 50 + Math.cos(a) * rr * 1.5;
          const y = 36 + Math.sin(a) * rr * 0.95;
          if (y > 56) return null;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={1.9}
              fill={i % 3 ? '#49bf6c' : '#58d07a'}
              opacity="0.9"
            />
          );
        })}
      </g>
    </svg>
  );
}

export function Onion() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="on-b" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#cf6ea0" />
          <stop offset="52%" stopColor="#a63f78" />
          <stop offset="100%" stopColor="#6f2a55" />
        </radialGradient>
      </defs>
      <Shadow cy={90} rx={26} ry={4} />
      <path
        d="M50 22c17 0 30 17 30 36 0 17-13 26-30 26S20 75 20 58c0-19 13-36 30-36z"
        fill="url(#on-b)"
      />
      <path
        d="M50 24v58M39 28c-6 16-6 38 1 54M61 28c6 16 6 38-1 54M30 38c-4 12-4 30 1 42M70 38c4 12 4 30-1 42"
        stroke="#5e2447"
        strokeWidth="1.6"
        fill="none"
        opacity="0.45"
      />
      <path
        d="M44 23c-3-6-2-13 3-16 5 3 7 10 4 16M50 8c1-4 4-6 7-6-1 5-4 7-7 7"
        stroke="#8e7a4a"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse
        cx="40"
        cy="42"
        rx="7"
        ry="12"
        fill="#fff"
        opacity="0.28"
        transform="rotate(-14 40 42)"
      />
    </svg>
  );
}

export function Leaf() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="lf-b" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#2f8f46" />
          <stop offset="100%" stopColor="#6fd072" />
        </linearGradient>
      </defs>
      <Shadow cx={52} cy={90} rx={24} ry={4} />
      <path d="M18 82C18 42 46 16 84 16c4 38-18 66-60 66-2 0-4 0-6-0z" fill="url(#lf-b)" />
      <path
        d="M24 76C40 50 60 34 82 24"
        stroke="#1f6f36"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
      />
      <g stroke="#2a8040" strokeWidth="1.6" strokeLinecap="round" opacity="0.7">
        <path d="M44 62l-14 4" />
        <path d="M54 50l-14 1" />
        <path d="M64 40l-13-2" />
        <path d="M36 70l-10 4" />
      </g>
      <path
        d="M34 66C48 46 64 32 80 24"
        stroke="#bff0b8"
        strokeWidth="2"
        fill="none"
        opacity="0.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Banana() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="ba-b" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#ffe873" />
          <stop offset="55%" stopColor="#f2cc2b" />
          <stop offset="100%" stopColor="#cfa016" />
        </linearGradient>
      </defs>
      <Shadow cx={52} cy={86} rx={30} ry={4} />
      <path
        d="M16 32c2 32 26 52 60 50 9-1 11-9 4-12-28-4-43-22-47-45-2-9-13-6-17 7z"
        fill="url(#ba-b)"
      />
      <path
        d="M22 34c3 26 24 44 52 46"
        stroke="#fff"
        strokeWidth="2.4"
        fill="none"
        opacity="0.35"
        strokeLinecap="round"
      />
      <path
        d="M74 82c6-1 9-6 4-9"
        stroke="#8a6a12"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M20 30c-3-5-1-9 3-10"
        stroke="#5a4a10"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M30 70c8 5 18 8 30 8"
        stroke="#c9a21e"
        strokeWidth="2"
        fill="none"
        opacity="0.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Mint() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="mt-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#58cf72" />
          <stop offset="100%" stopColor="#2f9a4e" />
        </linearGradient>
      </defs>
      <Shadow cy={90} rx={20} ry={4} />
      <path d="M50 88V44" stroke="#4a9a46" strokeWidth="3.4" strokeLinecap="round" />
      {[
        'M50 52C33 52 25 41 25 26c17 0 25 11 25 26z',
        'M50 52C67 52 75 41 75 26c-17 0-25 11-25 26z',
        'M50 36C37 34 31 25 31 12c14 1 20 11 19 24z',
        'M50 36C63 34 69 25 69 12c-14 1-20 11-19 24z',
      ].map((d, i) => (
        <path key={i} d={d} fill="url(#mt-a)" />
      ))}
      <path d="M50 30c-6-2-10-9-10-18 8 1 11 8 10 18z" fill="#64dd7f" />
      <g stroke="#1f7a3a" strokeWidth="1.2" opacity="0.55" fill="none">
        <path d="M38 38c6 3 10 8 12 12" />
        <path d="M62 38c-6 3-10 8-12 12" />
      </g>
    </svg>
  );
}

export function Garlic() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="ga-b" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#f1e9db" />
          <stop offset="100%" stopColor="#d8cbb4" />
        </radialGradient>
      </defs>
      <Shadow cy={90} rx={24} ry={4} />
      <path
        d="M50 26c15 0 25 18 25 36 0 15-10 24-25 24S25 77 25 62c0-18 10-36 25-36z"
        fill="url(#ga-b)"
      />
      <path
        d="M50 28v56M38 32c-5 16-5 36 0 50M62 32c5 16 5 36 0 50M31 42c-3 12-3 28 1 38M69 42c3 12 3 28-1 38"
        stroke="#cdc0a8"
        strokeWidth="1.5"
        fill="none"
        opacity="0.8"
      />
      <path d="M50 26c-3-6-2-13 3-16 5 3 6 10 3 16" fill="#efe8da" />
      <ellipse
        cx="40"
        cy="44"
        rx="6"
        ry="12"
        fill="#fff"
        opacity="0.5"
        transform="rotate(-12 40 44)"
      />
    </svg>
  );
}

export function Ginger() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="gi-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#edd3a0" />
          <stop offset="55%" stopColor="#d2ab6a" />
          <stop offset="100%" stopColor="#a87d42" />
        </linearGradient>
      </defs>
      <Shadow cy={88} rx={28} ry={4} />
      <path
        d="M30 46c-10-4-16-16-8-24 6-6 16-2 20 6 3-10 15-14 22-8 7 6 4 16-3 20 10 1 18 10 14 20-3 8-14 9-21 3-1 10-12 16-21 10-8-6-7-18 2-22-2 0-4-2-5-5z"
        fill="url(#gi-b)"
      />
      <g stroke="#9a6f38" strokeWidth="1.6" fill="none" opacity="0.55">
        <path d="M34 40c6 4 10 10 12 16" />
        <path d="M58 34c2 8 2 16-1 22" />
        <path d="M64 58c-6 2-13 2-19-1" />
      </g>
      <g fill="#c79a5a">
        <circle cx="30" cy="44" r="2.4" />
        <circle cx="70" cy="48" r="2.4" />
        <circle cx="46" cy="72" r="2.4" />
      </g>
      <ellipse cx="44" cy="40" rx="6" ry="4" fill="#fff" opacity="0.3" />
    </svg>
  );
}

export function Capsicum() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="cp-b" cx="36%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#8fe06a" />
          <stop offset="48%" stopColor="#43b23f" />
          <stop offset="100%" stopColor="#237a2c" />
        </radialGradient>
      </defs>
      <Shadow cy={90} rx={28} ry={5} />
      <path
        d="M30 36c-6-4-4-12 2-13 5-1 8 3 9 7 2-6 9-6 11 0 1-4 5-8 10-7 6 1 8 9 2 13 8 2 14 11 14 24 0 18-13 28-28 28S22 78 22 60c0-13 6-22 8-24z"
        fill="url(#cp-b)"
      />
      <path
        d="M36 44c-3 14-3 30 2 42M64 44c3 14 3 30-2 42M50 42v46"
        stroke="#1f6e2a"
        strokeWidth="2"
        fill="none"
        opacity="0.4"
      />
      <path d="M48 23c0-6 3-10 7-11 1 5-1 10-5 12l6 2c-3 2-6 2-8-3z" fill="#3b8f36" />
      <ellipse
        cx="38"
        cy="48"
        rx="7"
        ry="13"
        fill="#fff"
        opacity="0.3"
        transform="rotate(-12 38 48)"
      />
    </svg>
  );
}

export function Brinjal() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="bj-b" cx="36%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#9b5fd0" />
          <stop offset="50%" stopColor="#5f2e94" />
          <stop offset="100%" stopColor="#36175a" />
        </radialGradient>
        <linearGradient id="bj-c" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6fc24a" />
          <stop offset="100%" stopColor="#3b8f36" />
        </linearGradient>
      </defs>
      <Shadow cx={54} cy={90} rx={26} ry={5} />
      <path
        d="M40 34c14-8 34-4 42 12 9 18-2 40-22 44-20 4-38-8-40-26-2-16 8-26 20-30z"
        fill="url(#bj-b)"
      />
      <g fill="url(#bj-c)">
        <path d="M40 34c-6-6-6-14-2-20 4 3 6 7 6 12 3-5 8-8 14-7-2 6-7 10-13 11 4 2 6 5 5 9-4-1-8-3-10-5z" />
      </g>
      <path d="M44 28c-2-6-1-12 3-16 2 5 2 11-3 16z" fill="#2f7d3c" />
      <ellipse
        cx="46"
        cy="48"
        rx="9"
        ry="16"
        fill="#fff"
        opacity="0.22"
        transform="rotate(-24 46 48)"
      />
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
  ginger: Ginger,
  capsicum: Capsicum,
  brinjal: Brinjal,
};

const ALL_KEYS = Object.keys(PIECES);

/**
 * Decorative, non-interactive produce that floats behind a section. Motion lives in landing.css
 * (position/size/drift/duration come through CSS custom props) and respects prefers-reduced-motion.
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
            }}
          >
            <Piece />
          </span>
        );
      })}
    </div>
  );
}

/**
 * Scatter a whole section with produce automatically — a quick way to flood a band without hand
 * placing each one. `n` pieces are spread across the width, alternating sides, sizes and species.
 */
export function ProduceScatter({
  n = 6,
  seed = 0,
  opacity = 0.5,
  size = [40, 64],
  className = '',
}) {
  const items = Array.from({ length: n }).map((_, i) => {
    const r = (seed * 97 + i * 53) % 100;
    const left = i % 2 ? 90 - (r % 10) : 2 + (r % 10);
    return {
      k: ALL_KEYS[(seed + i * 3) % ALL_KEYS.length],
      x: left,
      y: 6 + ((i * 31 + seed * 17) % 82),
      s: size[0] + ((r * 7) % (size[1] - size[0])),
      r: (r % 60) - 30,
      d: 9 + (r % 7),
      drift: 16 + (r % 12),
      o: opacity,
      delay: (i % 5) * 0.4,
    };
  });
  return <ProduceLayer items={items} className={className} />;
}

/* ---- hero burst --------------------------------------------------------------- */
const BURST = [
  { k: 'tomato', x: -14, y: 8, s: 84, fx: 120, fy: 120, r: -18, d: 8 },
  { k: 'lemon', x: 86, y: 2, s: 72, fx: -90, fy: 140, r: 16, d: 9 },
  { k: 'chili', x: 94, y: 56, s: 78, fx: -120, fy: -40, r: 24, d: 10 },
  { k: 'broccoli', x: -10, y: 60, s: 78, fx: 130, fy: -30, r: -14, d: 9 },
  { k: 'carrot', x: 78, y: 88, s: 66, fx: -60, fy: -120, r: 20, d: 11 },
  { k: 'ginger', x: 8, y: 92, s: 64, fx: 80, fy: -110, r: -22, d: 8.5 },
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
