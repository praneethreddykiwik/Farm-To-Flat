import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, EMBER, F, fraunces } from '../brand';
import { S3 as COPY } from '../copy';
import { E, mix, present, ramp, rnd, useT, wave } from '../lib/anim';
import { Stage } from '../components/Stage';
import { Fade, Words } from '../components/Words';
import { LeafMark, Wordmark, WORDMARK_ASPECT } from '../components/Logo';

export const S3_INTRO = 17;
export const S3_LOOP = 4;

const CX = 960;
const CY = 950;
const R = 610;
const arcPt = (deg: number): [number, number] => [
  CX + R * Math.cos((deg * Math.PI) / 180),
  CY - R * Math.sin((deg * Math.PI) / 180),
];
const BEAT_DEG = [157, 90, 23];
const BEAT_AT = [6.0, 8.5, 11.0];

const blade = (len: number, w: number) =>
  `M0,0 C ${w},${-len * 0.3} ${w},${-len * 0.75} 0,${-len} C ${-w},${-len * 0.75} ${-w},${-len * 0.3} 0,0 Z`;

const BeatIcon: React.FC<{ i: number }> = ({ i }) => {
  if (i === 0) {
    // a phone, an order placed
    return (
      <g>
        <rect x="-26" y="-44" width="52" height="88" rx="11" fill="none" stroke={C.cream} strokeWidth="6" />
        <path d="M-12,-2 L-3,8 L14,-12" stroke={C.sprout} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M-8,30 L8,30" stroke={C.cream} strokeWidth="5" strokeLinecap="round" />
      </g>
    );
  }
  if (i === 1) {
    // a plant, cut at first light
    return (
      <g>
        <path d="M0,40 L0,-6" stroke={C.sprout} strokeWidth="7" strokeLinecap="round" />
        <path d={blade(46, 15)} fill={C.sprout} transform="translate(0,2) rotate(-50)" />
        <path d={blade(46, 15)} fill={C.sprout} transform="translate(0,2) rotate(50)" />
        <path d={blade(40, 13)} fill="#8EE04A" transform="translate(0,-4)" />
        <path d="M-40,40 L40,40" stroke={C.cream} strokeWidth="6" strokeLinecap="round" />
      </g>
    );
  }
  // a door, a bag waiting at it
  return (
    <g>
      <rect x="-30" y="-46" width="46" height="88" rx="5" fill="none" stroke={C.cream} strokeWidth="6" />
      <circle cx="6" cy="0" r="4" fill={C.cream} />
      <path d="M10,42 L44,42 L40,6 L14,6 Z" fill={C.sprout} />
      <path d="M19,8 C19,-8 35,-8 35,8" stroke={C.sprout} strokeWidth="5" fill="none" strokeLinecap="round" />
    </g>
  );
};

