import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill } from 'remotion';

// Fixed film grain, drawn once into a half-resolution canvas from a seeded generator, so every
// render is identical. It is painted synchronously before the first frame is shown — unlike a CSS
// background image, which the renderer cannot wait for — and costs nothing per frame afterwards.
const GRAIN_W = 960;
const GRAIN_H = 540;

export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.07 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(GRAIN_W, GRAIN_H);
    let s = 1234567;
    for (let i = 0; i < GRAIN_W * GRAIN_H; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const v = (s >>> 24) & 255;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, []);
  return (
    <canvas
      ref={ref}
      width={GRAIN_W}
      height={GRAIN_H}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity,
        mixBlendMode: 'overlay',
        pointerEvents: 'none',
      }}
    />
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.5 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 90% 85% at 50% 50%, rgba(0,0,0,0) 58%, rgba(0,0,0,${strength}) 100%)`,
      pointerEvents: 'none',
    }}
  />
);

type StageProps = {
  readonly background: string;
  readonly children: React.ReactNode;
  readonly grain?: number;
  readonly vignette?: number;
  /** A slow, constant camera push so no frame is ever perfectly still. */
  readonly push?: number;
};

export const Stage: React.FC<StageProps> = ({
  background,
  children,
  grain = 0.07,
  vignette = 0.45,
  push = 1,
}) => (
  <AbsoluteFill style={{ background, overflow: 'hidden' }}>
    <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: '50% 55%' }}>
      {children}
    </AbsoluteFill>
    {vignette > 0 ? <Vignette strength={vignette} /> : null}
    {grain > 0 ? <Grain opacity={grain} /> : null}
  </AbsoluteFill>
);
