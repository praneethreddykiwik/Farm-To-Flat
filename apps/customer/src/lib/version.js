/**
 * Is this app older than the oldest version the server still allows? (review #45, 21 Nov 2026)
 * Plain x.y.z comparison; anything unreadable never blocks.
 */
export function isBelow(current, minimum) {
  const parse = (v) =>
    /^\d+\.\d+\.\d+$/.test(String(v || '')) ? String(v).split('.').map(Number) : null;
  const a = parse(current);
  const b = parse(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
