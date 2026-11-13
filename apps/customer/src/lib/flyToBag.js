/**
 * The wiring for "the thing you added flies into your basket".
 *
 * Three parties that never import each other:
 *   - whoever shows a basket (the tab bar, the floating basket bar, the product page's button) says
 *     WHERE it is on screen;
 *   - whoever adds something (a product card, the product page) says WHAT left and from where;
 *   - one host at the root of the app draws the flight.
 *
 * It is a plain module rather than store state on purpose: positions change on layout and flights
 * start on every tap, and neither should re-render anything.
 */

/** @typedef {{ x: number, y: number }} Point  window coordinates, the centre of the thing */

/** @type {Map<string, { point: Point, priority: number, at: number }>} */
const targets = new Map();
let order = 0;
/** @type {null | ((flight: any) => void)} */
let host = null;
/** The least time between two flights setting off. */
export const MIN_GAP_MS = 280;
let lastFlightAt = 0;

/**
 * Say where a basket is, or (with `null`) that it has gone.
 * The highest priority wins; between equals, whichever spoke last — so a screen pushed over another
 * takes over, and hands back when it leaves.
 * @param {string} key  one per on-screen basket
 * @param {Point|null} point
 * @param {number} [priority]  0 tab bar · 1 floating basket bar · 2 a screen's own basket button
 */
export function setBagTarget(key, point, priority = 0) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    targets.delete(key);
    return;
  }
  targets.set(key, { point, priority, at: ++order });
}

/** Where a flight should land right now, or null if nothing on screen shows the basket. */
export function bagTarget() {
  let best = null;
  for (const t of targets.values()) {
    if (!best || t.priority > best.priority || (t.priority === best.priority && t.at > best.at))
      best = t;
  }
  return best ? best.point : null;
}

/** True when a host is mounted to draw flights — and so to bounce the basket when one lands. */
export const canFly = () => !!host;

/**
 * Send something to the basket.
 * @param {{ from: Point, uri?: string|null, blurhash?: string|null, tint?: string, name?: string, renderWidth?: number }} flight
 *   `renderWidth`: the width the source drew its photo at, so the flight reuses that bitmap.
 */
export function flyToBag(flight) {
  if (!host || !flight?.from) return false;
  // One photo in the air says "added". A volley of them, one for each of a run of quick taps, says
  // nothing more, and costs the frames those taps need to register.
  const now = Date.now();
  if (now - lastFlightAt < MIN_GAP_MS) return false;
  lastFlightAt = now;
  host(flight);
  return true;
}

/** The root host registers itself here. One at a time; the last to mount draws. */
export function onFly(fn) {
  host = fn;
  return () => {
    if (host === fn) host = null;
  };
}

/** Test seam. */
export function _resetFlights() {
  targets.clear();
  order = 0;
  host = null;
  lastFlightAt = 0;
}