/** Slide 3 — where Fooducia comes in: the gap between harvest and home, closed overnight. */
export const S3Promise: React.FC = () => {
  const { t } = useT();

  // A — the name arrives, then steps aside into the corner
  const tuck = ramp(t, 4.5, 1.1, E.inOut);
  const markP: [number, number, number] = [
    ramp(t, 0.9, 0.9, E.back),
    ramp(t, 1.1, 0.9, E.back),
    ramp(t, 1.35, 0.9, E.back),
  ];
  const markSize = mix(330, 124, tuck);
  const wordW = mix(820, 330, tuck);
  const lockX = mix(960, 268, tuck); // centre x of the lockup
  const lockY = mix(452, 118, tuck);

  // B — one night, drawn as an arc from moon to morning sun
  const arcIn = ramp(t, 4.9, 1.0, E.out);
  const travel = ramp(t, 5.6, 6.0, E.inOut);
  const deg = mix(176, 12, travel);
  const [tx, ty] = arcPt(deg);
  // moon until just past the top of the arc, then the sun takes over
  const sunMix = 1 - Math.min(1, Math.max(0, (deg - 70) / 46));
  const arcD = `M ${arcPt(176).join(',')} A ${R},${R} 0 0 1 ${arcPt(12).join(',')}`;
  const arcLen = (R * Math.PI * (176 - 12)) / 180;

  const closeIn = ramp(t, 13.9, 0.8, E.out);

  return (
    <Stage background="linear-gradient(90deg, #04121F 0%, #052C1F 48%, #0A4A2B 100%)" push={1 + Math.min(t, S3_INTRO) * 0.001} vignette={0.38}>
      {/* stars on the night side */}
      <AbsoluteFill style={{ opacity: arcIn * (1 - travel * 0.75) }}>
        {Array.from({ length: 46 }).map((_, i) => {
          const x = rnd(`sx${i}`) * 900;
          const y = rnd(`sy${i}`) * 620;
          const s = 2 + rnd(`ss${i}`) * 4;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: s,
                height: s,
                borderRadius: '50%',
                background: '#DCE8F5',
                opacity: 0.35 + 0.5 * (0.5 + 0.5 * wave(t, i % 2 ? 2 : 4, i)),
              }}
            />
          );
        })}
      </AbsoluteFill>
      {/* light follows the traveller */}
      <AbsoluteFill
        style={{
          opacity: arcIn,
          background: `radial-gradient(circle 620px at ${tx}px ${ty}px, ${sunMix > 0.5 ? 'rgba(250,188,21,0.34)' : 'rgba(170,200,235,0.2)'} 0%, rgba(0,0,0,0) 70%)`,
        }}
      />

      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, opacity: arcIn }}>
        <defs>
          <linearGradient id="s3-arc" gradientUnits="userSpaceOnUse" x1="350" y1="0" x2="1570" y2="0">
            <stop offset="0" stopColor="#9DB8DC" />
            <stop offset="0.5" stopColor={C.emberA} />
            <stop offset="1" stopColor={C.sprout} />
          </linearGradient>
        </defs>
        <path d={arcD} stroke="rgba(243,245,239,0.14)" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray="2 22" />
        <path d={arcD} stroke="url(#s3-arc)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={`${arcLen} ${arcLen}`} strokeDashoffset={arcLen * (1 - travel)} />
        {BEAT_DEG.map((bd, i) => {
          const [bx, by] = arcPt(bd);
          const p = ramp(t, BEAT_AT[i], 0.7, E.back);
          const lit = 0.5 + 0.5 * wave(t, 4, -i * 2.1);
          return (
            <g key={i} transform={`translate(${bx},${by})`}>
              <circle r={104 * p + lit * 8 * p} fill="none" stroke={C.sprout} strokeOpacity={0.22 * p} strokeWidth="3" />
              <circle r={84 * p} fill="#062619" stroke={C.sprout} strokeWidth="5" />
              <g transform={`scale(${p})`}>
                <BeatIcon i={i} />
              </g>
            </g>
          );
        })}
      </svg>

      {/* the traveller: moon, then sun */}
      <div
        style={{
          position: 'absolute',
          left: tx - 46,
          top: ty - 46,
          width: 92,
          height: 92,
          opacity: arcIn * (travel >= 1 ? 0 : 1) * (1 - ramp(t, 11.3, 0.3)),
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 36% 34%, #FFFFFF 0%, #C9D6E8 70%)',
            boxShadow: '0 0 60px 16px rgba(190,214,245,0.5)',
            opacity: 1 - sunMix,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: EMBER,
            boxShadow: '0 0 80px 26px rgba(250,188,21,0.6)',
            opacity: sunMix,
          }}
        />
      </div>

      {/* beat labels on the arc */}
      {BEAT_DEG.map((bd, i) => {
        const [bx, by] = arcPt(bd);
        const p = ramp(t, BEAT_AT[i] + 0.15, 0.7, E.out);
        const side = i === 0 ? -1 : i === 2 ? 1 : 0;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: bx - 220 + side * 20,
              width: 440,
              top: i === 1 ? by - 176 : by + 106,
              textAlign: 'center',
              fontFamily: F.mono,
              fontWeight: 500,
              fontSize: 32,
              letterSpacing: '0.2em',
              color: C.sprout,
              opacity: p,
              transform: `translateY(${(1 - p) * 16}px)`,
            }}
          >
            {COPY.beats[i].when}
          </div>
        );
      })}

      {/* the beat, said large, in the middle of the night */}
      {COPY.beats.map((b, i) => {
        const p = present(t, BEAT_AT[i] + 0.1, 0.7, i === 2 ? 13.4 : BEAT_AT[i + 1] - 0.35, 0.4);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 600,
              textAlign: 'center',
              ...fraunces(640),
              fontSize: 132,
              letterSpacing: '-0.02em',
              color: C.cream,
              opacity: p,
              transform: `translateY(${(1 - p) * 30}px) scale(${0.96 + 0.04 * p})`,
            }}
          >
            {b.what}
          </div>
        );
      })}

      {/* C — what is missing from the journey, and the line to remember */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 500, opacity: closeIn }}>
        <Words text={COPY.close} at={13.9} size={124} weight={640} align="center" accent={C.emberA} lineHeight={1.08} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 904, display: 'flex', justifyContent: 'center', gap: 30 }}>
        {COPY.nos.map((no, i) => {
          const p = ramp(t, 15.0 + i * 0.3, 0.6, E.back);
          return (
            <div
              key={no}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '18px 30px 18px 22px',
                borderRadius: 999,
                background: 'rgba(4,17,11,0.6)',
                border: '2px solid rgba(243,245,239,0.28)',
                fontFamily: F.body,
                fontWeight: 600,
                fontSize: 38,
                color: C.cream,
                transform: `scale(${p}) translateY(${wave(t, 4, i * 1.6) * 4}px)`,
                opacity: Math.min(1, p * 2),
              }}
            >
              <svg width="38" height="38" viewBox="-19 -19 38 38">
                <circle r="17" fill={C.emberC} />
                <path d="M-7,-7 L7,7 M7,-7 L-7,7" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
              </svg>
              {no.replace(/^No /, '')}
            </div>
          );
        })}
      </div>

      {/* A — "That's where …" and the name */}
      <Fade at={0.3} out={4.2} style={{ position: 'absolute', left: 0, right: 0, top: 96, textAlign: 'center', ...fraunces(500), fontStyle: 'italic', fontSize: 68, color: 'rgba(243,245,239,0.86)' }}>
        {COPY.intro}
      </Fade>
      <div
        style={{
          position: 'absolute',
          left: lockX - 480,
          top: lockY - 300,
          width: 960,
          height: 600,
          opacity: (1 - tuck) * ramp(t, 0.7, 0.8) * 0.5,
          background: 'radial-gradient(circle, rgba(205,245,106,0.28) 0%, rgba(205,245,106,0) 62%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: lockX,
          top: lockY,
          display: 'flex',
          flexDirection: tuck > 0.5 ? 'row' : 'column',
          alignItems: 'center',
          gap: mix(4, 6, tuck),
          transform: 'translate(-50%, -50%)',
        }}
      >
        <LeafMark size={markSize} p={markP} sway={wave(t, 4) * 1.2} style={{ marginBottom: tuck > 0.5 ? 0 : -markSize * 0.06 }} />
        <div style={{ width: wordW, height: wordW / WORDMARK_ASPECT }}>
          <Wordmark width={wordW} ink={C.cream} p={(i) => ramp(t, 1.7 + i * 0.09, 0.7, E.back)} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 812 }}>
        <Words text={COPY.promise} at={2.9} out={4.3} size={70} weight={560} align="center" accent={C.sprout} />
      </div>
    </Stage>
  );
};
