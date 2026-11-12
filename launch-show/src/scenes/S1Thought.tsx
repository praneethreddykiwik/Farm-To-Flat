import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, EMBER, F } from '../brand';
import { S1 as COPY } from '../copy';
import { E, bez, mix, present, ramp, useT, wave } from '../lib/anim';
import { Stage } from '../components/Stage';
import { Eyebrow, Fade, Words } from '../components/Words';
import { Brinjal, Carrot, FreshLeaf, Ponnaganti, Tomato } from '../components/Produce';

export const S1_INTRO = 14;
export const S1_LOOP = 4;

const blade = (len: number, w: number) =>
  `M0,0 C ${w},${-len * 0.3} ${w},${-len * 0.75} 0,${-len} C ${-w},${-len * 0.75} ${-w},${-len * 0.3} 0,0 Z`;

const Palm: React.FC<{ x: number; base: number; h: number; lean?: number; s?: number }> = ({
  x,
  base,
  h,
  lean = 0,
  s = 1,
}) => {
  const { t } = useT();
  const sway = wave(t, 4, x) * 1.6;
  return (
    <g transform={`translate(${x},${base}) scale(${s})`}>
      <path d={`M-9,0 C ${-6 + lean * 0.3},${-h * 0.5} ${lean - 4},${-h * 0.8} ${lean - 3},${-h} L ${lean + 3},${-h} C ${lean + 4},${-h * 0.8} ${6 + lean * 0.3},${-h * 0.5} 9,0 Z`} fill="#020D08" />
      <g transform={`translate(${lean},${-h}) rotate(${sway})`}>
        {[-150, -118, -86, -54, -22, 10, 42, 74, 106, 138, 170].map((a) => (
          <path key={a} d={blade(78, 11)} fill="#020D08" transform={`rotate(${a})`} />
        ))}
        <circle r="17" fill="#020D08" />
      </g>
    </g>
  );
};

