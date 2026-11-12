import { Easing, interpolate, interpolateColors, random, useCurrentFrame, useVideoConfig } from 'remotion';

/** Scene clock in seconds. Everything in the show is authored in seconds, never frames. */
export const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { frame, fps, t: frame / fps };
};

export const E = {
  out: Easing.bezier(0.16, 1, 0.3, 1), // expo-out: fast arrival, long settle
  soft: Easing.bezier(0.33, 1, 0.68, 1), // cubic-out
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  back: Easing.bezier(0.34, 1.56, 0.64, 1), // one overshoot
  backSoft: Easing.bezier(0.3, 1.25, 0.6, 1),
  linear: (x: number) => x,
};

/** 0→1 between `start` and `start + dur` seconds, clamped. */
export const ramp = (t: number, start: number, dur: number, ease: (x: number) => number = E.out) =>
  interpolate(t, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });

/** In then out: 1 while present, 0 before and after. */
export const present = (
  t: number,
  inAt: number,
  inDur: number,
  outAt: number,
  outDur: number,
  ease: (x: number) => number = E.out,
) => ramp(t, inAt, inDur, ease) * (1 - ramp(t, outAt, outDur, E.inOut));

export const mix = (a: number, b: number, p: number) => a + (b - a) * p;
export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/** Periodic motion. Use a period that divides the scene's idle loop so the hold loops seamlessly. */
export const wave = (t: number, period: number, phase = 0) =>
  Math.sin((t / period) * Math.PI * 2 + phase);

export const rnd = (seed: string | number) => random(seed);
export const rndRange = (seed: string | number, lo: number, hi: number) => lo + random(seed) * (hi - lo);

export const tint = (p: number, from: string, to: string) =>
  interpolateColors(clamp(p), [0, 1], [from, to]);

/** Multi-stop colour ramp. */
export const tintStops = (p: number, stops: number[], colors: string[]) =>
  interpolateColors(p, stops, colors);

/** Point on a cubic bezier. */
export const bez = (
  p: number,
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): [number, number] => {
  const q = 1 - p;
  const x = q * q * q * a[0] + 3 * q * q * p * b[0] + 3 * q * p * p * c[0] + p * p * p * d[0];
  const y = q * q * q * a[1] + 3 * q * q * p * b[1] + 3 * q * p * p * c[1] + p * p * p * d[1];
  return [x, y];
};
