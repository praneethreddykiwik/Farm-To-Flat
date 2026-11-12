import React, { useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import { C, EMBER, F } from '../brand';
import { S2 as COPY } from '../copy';
import { E, mix, ramp, useT, wave } from '../lib/anim';
import { along, catmull, polyD, type Pt } from '../lib/path';
import { Stage } from '../components/Stage';
import { Eyebrow, Fade, Words } from '../components/Words';
import { FreshLeaf } from '../components/Produce';

export const S2_INTRO = 18;
export const S2_LOOP = 4;

const STOPS: Pt[] = [
  [190, 852],
  [460, 640],
  [740, 860],
  [1010, 632],
  [1290, 860],
  [1540, 640],
  [1750, 846],
];
const LINE_Y = 770;
const LINE_A: Pt = [300, LINE_Y];
const LINE_B: Pt = [1620, LINE_Y];

const Sun: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <circle r="15" fill={C.emberA} />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
      <path key={a} d="M0,-23 L0,-31" stroke={C.emberA} strokeWidth="5" strokeLinecap="round" transform={`rotate(${a})`} />
    ))}
  </g>
);
const Moon: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <path d="M10,-22 A24,24 0 1,0 22,10 A18,18 0 1,1 10,-22 Z" fill="#C9D6E8" />
  </g>
);