/** Slide 1 — the thought. A plate, a question, and the people who never had to ask it. */
export const S1Thought: React.FC = () => {
  const { t } = useT();

  // plate → sun: the same disc is first the plate, then the sun the story rises under
  const morph = ramp(t, 6.0, 1.5, E.inOut);
  const rise = ramp(t, 7.3, 4.2, E.soft);
  const discX = mix(1440, 1330, morph);
  const discY = mix(548, 668, morph) - rise * 118;
  const discR = mix(280, 150, morph);
  const dawn = ramp(t, 6.2, 1.8, E.inOut);
  const land = ramp(t, 6.4, 1.7, E.out);
  const glow = 1 + wave(t, 4) * 0.035;

  const items = [
    { C: Tomato, x: -112, y: -72, s: 200, at: 1.1, r: -12 },
    { C: Ponnaganti, x: 86, y: -98, s: 232, at: 1.35, r: 14 },
    { C: Brinjal, x: 108, y: 78, s: 196, at: 1.6, r: 28 },
    { C: Carrot, x: -94, y: 96, s: 204, at: 1.85, r: -148 },
  ];
  const tags = [
    { x: 1090, y: 196, at: 3.0 },
    { x: 1560, y: 236, at: 3.45 },
    { x: 1190, y: 850, at: 3.9 },
  ];

  // dawn → noon: a leaf making the short trip it used to make
  const arcIn = ramp(t, 10.6, 1.0, E.out);
  const trip = ((t % 4) + 4) % 4 / 4;
  const tripEase = E.inOut(Math.min(1, trip / 0.72));
  const A: [number, number] = [1010, 902];
  const B: [number, number] = [1150, 742];
  const Cc: [number, number] = [1440, 742];
  const D: [number, number] = [1580, 902];
  const [lx, ly] = bez(tripEase, A, B, Cc, D);
  const leafShow = arcIn * (trip < 0.72 ? Math.min(1, trip * 12) : Math.max(0, 1 - (trip - 0.72) * 9));

  return (
    <Stage
      background={`radial-gradient(ellipse 60% 70% at 72% 48%, #10301F 0%, ${C.night} 70%)`}
      push={1 + Math.min(t, S1_INTRO) * 0.0016}
      vignette={0.4}
    >
      {/* dawn sky */}
      <AbsoluteFill
        style={{
          opacity: dawn,
          background:
            'linear-gradient(180deg, #071F1B 0%, #123A31 26%, #7A4A22 52%, #E0822A 64%, #FABC15 71%, #FDE08A 74%)',
        }}
      />
      <AbsoluteFill
        style={{
          opacity: dawn * 0.75,
          background: `radial-gradient(circle 760px at ${discX}px ${discY}px, rgba(253,224,138,0.55) 0%, rgba(250,188,21,0.18) 42%, rgba(250,188,21,0) 70%)`,
        }}
      />

      {/* sun rays — twelve-fold, so a 30° turn per loop is seamless */}
      <div
        style={{
          position: 'absolute',
          left: discX - 1100,
          top: discY - 1100,
          width: 2200,
          height: 2200,
          opacity: dawn * 0.16,
          transform: `rotate(${(t / 4) * 30}deg)`,
          background:
            'repeating-conic-gradient(from 0deg, rgba(255,240,190,0.9) 0deg 6deg, rgba(255,240,190,0) 6deg 30deg)',
          maskImage: 'radial-gradient(circle, rgba(0,0,0,0) 14%, #000 22%, rgba(0,0,0,0) 62%)',
          WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,0) 14%, #000 22%, rgba(0,0,0,0) 62%)',
        }}
      />

      {/* the disc: plate first, sun after */}
      <div
        style={{
          position: 'absolute',
          left: discX - discR,
          top: discY - discR,
          width: discR * 2,
          height: discR * 2,
          transform: `scale(${ramp(t, 0.25, 1.3, E.out) * (morph > 0 ? glow : 1)})`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            opacity: morph,
            background: EMBER,
            boxShadow: '0 0 120px 40px rgba(250,188,21,0.55), 0 0 320px 120px rgba(244,128,31,0.35)',
          }}
        />
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - morph, transform: `rotate(${t * 1.4}deg)` }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'conic-gradient(from 210deg, #F6DE9C, #B98A32, #F3D58A, #A97726, #F6DE9C)',
              boxShadow: '0 40px 120px rgba(0,0,0,0.6)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: '7%',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 38% 32%, #FFF3C9 0%, #EBC96E 46%, #C99B3C 100%)',
              boxShadow: 'inset 0 10px 40px rgba(120,80,10,0.45)',
            }}
          />
          {items.map((it, i) => {
            const p = ramp(t, it.at, 0.75, E.back);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `calc(50% + ${it.x}px - ${it.s / 2}px)`,
                  top: `calc(50% + ${it.y}px - ${it.s / 2}px)`,
                  transform: `translateY(${(1 - p) * -260}px) rotate(${it.r + (1 - p) * 40}deg) scale(${0.4 + 0.6 * p})`,
                  opacity: Math.min(1, p * 3),
                  filter: 'drop-shadow(0 14px 16px rgba(80,50,0,0.35))',
                }}
              >
                <it.C size={it.s} />
              </div>
            );
          })}
        </div>
      </div>

      {/* the question tags */}
      {tags.map((tag, i) => {
        const p = present(t, tag.at, 0.6, 5.7, 0.4, E.back);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: tag.x,
              top: tag.y + wave(t, 4, i * 2) * 6,
              transform: `scale(${p})`,
              opacity: Math.min(1, p * 2),
              padding: '18px 30px',
              borderRadius: 999,
              background: 'rgba(4,17,11,0.78)',
              border: '2px solid rgba(205,245,106,0.5)',
              fontFamily: F.mono,
              fontWeight: 500,
              fontSize: 34,
              letterSpacing: '0.04em',
              color: C.cream,
              whiteSpace: 'nowrap',
              boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
            }}
          >
            {COPY.tags[i].replace('?', '')}
            <span style={{ color: C.emberA }}>?</span>
          </div>
        );
      })}

      {/* land rises as the day begins */}
      <svg
        width={1920}
        height={1080}
        viewBox="0 0 1920 1080"
        style={{ position: 'absolute', inset: 0, transform: `translateY(${(1 - land) * 720}px)` }}
      >
        <path d="M0,792 C260,742 520,768 760,752 C1040,734 1280,764 1520,744 C1700,730 1830,748 1920,738 L1920,1080 L0,1080 Z" fill="#0B2E1E" />
        <path d="M0,836 C300,800 620,812 960,806 C1300,800 1640,812 1920,796 L1920,1080 L0,1080 Z" fill="#051A10" />
        {/* furrows running to the sun */}
        {[-1500, -1020, -640, -330, -60, 200, 470, 780, 1160, 1640].map((dx, i) => (
          <path
            key={i}
            d={`M1330,812 L${1330 + dx},1080`}
            stroke="#134B31"
            strokeWidth={5 + Math.abs(dx) / 260}
            strokeOpacity="0.75"
            strokeLinecap="round"
          />
        ))}
        {/* hut */}
        <g transform="translate(420,822)">
          <rect x="-66" y="-58" width="132" height="62" fill="#020D08" />
          <path d="M-98,-52 L0,-128 L98,-52 Z" fill="#020D08" />
          <rect x="-14" y="-34" width="28" height="38" rx="3" fill="#F4A01F" opacity={0.85 + wave(t, 2) * 0.1} />
        </g>
        <Palm x={170} base={850} h={330} lean={26} />
        <Palm x={292} base={842} h={236} lean={-14} s={0.86} />
        <Palm x={1770} base={836} h={300} lean={-22} />
        <Palm x={690} base={826} h={150} lean={8} s={0.6} />
        {/* two birds */}
        {[0, 1].map((b) => {
          const flap = wave(t, 1, b * 1.3) * 9;
          const bx = 1040 + b * 92 + wave(t, 4, b) * 14;
          const by = 236 + b * 46 + wave(t, 4, b + 1.4) * 8;
          return (
            <path
              key={b}
              d={`M${bx - 26},${by + flap} Q${bx - 12},${by - 12} ${bx},${by} Q${bx + 12},${by - 12} ${bx + 26},${by + flap}`}
              stroke="#04140D"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
              opacity={ramp(t, 9, 1.2)}
            />
          );
        })}
      </svg>

      {/* dawn → noon */}
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, opacity: arcIn }}>
        <path
          d={`M${A[0]},${A[1]} C${B[0]},${B[1]} ${Cc[0]},${Cc[1]} ${D[0]},${D[1]}`}
          stroke={C.sprout}
          strokeWidth="5"
          strokeDasharray="3 22"
          strokeLinecap="round"
          fill="none"
          opacity="0.95"
        />
        {/* sprout at dawn */}
        <g transform={`translate(${A[0]},${A[1] + 4})`}>
          <path d="M0,0 L0,-44" stroke={C.sprout} strokeWidth="7" strokeLinecap="round" />
          <path d={blade(46, 14)} fill={C.sprout} transform="translate(0,-34) rotate(-52)" />
          <path d={blade(46, 14)} fill={C.sprout} transform="translate(0,-34) rotate(52)" />
        </g>
        {/* clay pot at noon */}
        <g transform={`translate(${D[0]},${D[1]})`}>
          <path d="M-56,-46 C-76,-8 -58,30 0,30 C58,30 76,-8 56,-46 Z" fill="#C2622D" />
          <path d="M-56,-46 C-70,-18 -62,8 -38,22 C-52,-4 -48,-28 -36,-46 Z" fill="#E08A4A" />
          <rect x="-66" y="-62" width="132" height="20" rx="10" fill="#9A4A1F" />
          {[0, 1, 2].map((s) => {
            const up = ((t / 2 + s / 3) % 1 + 1) % 1;
            return (
              <path
                key={s}
                d={`M${-26 + s * 26},${-74 - up * 44} q10,-12 0,-24 q-10,-12 0,-24`}
                stroke="rgba(255,250,230,0.8)"
                strokeWidth="4"
                strokeLinecap="round"
                fill="none"
                opacity={Math.sin(up * Math.PI) * 0.8}
              />
            );
          })}
        </g>
      </svg>
      <div style={{ position: 'absolute', left: lx - 34, top: ly - 40, opacity: leafShow, transform: `rotate(${mix(-40, 60, tripEase)}deg)` }}>
        <FreshLeaf size={68} />
      </div>
      {[
        { x: A[0], label: 'DAWN' },
        { x: D[0], label: 'NOON' },
      ].map((m) => (
        <div
          key={m.label}
          style={{
            position: 'absolute',
            left: m.x - 100,
            width: 200,
            top: 952,
            textAlign: 'center',
            fontFamily: F.mono,
            fontWeight: 500,
            fontSize: 30,
            letterSpacing: '0.22em',
            color: C.sprout,
            opacity: arcIn,
          }}
        >
          {m.label}
        </div>
      ))}

      {/* A — the question */}
      <div style={{ position: 'absolute', left: 130, top: 168 }}>
        <Eyebrow at={0.5} out={5.6}>
          {COPY.eyebrow}
        </Eyebrow>
      </div>
      <div style={{ position: 'absolute', left: 130, top: 300 }}>
        <Words text={COPY.question} at={0.9} out={5.75} size={150} weight={640} lineHeight={1.05} />
      </div>

      {/* B — the people who never asked */}
      <div style={{ position: 'absolute', left: 130, top: 150 }}>
        <Words
          text={COPY.ancestors}
          at={7.7}
          size={132}
          weight={640}
          accent="#FFD466"
          lineHeight={1.08}
          style={{ textShadow: '0 6px 40px rgba(4,17,11,0.55)' }}
        />
      </div>
      <Fade
        at={9.5}
        style={{
          position: 'absolute',
          left: 136,
          top: 470,
          fontFamily: F.body,
          fontWeight: 500,
          fontSize: 50,
          color: C.cream,
          textShadow: '0 4px 30px rgba(4,17,11,0.7)',
        }}
      >
        {COPY.ancestorsSub}
      </Fade>
    </Stage>
  );
};
