import React, { useId } from 'react';
import { Img } from 'remotion';
import { C } from '../brand';
import leaves from '../assets/leaves.json';
import leafTop from '../assets/leaf-top.png';
import leafMid from '../assets/leaf-mid.png';
import leafEmber from '../assets/leaf-ember.png';

const LEAVES = [
  { ...leaves.top, src: leafTop },
  { ...leaves.mid, src: leafMid },
  { ...leaves.ember, src: leafEmber },
];

type LeafMarkProps = {
  /** Side of the square the mark is drawn in (the mark itself fills ~65% × 89% of it). */
  readonly size: number;
  /** Grow-in progress per leaf: top, middle, ember. 0 = folded away, 1 = in place. */
  readonly p?: readonly [number, number, number] | number;
  /** Idle sway in degrees — each leaf moves a little differently. */
  readonly sway?: number;
  readonly style?: React.CSSProperties;
};

/** The official three-leaf mark, with each leaf unfurling from its stem end. */
export const LeafMark: React.FC<LeafMarkProps> = ({ size, p = 1, sway = 0, style }) => {
  const k = size / 1000;
  return (
    <div style={{ position: 'relative', width: size, height: size, ...style }}>
      {LEAVES.map((leaf, i) => {
        const pi = typeof p === 'number' ? p : p[i];
        const grown = Math.max(0, pi);
        return (
          <Img
            key={leaf.file}
            src={leaf.src}
            style={{
              position: 'absolute',
              left: leaf.x * k,
              top: leaf.y * k,
              width: leaf.w * k,
              height: leaf.h * k,
              transformOrigin: '2% 98%',
              transform: `rotate(${(1 - grown) * -62 + sway * (i === 0 ? 1 : i === 1 ? -0.7 : 1.4)}deg) scale(${grown})`,
              opacity: Math.min(1, grown * 4),
            }}
          />
        );
      })}
    </div>
  );
};

// Wordmark paths, straight from the official SVG (Fooducia_Logo_01-02.svg), grouped per letter.
const INK_PATHS = {
  f: 'M174,423.51A20.08,20.08,0,0,1,154,443.57h-31a24.55,24.55,0,0,0-24.56,24.56v2.95H119.7a18.59,18.59,0,1,1,0,37.17H98.38v65.23c0,12.32-9.64,22.88-21.94,23.13a22.38,22.38,0,0,1-22.79-22.38v-66h-9.6a18.59,18.59,0,1,1,0-37.17h9.6v-4.53a63.15,63.15,0,0,1,63.27-63.16l37,.06A20,20,0,0,1,174,423.51Z',
  d: 'M518.88,422.66A21,21,0,0,0,483,437.53v28.32a67.83,67.83,0,0,0-24.58-4.57c-36.83,0-66.67,29.11-66.67,65s29.84,65,66.67,65c31.34,0,57.64-21.12,64.76-49.55a62.74,62.74,0,0,0,1.92-15.47V437.53A20.92,20.92,0,0,0,518.88,422.66ZM456.73,555.37a29.07,29.07,0,1,1,29.06-29A29.07,29.07,0,0,1,456.73,555.37Z',
  u: 'M659.55,483.58V535c0,.66,0,1.34,0,2-1.24,29.32-29.75,52.78-64.76,52.78S531.26,566.35,530,537c0-.66,0-1.34,0-2V483.58a21.05,21.05,0,0,1,42.1,0V537s.32,17.56,22.73,17.57c22,0,22.64-17.57,22.64-17.57V483.58a21.05,21.05,0,1,1,42.1,0Z',
  c: 'M766.85,582.09A65.77,65.77,0,1,1,766,471.35a18.55,18.55,0,0,1,3,28.76h0a18.47,18.47,0,0,1-22.89,2.66,28.51,28.51,0,0,0-16.5-4.37,28.61,28.61,0,0,0,1.25,57.2,28.51,28.51,0,0,0,15.88-4.8,18.35,18.35,0,0,1,22,1.52h0A18.61,18.61,0,0,1,766.85,582.09Z',
  a: 'M957.53,486.53c-17.31-18.2-48.32-25.4-71.51-20.92h0a62.68,62.68,0,1,0,48.12,110.9,20.88,20.88,0,0,0,40.41-7.4V537S974.85,504.73,957.53,486.53Zm-57.34,69.71a28.66,28.66,0,1,1,28.66-28.66A28.65,28.65,0,0,1,900.19,556.24Z',
};
// The "oo" is one ribbon: an infinity loop — the daily round trip between the farm and the flat.
const OO_INK = [
  'M255.54,560.89l-.19.27c-2.08,2.83-21,27.1-58.89,23.08-14.05-1.49-25.62-6.43-34.32-13.36-13.79-10.94-20.48-26.89-18.64-42.22,2.49-20.81,25.33-43,59.68-28.5,0,0-15.36,10.63-18.41,24.29a19.92,19.92,0,0,0,2.61,15.38C199.78,560,219.51,548,219.51,548L255,560.7Z',
  'M151.34,502.09s51.84-34.41,89.22,19l29.93-27.63S245.87,465,221.81,462.2C189.8,458.47,164.15,475.14,151.34,502.09Z',
  'M378.43,557.94S331.33,587,294,533.65L264,563.16s17.25,21.72,41.15,25.6C334.56,593.53,364,587.52,378.43,557.94Z',
  'M370,558.72c-28.78,8.06-41.78-4.93-41.78-4.93,13.17-7.69,20.44-16.63,23.62-25,5.42-14.21-.89-26.74-10-28.6a13.78,13.78,0,0,0-4-.23c-15.94,1-37.26,25.14-66,49.4-28.55,24.11-40.23,33.22-63.59,35.85s-40.61-11.52-40.61-11.52,19,6.86,71.34-44.3c1.6-1.54,3.24-3.18,4.91-4.85,52.51-52.86,80.8-76.63,120.75-57.23a45.8,45.8,0,0,1,18.46,16.24C400.71,510.25,391.32,552.74,370,558.72Z',
];
const OO_EMBER_1 =
  'M254.48,563.32c-2.18,2.74-22.07,26.27-59.73,20.79-14-2-25.35-7.41-33.78-14.68-5.66-24.29,12.52-38.84,24.41-45.52a19.88,19.88,0,0,0,2,15.47c11.61,20.6,31.79,9.43,31.79,9.43l35,14Z';
