export type Pt = [number, number];

/** Smooth curve through the given points (Catmull-Rom), returned as a dense polyline. */
export const catmull = (pts: Pt[], perSeg = 28): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < perSeg; s++) {
      const u = s / perSeg;
      const u2 = u * u;
      const u3 = u2 * u;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
};

export const polyD = (pts: Pt[]) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

/** Position and heading at a fraction (0–1) of a polyline's length. */
export const along = (pts: Pt[], frac: number): { x: number; y: number; angle: number } => {
  const lens: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = lens[lens.length - 1];
  const target = Math.min(1, Math.max(0, frac)) * total;
  let i = 1;
  while (i < lens.length - 1 && lens[i] < target) i++;
  const seg = lens[i] - lens[i - 1] || 1;
  const u = (target - lens[i - 1]) / seg;
  const a = pts[i - 1];
  const b = pts[i];
  return {
    x: a[0] + (b[0] - a[0]) * u,
    y: a[1] + (b[1] - a[1]) * u,
    angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
  };
};

/** Fraction of the polyline's length at which each original control point sits. */
export const stopFractions = (count: number) => Array.from({ length: count }, (_, i) => i / (count - 1));
