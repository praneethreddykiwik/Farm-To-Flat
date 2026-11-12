import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { C, F } from '../brand';
import { EVENT, QR_CODES, S7 as COPY } from '../copy';
import { E, ramp, rnd, rndRange, useT, wave } from '../lib/anim';
import { Grain } from '../components/Stage';
import { Words } from '../components/Words';
import { LeafMark, Wordmark, WORDMARK_ASPECT } from '../components/Logo';
import { Burst, Flowers, Rain } from '../components/Petals';
import { QR } from '../components/QR';
import { HOLD_BG, SEED, Seed } from './S6Hold';

export const S7_INTRO = 15;
export const S7_LOOP = 8;

/** The instant the screen breaks open. Everything before it is the spark; everything after, the launch. */
const T0 = 0.9;
const CX = SEED.x;
const CY = SEED.y;

type Pt = [number, number];

// The dark screen is a sheet of paper. It tears along jagged lines from the seed outward, and the
// pieces are thrown clear. Neighbouring pieces share a tear line, so they fit until they part.
const SHARDS = 14;
const useShards = () =>
  useMemo(() => {
    const radii = [0, 90, 220, 380, 570, 800, 1060, 1380];
    const angles = Array.from({ length: SHARDS }).map((_, i) => ((i + (rnd(`sa${i}`) - 0.5) * 0.55) / SHARDS) * Math.PI * 2);
    const edges: Pt[][] = angles.map((a, i) =>
      radii.map((r, j): Pt => {
        const jitter = j === 0 ? 0 : (rnd(`sj${i}-${j}`) - 0.5) * (26 + j * 16);
        return [CX + Math.cos(a) * r - Math.sin(a) * jitter, CY + Math.sin(a) * r + Math.cos(a) * jitter];
      }),
    );
    return angles.map((a, i) => {
      const next = (i + 1) % SHARDS;
      let b = angles[next];
      if (b < a) b += Math.PI * 2;
      const mid = (a + b) / 2;
      const poly = [...edges[i], ...edges[next].slice(1).reverse()];
      return {
        clip: `polygon(${poly.map((p) => `${p[0].toFixed(1)}px ${p[1].toFixed(1)}px`).join(',')})`,
        dir: [Math.cos(mid), Math.sin(mid)] as Pt,
        origin: `${(CX + Math.cos(mid) * 560).toFixed(0)}px ${(CY + Math.sin(mid) * 560).toFixed(0)}px`,
        turn: (rnd(`st${i}`) < 0.5 ? -1 : 1) * rndRange(`sr${i}`, 26, 78),
        delay: rnd(`sd${i}`) * 0.07,
        reach: rndRange(`sx${i}`, 1500, 2100),
      };
    });
  }, []);

const TILE_W = 420;
const TILE_H = 520;
const TILE_X = [250, 750, 1250];
const TILE_Y = 384;