const OO_EMBER_2 =
  'M383.17,483.54c-2.41,40.82-31.33,45.24-31.33,45.24h0c5.42-14.21-.89-26.74-10-28.6a13.78,13.78,0,0,0-4-.23c-36.41-4.43-76.76,12.52-98.84,29.43,1.6-1.54,3.24-3.18,4.91-4.85,52.51-52.86,80.8-76.63,120.75-57.23A45.8,45.8,0,0,1,383.17,483.54Z';

export const WORDMARK_ASPECT = 960 / 208;
// Where the dot of the "i" sits inside the wordmark box (fractions of width / height).
export const I_DOT = { x: (804.33 - 20) / 960, y: (431.12 - 396) / 208, r: 27.13 / 960 };

type WordmarkProps = {
  readonly width: number;
  /** Per-letter progress, index 0–6 for f·oo·d·u·c·i·a (or one number for all). */
  readonly p?: number | ((i: number) => number);
  /** Colour of the letters — forest on light grounds, cream on dark. */
  readonly ink?: string;
  /** 0 hides the dot of the i (when a separate "sun" is standing in for it). */
  readonly dot?: number;
  readonly style?: React.CSSProperties;
};

/** The official "fooducia" wordmark as live vectors, so every letter can move on its own. */
export const Wordmark: React.FC<WordmarkProps> = ({ width, p = 1, ink = C.forest, dot = 1, style }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g1 = `wm-a-${uid}`;
  const g2 = `wm-b-${uid}`;
  const g3 = `wm-c-${uid}`;
  const at = (i: number) => (typeof p === 'number' ? p : p(i));
  const letter = (i: number): React.CSSProperties => {
    const v = at(i);
    return {
      transformBox: 'fill-box',
      transformOrigin: '50% 100%',
      transform: `translateY(${(1 - v) * 70}px) scale(${0.55 + 0.45 * v})`,
      opacity: Math.min(1, Math.max(0, v) * 3),
    };
  };
  return (
    <svg
      viewBox="20 396 960 208"
      width={width}
      height={width / WORDMARK_ASPECT}
      style={{ overflow: 'visible', display: 'block', ...style }}
    >
      <defs>
        <linearGradient id={g1} x1="174.88" y1="547.72" x2="208.87" y2="567.45" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fabc15" />
          <stop offset="1" stopColor="#ed2725" />
        </linearGradient>
        <linearGradient id={g2} x1="239.05" y1="494.99" x2="383.17" y2="494.99" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fabc15" />
          <stop offset="1" stopColor="#ed2725" />
        </linearGradient>
        <linearGradient id={g3} x1="798" y1="414.6" x2="813.79" y2="455.82" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fabc15" />
          <stop offset="1" stopColor="#ed2725" />
        </linearGradient>
      </defs>
      <g style={letter(0)}>
        <path d={INK_PATHS.f} fill={ink} />
      </g>
      <g style={letter(1)}>
        <path d={OO_INK[0]} fill={ink} />
        <path d={OO_EMBER_1} fill={`url(#${g1})`} />
        <path d={OO_INK[1]} fill={ink} />
        <path d={OO_INK[2]} fill={ink} />
        <path d={OO_INK[3]} fill={ink} />
        <path d={OO_EMBER_2} fill={`url(#${g2})`} />
      </g>
      <g style={letter(2)}>
        <path d={INK_PATHS.d} fill={ink} />
      </g>
      <g style={letter(3)}>
        <path d={INK_PATHS.u} fill={ink} />
      </g>
      <g style={letter(4)}>
        <path d={INK_PATHS.c} fill={ink} />
      </g>
      <g style={letter(5)}>
        <rect x="782.79" y="463.19" width="41.77" height="128.77" rx="11.1" fill={ink} />
        <circle cx="804.33" cy="431.12" r="27.13" fill={`url(#${g3})`} opacity={dot} />
      </g>
      <g style={letter(6)}>
        <path d={INK_PATHS.a} fill={ink} />
      </g>
    </svg>
  );
};
