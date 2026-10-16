/**
 * Public, chrome-free "page not found" — shown for any address that is neither a public page nor an
 * operator route (see App.jsx). It reveals nothing about the console; it just sends people home.
 *
 * Self-contained on purpose: its own background, its own scoped styles (nf-*), its own animation, so
 * it reads as a designed page rather than a bare error. On-brand with the Fooducia produce theme —
 * a basket of veg drifts up past an oversized 404, and the middle "0" is a ripe tomato that bobs.
 */
import { PIECES } from './Produce.jsx';

const CSS = `
  .nf-root {
    position: fixed; inset: 0; overflow: hidden;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 22px; text-align: center; padding: 24px;
    background:
      radial-gradient(1200px 600px at 50% -10%, #13311f 0%, rgba(19,49,31,0) 60%),
      linear-gradient(180deg, #0b1a12 0%, #0a140e 100%);
    color: #eef4ec;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  /* faint grid, like the sign-in */
  .nf-root::before {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background-image:
      linear-gradient(rgba(140,210,160,0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(140,210,160,0.05) 1px, transparent 1px);
    background-size: 46px 46px;
    mask-image: radial-gradient(900px 500px at 50% 42%, #000 0%, transparent 75%);
    -webkit-mask-image: radial-gradient(900px 500px at 50% 42%, #000 0%, transparent 75%);
  }
  .nf-stack { position: relative; z-index: 2; display: flex; flex-direction: column;
    align-items: center; gap: 20px; }

  .nf-404 { display: flex; align-items: center; gap: 10px; line-height: 1;
    font-weight: 800; font-size: clamp(90px, 22vw, 190px); letter-spacing: -6px;
    color: #f2f7f0; filter: drop-shadow(0 18px 40px rgba(0,0,0,0.45)); }
  .nf-404 .d { animation: nf-bob 3.2s ease-in-out infinite; }
  .nf-404 .d:nth-child(1) { animation-delay: 0s; }
  .nf-404 .d:nth-child(3) { animation-delay: .5s; }

  /* the tomato standing in for the middle zero */
  .nf-tomato { width: clamp(84px,20vw,168px); height: clamp(84px,20vw,168px);
    animation: nf-bob 2.6s ease-in-out infinite .25s; }

  .nf-eye { animation: nf-blink 4.5s infinite; transform-origin: center; }

  .nf-title { margin: 0; font-size: clamp(20px, 4vw, 28px); font-weight: 700;
    letter-spacing: -0.3px; }
  .nf-sub { margin: 0; max-width: 420px; color: #9fb6a6; font-size: 14.5px; line-height: 1.55; }
  .nf-code { font-family: ui-monospace, Menlo, Consolas, monospace; color: #7f9a88; }

  .nf-btn { margin-top: 6px; display: inline-flex; align-items: center; gap: 8px;
    background: #c3e84b; color: #11210a; text-decoration: none; font-weight: 700; font-size: 15px;
    padding: 12px 22px; border-radius: 999px; transition: transform .15s ease, box-shadow .15s ease;
    box-shadow: 0 10px 28px rgba(195,232,75,0.28); }
  .nf-btn:hover { transform: translateY(-2px); box-shadow: 0 14px 34px rgba(195,232,75,0.38); }

  /* produce drifting up through the scene */
  .nf-float { position: absolute; bottom: -80px; z-index: 1; opacity: 0;
    filter: drop-shadow(0 8px 14px rgba(0,0,0,0.4));
    animation: nf-rise linear infinite; }
  .nf-float svg { width: 100%; height: 100%; display: block; }

  @keyframes nf-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
  @keyframes nf-blink { 0%,92%,100% { transform: scaleY(1) } 96% { transform: scaleY(0.1) } }
  @keyframes nf-rise {
    0%   { transform: translateY(0) rotate(0deg) scale(.9); opacity: 0; }
    12%  { opacity: .9; }
    85%  { opacity: .9; }
    100% { transform: translateY(-112vh) rotate(220deg) scale(1.05); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .nf-404 .d, .nf-tomato, .nf-eye, .nf-float { animation: none; }
    .nf-float { display: none; }
  }
`;

// produce key, horizontal position (%), size (px), duration (s), delay (s)
const FLOATERS = [
  ['tomato', 8, 54, 15, 0],
  ['carrot', 18, 46, 19, 3],
  ['broccoli', 30, 58, 17, 6],
  ['lemon', 44, 50, 21, 1.5],
  ['leaf', 58, 52, 16, 4.5],
  ['onion', 70, 48, 20, 2.5],
  ['chili', 82, 52, 18, 7],
  ['garlic', 92, 48, 22, 5],
];

function Tomato() {
  return (
    <svg className="nf-tomato" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="68" r="44" fill="#e4512b" />
      <circle cx="60" cy="68" r="44" fill="url(#nf-shine)" />
      <path
        d="M60 26c6-10 16-12 22-10-2 7-6 12-13 14 8-2 15 0 20 5-6 5-13 6-20 3 5 4 8 10 8 17-7-2-12-7-14-14-2 7-7 12-14 14 0-7 3-13 8-17-7 3-14 2-20-3 5-5 12-7 20-5-7-2-11-7-13-14 6-2 16 0 22 10z"
        fill="#3e9b4f"
      />
      <circle className="nf-eye" cx="47" cy="66" r="6" fill="#20130f" />
      <circle className="nf-eye" cx="73" cy="66" r="6" fill="#20130f" />
      <circle cx="49" cy="64" r="2" fill="#fff" />
      <circle cx="75" cy="64" r="2" fill="#fff" />
      <path
        d="M50 82q10 9 20 0"
        stroke="#20130f"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <defs>
        <radialGradient id="nf-shine" cx="38%" cy="32%" r="60%">
          <stop offset="0%" stopColor="#ff8a5c" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#ff8a5c" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function NotFound() {
  return (
    <div className="nf-root">
      <style>{CSS}</style>
      {FLOATERS.map(([k, left, size, dur, delay], i) => {
        const Piece = PIECES[k];
        return (
          <span
            key={i}
            className="nf-float"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              animationDuration: `${dur}s`,
              animationDelay: `${delay}s`,
            }}
            aria-hidden="true"
          >
            <Piece />
          </span>
        );
      })}
      <div className="nf-stack">
        <div className="nf-404" aria-hidden="true">
          <span className="d">4</span>
          <Tomato />
          <span className="d">4</span>
        </div>
        <h1 className="nf-title">This page went off the farm</h1>
        <p className="nf-sub">
          We couldn’t find <span className="nf-code">{window.location.pathname}</span>. It may have
          been moved, or it never grew here.
        </p>
        <a className="nf-btn" href="/">
          🌿 Back to fooducia.health
        </a>
      </div>
    </div>
  );
}