/** Slide 2 — the problem, and the idea that rose out of it. */
export const S2Idea: React.FC = () => {
  const { t } = useT();
  const curve = useMemo(() => catmull(STOPS, 30), []);

  // A — the long road draws itself, the leaf tires as it goes
  const draw = ramp(t, 1.0, 5.6, E.inOut);
  // B — everything in the middle falls away and the road pulls straight
  const straight = ramp(t, 9.5, 1.5, E.inOut);
  // C — the sun comes up behind the short road
  const dawn = ramp(t, 12.0, 2.6, E.inOut);
  const sunUp = ramp(t, 12.2, 4.4, E.soft);

  const line = useMemo(
    () => curve.map((_, i): Pt => [mix(LINE_A[0], LINE_B[0], i / (curve.length - 1)), LINE_Y]),
    [curve],
  );
  const road = curve.map((p, i): Pt => [mix(p[0], line[i][0], straight), mix(p[1], line[i][1], straight)]);
  const d = polyD(road);

  // the leaf: rides the head of the road, then commutes farm → kitchen once the road is short
  const commute = (((t % 4) + 4) % 4) / 4;
  const commuteP = E.inOut(Math.min(1, commute / 0.8));
  const leafFrac = straight < 1 ? draw * (1 - straight) : commuteP;
  const leafPos = along(road, leafFrac);
  const fresh = straight > 0 ? mix(0.06, 1, straight) : 1 - draw * 0.94;
  const leafFade =
    straight < 1 ? 1 : commute < 0.8 ? Math.min(1, commute * 14) : Math.max(0, 1 - (commute - 0.8) * 9);

  const sunX = 1330;
  const sunY = mix(LINE_Y + 190, 500, sunUp);
  const glow = 1 + wave(t, 4) * 0.03;

  return (
    <Stage background="linear-gradient(180deg, #0B181B 0%, #132427 58%, #0A1614 100%)" push={1 + Math.min(t, S2_INTRO) * 0.0012} vignette={0.4}>
      {/* dawn comes in over the dusk */}
      <AbsoluteFill
        style={{
          opacity: dawn,
          background: 'linear-gradient(180deg, #071F1B 0%, #14402F 30%, #8A4F20 55%, #EE8E26 66%, #FABC15 71.3%)',
        }}
      />
      <AbsoluteFill
        style={{
          opacity: dawn * 0.8,
          background: `radial-gradient(circle 780px at ${sunX}px ${sunY}px, rgba(253,224,138,0.6) 0%, rgba(250,188,21,0.2) 42%, rgba(250,188,21,0) 70%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: sunX - 1100,
          top: sunY - 1100,
          width: 2200,
          height: 2200,
          opacity: dawn * 0.18,
          transform: `rotate(${(t / 4) * 30}deg)`,
          background: 'repeating-conic-gradient(from 0deg, rgba(255,240,190,0.9) 0deg 6deg, rgba(255,240,190,0) 6deg 30deg)',
          maskImage: 'radial-gradient(circle, rgba(0,0,0,0) 14%, #000 22%, rgba(0,0,0,0) 62%)',
          WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,0) 14%, #000 22%, rgba(0,0,0,0) 62%)',
        }}
      />
      {/* the sun — the same ember disc that dots the i in the wordmark */}
      <div
        style={{
          position: 'absolute',
          left: sunX - 170,
          top: sunY - 170,
          width: 340,
          height: 340,
          borderRadius: '50%',
          background: EMBER,
          opacity: dawn > 0 ? 1 : 0,
          transform: `scale(${glow})`,
          boxShadow: '0 0 130px 44px rgba(250,188,21,0.55), 0 0 340px 130px rgba(244,128,31,0.35)',
        }}
      />
      {/* the ground the short road runs along */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: LINE_Y,
          bottom: 0,
          opacity: ramp(t, 10.6, 1.4, E.inOut),
          background: 'linear-gradient(180deg, #06200F 0%, #03130A 100%)',
        }}
      />

      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="s2-tired" gradientUnits="userSpaceOnUse" x1="190" y1="0" x2="1750" y2="0">
            <stop offset="0" stopColor="#5BD34B" />
            <stop offset="0.3" stopColor="#9DB05A" />
            <stop offset="0.65" stopColor="#8A8B5C" />
            <stop offset="1" stopColor="#6F6B55" />
          </linearGradient>
        </defs>
        {/* ghost of the whole road, so the eye sees how far there is to go */}
        <path d={d} stroke="rgba(243,245,239,0.09)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={(1 - straight) * ramp(t, 0.6, 0.8)} />
        <path
          d={d}
          stroke="url(#s2-tired)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - draw}
          opacity={1 - straight}
        />
        <path d={d} stroke={C.sprout} strokeWidth="12" strokeLinecap="round" fill="none" opacity={straight} />

        {/* the stops */}
        {STOPS.map((s, i) => {
          const frac = i / (STOPS.length - 1);
          const here = ramp(t, 1.0 + frac * 5.6 * 0.96, 0.5, E.back);
          const end = i === 0 || i === STOPS.length - 1;
          const fall = end ? 0 : ramp(t, 8.7 + i * 0.13, 0.9, E.in);
          const ex = end ? mix(s[0], i === 0 ? LINE_A[0] : LINE_B[0], straight) : s[0];
          const ey = end ? mix(s[1], LINE_Y, straight) : s[1] + fall * 420;
          return (
            <g key={i} opacity={(1 - fall) * Math.min(1, here * 2)} transform={`translate(${ex},${ey}) rotate(${fall * (i % 2 ? 50 : -50)})`}>
              <circle r={(end ? 26 : 20) * here} fill={end ? mix(0, 1, straight) > 0.5 ? C.sprout : '#0B181B' : '#0B181B'} stroke={end ? C.sprout : 'rgba(243,245,239,0.7)'} strokeWidth="6" />
              {!end ? (i % 2 ? <Sun x={0} y={-78} s={here} /> : <Moon x={0} y={-78} s={here} />) : null}
              <text
                y={end ? 74 : 62}
                textAnchor="middle"
                fontFamily={F.mono}
                fontWeight={500}
                fontSize={end ? 32 : 26}
                letterSpacing="0.16em"
                fill={end ? C.sprout : 'rgba(243,245,239,0.82)'}
                opacity={here}
              >
                {COPY.stops[i]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* the travelling leaf */}
      <div
        style={{
          position: 'absolute',
          left: leafPos.x - 46,
          top: leafPos.y - 98,
          opacity: ramp(t, 0.9, 0.4) * leafFade,
          transform: `rotate(${mix(-8, 8, wave(t, 2) * 0.5 + 0.5) + (1 - fresh) * 18}deg)`,
          transformOrigin: '50% 100%',
          filter: 'drop-shadow(0 10px 14px rgba(0,0,0,0.4))',
        }}
      >
        <FreshLeaf size={92} fresh={fresh} />
      </div>

      {/* A */}
      <div style={{ position: 'absolute', left: 130, top: 112 }}>
        <Eyebrow at={0.3} out={7.7} color="rgba(243,245,239,0.7)">
          {COPY.eyebrow}
        </Eyebrow>
      </div>
      <div style={{ position: 'absolute', left: 130, top: 176 }}>
        <Words text={COPY.problem} at={0.6} out={7.8} size={136} weight={640} accent="#B9BC8A" />
      </div>
      <Fade at={2.6} out={7.7} style={{ position: 'absolute', left: 136, top: 356, fontFamily: F.body, fontWeight: 500, fontSize: 50, color: 'rgba(243,245,239,0.78)' }}>
        {COPY.problemSub}
      </Fade>

      {/* B */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 210 }}>
        <Words text={COPY.turn} at={8.5} out={11.9} size={136} weight={640} align="center" />
      </div>

      {/* C */}
      <div style={{ position: 'absolute', left: 130, top: 120 }}>
        <Words text={COPY.idea} at={13.0} size={138} weight={640} accent="#FFD466" lineHeight={1.06} style={{ textShadow: '0 6px 40px rgba(4,17,11,0.5)' }} />
      </div>
      <Fade at={15.0} style={{ position: 'absolute', left: 136, top: 446, fontFamily: F.body, fontWeight: 500, fontSize: 50, color: C.cream, textShadow: '0 4px 30px rgba(4,17,11,0.7)' }}>
        {COPY.ideaSub}
      </Fade>
    </Stage>
  );
};
