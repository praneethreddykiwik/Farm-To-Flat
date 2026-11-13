/**
 * Where things are, and which "area" a request belongs to. Pure functions — no store, no database —
 * so the rules below can be read and tested on their own.
 *
 * Two jobs:
 *   1. Is this point inside a community we serve? (a circle round the community's gate)
 *   2. If not, which AREA is it in — so that ten requests from the same neighbourhood add up to one
 *      row an operator can act on, rather than ten rows of coordinates.
 */

/** How far from its pin a community reaches when the operator has not said otherwise. */
export const DEFAULT_RADIUS_M = 600;
export const MIN_RADIUS_M = 100;
export const MAX_RADIUS_M = 5000;

const EARTH_M = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

/** A usable coordinate pair — numbers, in range, and not the 0,0 a failed GPS fix reports. */
export function isLatLng(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * Great-circle distance in metres.
 *
 * NOT `Math.hypot` on the raw degrees, which is what the address check did: a degree of longitude
 * is about 106 km at Hyderabad and 111 km of latitude, so "0.02 degrees" is an ellipse, not a
 * circle, and nobody can reason about how big it is.
 */
export function haversineM(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Round to `dp` decimal places. 2 dp is about 1.1 km, 3 dp about 110 m. */
export const roundTo = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;

/** A community's circle, or null when it has no pin. */
export function communityGeo(c) {
  if (!c || !isLatLng(c.lat, c.lng)) return null;
  const r = Number(c.radiusM);
  return {
    lat: c.lat,
    lng: c.lng,
    radiusM: Number.isFinite(r) && r > 0 ? Math.round(r) : DEFAULT_RADIUS_M,
  };
}

/**
 * The served community this point falls inside — the nearest, when circles overlap. Paused
 * communities do not count: we do not deliver there today.
 * @returns {{ community: any, distanceM: number } | null}
 */
export function servingCommunity(communities, lat, lng) {
  if (!isLatLng(lat, lng)) return null;
  let best = null;
  for (const c of communities || []) {
    if (c.isActive === false) continue;
    const g = communityGeo(c);
    if (!g) continue;
    const d = haversineM(lat, lng, g.lat, g.lng);
    if (d <= g.radiusM && (!best || d < best.distanceM)) best = { community: c, distanceM: d };
  }
  return best;
}

/**
 * The closest served community to a point, however far — the operator's "how much further is this
 * than where the van already goes".
 * @returns {{ communityId: string, name: string, distanceKm: number } | null}
 */
export function nearestCommunity(communities, lat, lng) {
  if (!isLatLng(lat, lng)) return null;
  let best = null;
  for (const c of communities || []) {
    if (c.isActive === false) continue;
    const g = communityGeo(c);
    if (!g) continue;
    const d = haversineM(lat, lng, g.lat, g.lng);
    if (!best || d < best.d) best = { c, d };
  }
  return best
    ? { communityId: best.c.id, name: best.c.name, distanceKm: roundTo(best.d / 1000, 1) }
    : null;
}

const clean = (s, max = 80) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** "My Home  Bhooja!" → "my-home-bhooja". Used only inside keys, never shown. */
export const slug = (s) =>
  clean(s, 60)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Which area a request belongs to, and what to call it.
 *
 * PIN code first: it is how people in India already name where they live, it is stable, and two
 * phones a street apart report the same one. Without a PIN, the 2-decimal grid cell the point falls
 * in (about a kilometre square). Without a location at all — someone who typed "my community is
 * not listed" — the locality they typed, and failing that the community name itself.
 *
 * @param {{ lat?: number, lng?: number, pincode?: string|null, locality?: string|null,
 *           city?: string|null, communityName?: string|null }} p
 * @returns {{ key: string, label: string } | null} null when there is nothing to go on
 */
export function areaFor(p) {
  const pincode = /^\d{6}$/.test(String(p.pincode || '')) ? String(p.pincode) : null;
  const locality = clean(p.locality);
  const city = clean(p.city);
  const place = locality || city;
  if (pincode) return { key: `pin:${pincode}`, label: place ? `${place} · ${pincode}` : pincode };
  if (isLatLng(p.lat, p.lng)) {
    const la = roundTo(p.lat, 2).toFixed(2);
    const ln = roundTo(p.lng, 2).toFixed(2);
    return { key: `g:${la},${ln}`, label: place || `Near ${la}, ${ln}` };
  }
  if (place && slug(place)) return { key: `loc:${slug(place)}`, label: place };
  const name = clean(p.communityName);
  if (name && slug(name)) return { key: `name:${slug(name)}`, label: `${name} · area not given` };
  return null;
}
