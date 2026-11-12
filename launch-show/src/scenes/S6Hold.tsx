import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, EMBER, F } from '../brand';
import { S6 as COPY } from '../copy';
import { E, ramp, useT, wave } from '../lib/anim';
import { Grain } from '../components/Stage';

export const S6_INTRO = 1.5;
export const S6_LOOP = 6;

export const HOLD_BG = '#020806';
export const SEED = { x: 960, y: 500 };

/** The quiet before it — one ember seed in the dark, breathing. Shared with the launch's first frames. */
export const Seed: React.FC<{ scale?: number; glow?: number; rings?: boolean }> = ({ scale = 1, glow = 1, rings = true }) => {
  const { t } = useT();
  const breath = 1 + wave(t, 3) * 0.12;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: SEED.x - 520,
          top: SEED.y - 520,
          width: 1040,
          height: 1040,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(250,188,21,0.16) 0%, rgba(244,128,31,0.06) 34%, rgba(0,0,0,0) 62%)',
          transform: `scale(${breath * glow})`,
        }}
      />
      {rings
        ? [0, 1].map((r) => {
            const f = (((t / 3 + r * 0.5) % 1) + 1) % 1;
            return (
              <div
                key={r}
                style={{
                  position: 'absolute',
                  left: SEED.x - 230,
                  top: SEED.y - 230,
                  width: 460,
                  height: 460,
                  borderRadius: '50%',
                  border: `2px solid ${C.emberA}`,
                  transform: `scale(${0.08 + f * 0.92})`,
                  opacity: (1 - f) * 0.5 * glow,
                }}
              />
            );
          })
        : null}
      <div
        style={{
          position: 'absolute',
          left: SEED.x - 22,
          top: SEED.y - 22,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: EMBER,
          transform: `scale(${breath * scale})`,
          boxShadow: '0 0 40px 10px rgba(250,188,21,0.55), 0 0 110px 34px rgba(244,128,31,0.3)',
        }}
      />
    </>
  );
};

/** Slide 6 — the hold. Nothing on screen but a seed and one instruction, for one person. */
export const S6Hold: React.FC = () => {
  const { t } = useT();
  const inn = ramp(t, 0.1, 1.3, E.out);
  return (
    <AbsoluteFill style={{ background: HOLD_BG }}>
      <AbsoluteFill style={{ opacity: inn }}>
        <Seed />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 800,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 26,
            fontFamily: F.mono,
            fontWeight: 500,
            fontSize: 34,
            letterSpacing: '0.24em',
            color: C.cream,
            opacity: 0.5 + 0.28 * (0.5 + 0.5 * wave(t, 3)),
          }}
        >
          <span
            style={{
              display: 'inline-grid',
              placeItems: 'center',
              width: 96,
              height: 64,
              borderRadius: 14,
              border: `3px solid ${C.cream}`,
              fontSize: 34,
              letterSpacing: 0,
            }}
          >
            ⏎
          </span>
          {COPY.prompt}
        </div>
      </AbsoluteFill>
      <Grain opacity={0.05} />
    </AbsoluteFill>
  );
};
