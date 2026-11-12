import React from 'react';
import { tint } from '../lib/anim';

// Flat, hand-built vector produce — drawn here rather than borrowed from a stock library, so the
// film owns every pixel it shows. Each sits in a 200×200 box.

type P = { readonly size?: number; readonly style?: React.CSSProperties };

const blade = (len: number, w: number) =>
  `M0,0 C ${w},${-len * 0.28} ${w * 0.92},${-len * 0.74} 0,${-len} C ${-w * 0.92},${-len * 0.74} ${-w},${-len * 0.28} 0,0 Z`;

const svg = (size: number, style: React.CSSProperties | undefined, kids: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 200 200" style={{ overflow: 'visible', display: 'block', ...style }}>
    {kids}
  </svg>
);

/** Ponnaganti kura — a tied bunch of slim green leaves. */
export const Ponnaganti: React.FC<P> = ({ size = 200, style }) => {
  const fan = [
    { a: -46, l: 92, w: 17, c: '#1E7A4C' },
    { a: 44, l: 94, w: 17, c: '#1E7A4C' },
    { a: -28, l: 112, w: 19, c: '#2F9E44' },
    { a: 27, l: 114, w: 19, c: '#2F9E44' },
    { a: -10, l: 128, w: 21, c: '#45B81F' },
    { a: 11, l: 124, w: 20, c: '#3DAA2A' },
    { a: 0, l: 104, w: 18, c: '#7BD63A' },
  ];
  return svg(
    size,
    style,
    <>
      <path d="M92,168 L88,196 M100,168 L100,198 M108,168 L113,196" stroke="#2F9E44" strokeWidth="5" strokeLinecap="round" />
      {fan.map((f, i) => (
        <g key={i} transform={`translate(100,166) rotate(${f.a})`}>
          <path d={blade(f.l, f.w)} fill={f.c} />
          <path d={`M0,-6 L0,${-f.l + 12}`} stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
      <rect x="84" y="158" width="32" height="13" rx="6" fill="#D9B36A" />
      <rect x="84" y="158" width="32" height="5" rx="2.5" fill="#EBCB8B" />
    </>,
  );
};

/** Gongura — lobed sorrel leaves on red stems. */
export const Gongura: React.FC<P> = ({ size = 200, style }) => {
  const leaf = (x: number, y: number, rot: number, s: number, c: string, key: number) => (
    <g key={key} transform={`translate(${x},${y}) rotate(${rot}) scale(${s})`}>
      <path d="M0,0 L0,58" stroke="#C2255C" strokeWidth="5.5" strokeLinecap="round" />
      {[-52, -26, 0, 26, 52].map((a, i) => (
        <g key={i} transform={`rotate(${a})`}>
          <path d={blade(i === 2 ? 64 : i === 1 || i === 3 ? 56 : 40, i === 2 ? 13 : 11)} fill={c} />
          <path d={`M0,-4 L0,${i === 2 ? -52 : -34}`} stroke="#E64980" strokeOpacity="0.55" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
  return svg(
    size,
    style,
    <>
      {leaf(58, 112, -24, 0.86, '#237A3B', 0)}
      {leaf(146, 108, 24, 0.9, '#2B8A3E', 1)}
      {leaf(100, 92, 0, 1.12, '#37A148', 2)}
    </>,
  );
};

/** Beetroot — magenta root, red-veined leaves. */
export const Beetroot: React.FC<P> = ({ size = 200, style }) =>
  svg(
    size,
    style,
    <>
      {[
        { a: -30, l: 78, c: '#2F9E44' },
        { a: 28, l: 80, c: '#2B8A3E' },
        { a: -2, l: 96, c: '#45B81F' },
      ].map((f, i) => (
        <g key={i} transform={`translate(100,98) rotate(${f.a})`}>
          <path d={`M0,0 L0,${-f.l * 0.42}`} stroke="#D6336C" strokeWidth="6" strokeLinecap="round" />
          <g transform={`translate(0,${-f.l * 0.36})`}>
            <path d={blade(f.l * 0.66, 22)} fill={f.c} />
            <path d={`M0,-2 L0,${-f.l * 0.56}`} stroke="#F06595" strokeWidth="2.4" strokeLinecap="round" />
          </g>
        </g>
      ))}
      <path d="M100,92 C142,92 158,118 154,142 C150,168 124,178 108,182 C104,190 102,196 100,200 C98,196 96,190 92,182 C76,178 50,168 46,142 C42,118 58,92 100,92 Z" fill="#A61E4D" />
      <path d="M100,92 C142,92 158,118 154,142 C152,156 143,166 132,172 C146,150 140,112 100,104 C84,101 70,104 60,110 C68,98 82,92 100,92 Z" fill="#C2255C" />
      <ellipse cx="76" cy="126" rx="9" ry="16" fill="rgba(255,255,255,0.22)" transform="rotate(18 76 126)" />
    </>,
  );

export const Tomato: React.FC<P> = ({ size = 200, style }) =>
  svg(
    size,
    style,
    <>
      <path d="M100,52 C150,44 180,82 176,122 C172,164 138,184 100,184 C62,184 28,164 24,122 C20,82 50,44 100,52 Z" fill="#E03131" />
      <path d="M100,52 C150,44 180,82 176,122 C174,142 165,157 152,167 C166,128 150,80 100,70 C76,65 54,72 40,84 C54,60 76,50 100,52 Z" fill="#F0503F" />
      <ellipse cx="62" cy="108" rx="11" ry="20" fill="rgba(255,255,255,0.25)" transform="rotate(22 62 108)" />
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} d={blade(34, 8)} fill="#2F9E44" transform={`translate(100,58) rotate(${a + 20}) translate(0,2)`} />
      ))}
      <path d="M100,58 C100,46 104,38 112,32" stroke="#2B8A3E" strokeWidth="7" strokeLinecap="round" fill="none" />
    </>,
  );

export const Carrot: React.FC<P> = ({ size = 200, style }) =>
  svg(
    size,
    style,
    <>
      {[-24, 0, 22].map((a, i) => (
        <path key={a} d={blade(56 + (i === 1 ? 12 : 0), 12)} fill={i === 1 ? '#45B81F' : '#2F9E44'} transform={`translate(100,66) rotate(${a})`} />
      ))}
      <path d="M72,70 C72,56 128,56 128,70 C128,108 112,168 100,196 C88,168 72,108 72,70 Z" fill="#F76707" />
      <path d="M100,60 C116,60 128,62 128,70 C128,108 112,168 100,196 C108,150 112,100 100,60 Z" fill="#E8590C" />
      <path d="M82,96 h16 M92,124 h14 M88,150 h10" stroke="rgba(255,255,255,0.4)" strokeWidth="3.5" strokeLinecap="round" />
    </>,
  );

export const Brinjal: React.FC<P> = ({ size = 200, style }) =>
  svg(
    size,
    style,
    <>
      <path d="M96,56 C140,60 164,104 150,146 C138,182 96,196 68,176 C38,154 46,100 70,72 C78,62 86,55 96,56 Z" fill="#5F3DC4" />
      <path d="M96,56 C140,60 164,104 150,146 C146,158 138,168 128,175 C142,132 126,84 86,66 C90,60 93,56 96,56 Z" fill="#7048E8" />
      <ellipse cx="74" cy="120" rx="9" ry="22" fill="rgba(255,255,255,0.22)" transform="rotate(16 74 120)" />
      <path d="M62,74 C74,48 108,44 122,62 C108,60 100,70 92,80 C84,70 72,70 62,74 Z" fill="#2F9E44" />
      <path d="M94,54 C94,40 100,30 110,24" stroke="#2B8A3E" strokeWidth="8" strokeLinecap="round" fill="none" />
    </>,
  );

export const Chilli: React.FC<P> = ({ size = 200, style }) =>
  svg(
    size,
    style,
    <>
      <path d="M64,48 C104,52 152,92 160,170 C160,180 152,182 148,174 C128,124 100,96 56,84 C40,78 44,46 64,48 Z" fill="#2F9E44" />
      <path d="M64,48 C104,52 152,92 160,170 C140,116 104,76 58,62 C58,54 60,48 64,48 Z" fill="#45B81F" />
      <path d="M58,62 C50,52 40,44 28,42" stroke="#1E7A4C" strokeWidth="8" strokeLinecap="round" fill="none" />
    </>,
  );

/** One leaf whose colour tracks how fresh it is: 1 = just cut, 0 = tired. */
export const FreshLeaf: React.FC<P & { readonly fresh?: number }> = ({ size = 200, fresh = 1, style }) => {
  const body = tint(fresh, '#8A8B5C', '#3DB54A');
  const light = tint(fresh, '#A3A374', '#8EE04A');
  const rib = tint(fresh, '#6E6F48', '#1E7A4C');
  // a tired leaf also curls and droops a little
  const droop = (1 - fresh) * 16;
  return svg(
    size,
    style,
    <g transform={`rotate(${droop} 100 180)`}>
      <path d="M100,186 C40,150 34,74 100,14 C166,74 160,150 100,186 Z" fill={body} />
      <path d="M100,186 C40,150 34,74 100,14 C100,74 100,130 100,186 Z" fill={light} />
      <path d="M100,186 L100,30 M100,150 L72,124 M100,120 L70,92 M100,150 L128,124 M100,120 L130,92 M100,88 L80,68 M100,88 L120,68" stroke={rib} strokeWidth="4" strokeLinecap="round" fill="none" />
    </g>,
  );
};

export const PRODUCE = {
  ponnaganti: Ponnaganti,
  gongura: Gongura,
  beetroot: Beetroot,
  tomato: Tomato,
  carrot: Carrot,
  brinjal: Brinjal,
  chilli: Chilli,
} as const;

export type ProduceKey = keyof typeof PRODUCE;