/** Slide 7 — the launch. One key press: the dark tears open, flowers fall, and the name fills the room. */
export const S7Launch: React.FC = () => {
  const { t } = useT();
  const shards = useShards();
  const tau = t - T0;
  const lit = tau >= 0;

  // the spark under the guest's finger, then one held breath of dark
  const swell = ramp(t, 0, 0.5, E.out);
  const collapse = ramp(t, 0.52, 0.3, E.in);
  const seedScale = (1 + swell * 2.2) * (1 - collapse);
  const seedGlow = (1 + swell * 1.6) * (1 - collapse);

  // the wordmark: small → the whole screen → settled → up into the lockup
  const key = [2.2, 3.6, 4.9, 6.2, 7.4, 9.6, 10.9];
  const kf = (vals: number[]) => interpolate(t, key, vals, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: E.inOut });
  const wordW = kf([430, 430, 1640, 1700, 900, 900, 500]);
  const wordX = kf([960, 960, 960, 960, 960, 960, 1040]);
  const wordY = kf([700, 700, 540, 540, 436, 436, 118]);

  const markOut = ramp(t, 3.45, 0.55, E.in);
  const up = ramp(t, 9.6, 1.3, E.inOut);
  const washDrift = wave(t, 8) * 30;

  const launchedText = COPY.launched.replace(/(\S+)$/, '*$1*');

  return (
    <AbsoluteFill style={{ background: HOLD_BG, overflow: 'hidden' }}>
      {lit ? (
        <>
          {/* the light it opens onto */}
          <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 72% at 50% 42%, #FFFEF8 0%, #F8F3E1 56%, #EDE5C6 100%)' }} />
          <div style={{ position: 'absolute', left: -260 + washDrift, top: -300, width: 980, height: 980, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,238,3,0.26), rgba(192,238,3,0) 66%)' }} />
          <div style={{ position: 'absolute', right: -300 - washDrift, bottom: -380, width: 1100, height: 1100, borderRadius: '50%', background: 'radial-gradient(circle, rgba(250,188,21,0.3), rgba(250,188,21,0) 66%)' }} />
          <div style={{ position: 'absolute', left: -200, bottom: -420, width: 900, height: 900, borderRadius: '50%', background: 'radial-gradient(circle, rgba(67,184,31,0.16), rgba(67,184,31,0) 66%)' }} />

          {/* rays */}
          <div
            style={{
              position: 'absolute',
              left: CX - 1300,
              top: CY - 1300,
              width: 2600,
              height: 2600,
              opacity: (1 - ramp(t, T0 + 0.5, 2.8, E.inOut)) * 0.75,
              transform: `rotate(${tau * 16}deg) scale(${0.5 + ramp(t, T0, 0.9, E.out) * 0.6})`,
              background: 'repeating-conic-gradient(from 0deg, rgba(250,188,21,0.6) 0deg 5deg, rgba(250,188,21,0) 5deg 15deg)',
              maskImage: 'radial-gradient(circle, rgba(0,0,0,0) 6%, #000 16%, rgba(0,0,0,0) 66%)',
              WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,0) 6%, #000 16%, rgba(0,0,0,0) 66%)',
            }}
          />

          {/* the calm shower — always behind the codes, so nothing ever covers one */}
          <Rain from={2.4} period={S7_LOOP} />

          {/* the mark, large, as it first appears */}
          {markOut < 1 ? (
            <div
              style={{
                position: 'absolute',
                left: 960 - 215,
                top: 392 - 215 - markOut * 170,
                opacity: 1 - markOut,
                transform: `scale(${1 + markOut * 0.25})`,
                filter: 'drop-shadow(0 30px 40px rgba(5,71,47,0.22))',
              }}
            >
              <LeafMark size={430} p={[ramp(t, T0 + 0.3, 0.85, E.back), ramp(t, T0 + 0.44, 0.85, E.back), ramp(t, T0 + 0.62, 0.85, E.back)]} sway={wave(t, 2) * 1.4} />
            </div>
          ) : null}

          {/* the mark again, small, beside the name in the final lockup */}
          <div style={{ position: 'absolute', left: 646, top: 36 }}>
            <LeafMark size={156} p={[ramp(t, 10.3, 0.8, E.back), ramp(t, 10.42, 0.8, E.back), ramp(t, 10.56, 0.8, E.back)]} sway={wave(t, 4) * 1.2} />
          </div>

          {/* fooducia */}
          <div style={{ position: 'absolute', left: wordX - wordW / 2, top: wordY - wordW / WORDMARK_ASPECT / 2 }}>
            <Wordmark width={wordW} p={(i) => ramp(t, 2.25 + i * 0.07, 0.6, E.back)} />
          </div>

          {/* Officially launched */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: interpolate(up, [0, 1], [600, 204]),
              transform: `scale(${interpolate(up, [0, 1], [1, 0.66])})`,
              transformOrigin: '50% 0%',
            }}
          >
            <Words text={launchedText} at={7.5} size={118} weight={620} color={C.forest} accent="#E8590C" align="center" />
            <svg width={760} height={40} viewBox="0 0 760 40" style={{ display: 'block', margin: '14px auto 0', overflow: 'visible' }}>
              <defs>
                <linearGradient id="s7-swash" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor={C.emberA} />
                  <stop offset="1" stopColor={C.emberC} />
                </linearGradient>
              </defs>
              <path
                d="M10,24 C180,2 420,4 750,18"
                stroke="url(#s7-swash)"
                strokeWidth="9"
                strokeLinecap="round"
                fill="none"
                pathLength={1}
                strokeDasharray="1 1"
                strokeDashoffset={1 - ramp(t, 8.0, 0.8, E.inOut)}
              />
            </svg>
            {EVENT.dateline ? (
              <div
                style={{
                  textAlign: 'center',
                  marginTop: 18,
                  fontFamily: F.mono,
                  fontWeight: 500,
                  fontSize: 32,
                  letterSpacing: '0.22em',
                  color: C.leaf,
                  opacity: ramp(t, 8.4, 0.8),
                }}
              >
                {EVENT.dateline}
              </div>
            ) : null}
          </div>

          {/* the three codes */}
          {QR_CODES.map((q, i) => {
            const p = ramp(t, 10.7 + i * 0.22, 1.0, E.out);
            const glow = Math.max(0, wave(t, S7_LOOP, -i * 2.094)) ** 2;
            return (
              <div
                key={q.label}
                style={{
                  position: 'absolute',
                  left: TILE_X[i],
                  top: TILE_Y + (1 - p) * 800,
                  width: TILE_W,
                  height: TILE_H,
                  borderRadius: 38,
                  background: '#FFFFFF',
                  padding: 24,
                  transform: `rotate(${(1 - p) * (i - 1) * 7}deg)`,
                  boxShadow: `0 30px 70px rgba(5,71,47,0.2), 0 0 0 ${3 + glow * 7}px rgba(67,184,31,${0.25 + glow * 0.55})`,
                }}
              >
                <QR value={q.url} size={TILE_W - 48} reveal={ramp(t, 11.5 + i * 0.25, 0.9, E.inOut)} />
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 12, padding: '0 6px' }}>
                  <div style={{ fontFamily: F.body, fontWeight: 700, fontSize: 42, color: C.ink, letterSpacing: '-0.01em' }}>{q.label}</div>
                  <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: 26, color: C.leaf }}>{q.sub}</div>
                </div>
                <div style={{ fontFamily: F.mono, fontWeight: 500, fontSize: 19, color: C.ink3, padding: '2px 6px 0', whiteSpace: 'nowrap' }}>{q.short}</div>
              </div>
            );
          })}

          <div style={{ position: 'absolute', left: 0, right: 0, top: 926 }}>
            <Words text={COPY.scan} at={12.7} size={50} weight={600} font="body" color={C.forest} align="center" tracking={-0.005} />
          </div>

          {/* in front: the flowers that pop, the petals thrown by the burst */}
          <Flowers at={T0 + 0.08} />
          <Burst at={T0} cx={CX} cy={CY} />

          {/* shockwaves */}
          {[0, 0.13].map((d, i) => {
            const p = ramp(tau, d, 0.95, E.out);
            if (p <= 0 || p >= 1) return null;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: CX - 1400,
                  top: CY - 1400,
                  width: 2800,
                  height: 2800,
                  borderRadius: '50%',
                  border: `${22 * (1 - p) + 3}px solid ${i === 0 ? C.emberA : C.lime}`,
                  transform: `scale(${p})`,
                  opacity: 1 - p,
                }}
              />
            );
          })}

          {/* the torn sheet, thrown clear */}
          {tau < 1.25
            ? shards.map((s, i) => {
                const st = Math.max(0, tau - s.delay);
                const go = 1 - Math.exp(-3.1 * st);
                const fade = 1 - ramp(st, 0.5, 0.55, E.in);
                if (fade <= 0) return null;
                const piece = (lag: number, bg: string, key: string) => (
                  <AbsoluteFill
                    key={key}
                    style={{
                      clipPath: s.clip,
                      background: bg,
                      transformOrigin: s.origin,
                      transform: `translate(${s.dir[0] * s.reach * go * lag}px, ${s.dir[1] * s.reach * go * lag}px) rotate(${s.turn * go * lag}deg)`,
                      opacity: fade,
                    }}
                  />
                );
                return (
                  <React.Fragment key={i}>
                    {piece(0.955, '#EFE7CC', 'under')}
                    {piece(1, `radial-gradient(circle at ${CX}px ${CY}px, #0B2015 0%, ${HOLD_BG} 62%)`, 'top')}
                  </React.Fragment>
                );
              })
            : null}

          {/* the flash */}
          <AbsoluteFill
            style={{
              background: 'radial-gradient(circle at 50% 46%, rgba(255,255,255,1) 0%, rgba(255,244,200,0.95) 40%, rgba(255,214,102,0.7) 100%)',
              opacity: 1 - ramp(t, T0, 0.6, E.soft),
              pointerEvents: 'none',
            }}
          />
          <Grain opacity={0.05} />
        </>
      ) : (
        <>
          <Seed scale={seedScale} glow={seedGlow} rings={false} />
          {/* the ring that answers the key press at once */}
          <div
            style={{
              position: 'absolute',
              left: CX - 600,
              top: CY - 600,
              width: 1200,
              height: 1200,
              borderRadius: '50%',
              border: `5px solid ${C.emberA}`,
              transform: `scale(${ramp(t, 0, 0.55, E.out)})`,
              opacity: (1 - ramp(t, 0, 0.55, E.out)) * 0.9,
            }}
          />
          <Grain opacity={0.05} />
        </>
      )}
    </AbsoluteFill>
  );
};
