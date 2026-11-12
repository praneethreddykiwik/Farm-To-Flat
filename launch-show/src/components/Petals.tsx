import React, { useMemo } from 'react';
import { C } from '../brand';
import { E, ramp, rnd, rndRange, useT } from '../lib/anim';

// Marigold, rose and jasmine — the flowers showered at every Telugu celebration — plus leaves and
// paper confetti in the brand's own colours. Everything is seeded, so every run is identical.

const PALETTE = [
  { kind: 'petal', colors: [C.marigold, '#FFB800', C.marigoldDeep] },
  { kind: 'petal', colors: [C.rose, '#F06595', C.roseDeep] },
  { kind: 'petal', colors: [C.jasmine, '#FFF6D6'] },
  { kind: 'leaf', colors: [C.leafBright, C.lime, C.leaf] },
  { kind: 'strip', colors: [C.emberA, C.emberC, C.lime, C.forest] },
] as const;

type Bit = {
  kind: string;
  color: string;
  size: number;
  angle: number;
  speed: number;
  drag: number;
  grav: number;
  spin: number;
  flip: number;
  phase: number;
  delay: number;
};

const shapeStyle = (kind: string, size: number, color: string): React.CSSProperties => {
  if (kind === 'strip') return { width: size * 0.42, height: size * 1.1, borderRadius: 3, background: color };
  if (kind === 'leaf') return { width: size * 0.62, height: size * 1.25, borderRadius: '0 100% 0 100%', background: color };
  return {
    width: size,
    height: size * 1.12,
    borderRadius: '8% 100% 12% 100%',
    background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.55), ${color} 55%)`,
  };
};

/** The explosion: petals and paper thrown outward from one point, slowed by the air, then falling. */
export const Burst: React.FC<{ at: number; cx: number; cy: number; count?: number }> = ({ at, cx, cy, count = 210 }) => {
  const { t } = useT();
  const bits = useMemo<Bit[]>(
    () =>
      Array.from({ length: count }).map((_, i) => {
        const pal = PALETTE[Math.floor(rnd(`bk${i}`) * PALETTE.length)];
        return {
          kind: pal.kind,
          color: pal.colors[Math.floor(rnd(`bc${i}`) * pal.colors.length)],
          size: rndRange(`bs${i}`, 20, 52),
          angle: rnd(`ba${i}`) * Math.PI * 2,
          speed: rndRange(`bv${i}`, 900, 3100),
          drag: rndRange(`bd${i}`, 2.0, 3.3),
          grav: rndRange(`bg${i}`, 380, 760),
          spin: rndRange(`br${i}`, -420, 420),
          flip: rndRange(`bf${i}`, 3, 9),
          phase: rnd(`bp${i}`) * 6.28,
          delay: rnd(`bl${i}`) * 0.14,
        };
      }),
    [count],
  );
  const tau0 = t - at;
  if (tau0 < 0 || tau0 > 7.5) return null;
  return (
    <>
      {bits.map((b, i) => {
        const tau = tau0 - b.delay;
        if (tau < 0) return null;
        const reach = (b.speed * (1 - Math.exp(-b.drag * tau))) / b.drag;
        const x = cx + Math.cos(b.angle) * reach;
        const y = cy + Math.sin(b.angle) * reach * 0.82 + 0.5 * b.grav * tau * tau * 0.55;
        if (y > 1200 || x < -100 || x > 2020) return null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: `translate(-50%, -50%) rotate(${b.spin * tau + b.phase * 57}deg) scaleX(${Math.cos(tau * b.flip + b.phase)}) scale(${Math.min(1, tau * 9)})`,
              ...shapeStyle(b.kind, b.size, b.color),
            }}
          />
        );
      })}
    </>
  );
};

/**
 * The gentle shower afterwards. Every motion repeats exactly every `period` seconds, so the final
 * screen can hold on it for as long as people are scanning.
 */
export const Rain: React.FC<{ from: number; period: number; count?: number; height?: number }> = ({
  from,
  period,
  count = 54,
  height = 1080,
}) => {
  const { t } = useT();
  const bits = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => {
        const pal = PALETTE[Math.floor(rnd(`rk${i}`) * 4)]; // no paper strips in the calm shower
        return {
          kind: pal.kind,
          color: pal.colors[Math.floor(rnd(`rc${i}`) * pal.colors.length)],
          size: rndRange(`rs${i}`, 18, 40),
          x: rnd(`rx${i}`) * 1920,
          falls: rnd(`rn${i}`) < 0.4 ? 2 : 1, // whole number of falls per period
          offset: rnd(`ro${i}`),
          sway: rndRange(`rw${i}`, 30, 110),
          swayK: 1 + Math.floor(rnd(`rq${i}`) * 2),
          turns: (rnd(`rt${i}`) < 0.5 ? -1 : 1) * (1 + Math.floor(rnd(`ru${i}`) * 2)),
          flipK: 2 + Math.floor(rnd(`rf${i}`) * 3),
          phase: rnd(`rp${i}`) * 6.28,
        };
      }),
    [count],
  );
  const show = ramp(t, from, 1.6, E.linear);
  if (show <= 0) return null;
  const u = t / period;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: show * 0.92 }}>
      {bits.map((b, i) => {
        const f = (((u * b.falls + b.offset) % 1) + 1) % 1;
        const y = -80 + f * (height + 160);
        const x = b.x + Math.sin(u * Math.PI * 2 * b.swayK + b.phase) * b.sway;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: `translate(-50%, -50%) rotate(${u * 360 * b.turns + b.phase * 57}deg) scaleX(${Math.cos(u * Math.PI * 2 * b.flipK + b.phase)})`,
              ...shapeStyle(b.kind, b.size, b.color),
            }}
          />
        );
      })}
    </div>
  );
};

const FlowerHead: React.FC<{ kind: number; size: number }> = ({ kind, size }) => {
  const rings =
    kind === 0
      ? [
          { n: 16, r: 78, w: 30, c: C.marigoldDeep },
          { n: 13, r: 56, w: 27, c: C.marigold },
          { n: 10, r: 36, w: 23, c: '#FFB800' },
        ]
      : kind === 1
        ? [
            { n: 11, r: 76, w: 36, c: C.roseDeep },
            { n: 9, r: 54, w: 32, c: C.rose },
            { n: 6, r: 32, w: 26, c: '#F783AC' },
          ]
        : [{ n: 6, r: 70, w: 34, c: C.jasmine }];
  return (
    <svg width={size} height={size} viewBox="-100 -100 200 200" style={{ overflow: 'visible', display: 'block' }}>
      {rings.map((ring, ri) =>
        Array.from({ length: ring.n }).map((_, i) => (
          <ellipse
            key={`${ri}-${i}`}
            cx="0"
            cy={-ring.r * 0.62}
            rx={ring.w * 0.5}
            ry={ring.r * 0.5}
            fill={ring.c}
            stroke="rgba(0,0,0,0.07)"
            strokeWidth="1.5"
            transform={`rotate(${(360 / ring.n) * i + ri * 11})`}
          />
        )),
      )}
      <circle r={kind === 2 ? 15 : 13} fill={kind === 2 ? '#FFC94A' : kind === 0 ? '#FFD43B' : '#FFA8C5'} />
    </svg>
  );
};

/** Whole flowers that pop open around the frame as the launch lands, then drift down and away. */
export const Flowers: React.FC<{ at: number; count?: number }> = ({ at, count = 16 }) => {
  const { t } = useT();
  const blooms = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => {
        // keep the middle clear for the logo
        const side = i % 2 === 0;
        const x = side ? rndRange(`fx${i}`, 60, 620) : rndRange(`fx${i}`, 1300, 1860);
        return {
          x,
          y: rndRange(`fy${i}`, 90, 990),
          size: rndRange(`fs${i}`, 120, 250),
          kind: Math.floor(rnd(`fk${i}`) * 3),
          delay: rnd(`fd${i}`) * 0.85,
          rot: rndRange(`fr${i}`, -60, 60),
          drift: rndRange(`fg${i}`, 0.7, 1.4),
        };
      }),
    [count],
  );
  const tau0 = t - at;
  if (tau0 < 0 || tau0 > 6) return null;
  return (
    <>
      {blooms.map((b, i) => {
        const tau = tau0 - b.delay;
        if (tau < 0) return null;
        const open = ramp(tau, 0, 0.55, E.back);
        const fall = Math.max(0, tau - 1.5);
        const gone = ramp(tau, 2.6, 1.5, E.in);
        if (gone >= 1) return null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: b.x,
              top: b.y + fall * fall * 150 * b.drift,
              transform: `translate(-50%, -50%) rotate(${b.rot + tau * 26}deg) scale(${open})`,
              opacity: 1 - gone,
              filter: 'drop-shadow(0 16px 20px rgba(60,30,0,0.22))',
            }}
          >
            <FlowerHead kind={b.kind} size={b.size} />
          </div>
        );
      })}
    </>
  );
};
