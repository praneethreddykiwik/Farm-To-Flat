/**
 * "Am I inside a community we deliver to?" — answered on the phone.
 *
 * The app is handed each community's gate coordinates and a radius (set by the operator in the admin
 * console). The match happens here, so the shopper's position does not have to leave the device to
 * find out. It is only ever sent anywhere when it falls OUTSIDE every community, and then only as a
 * rounded area — see AddressForm.
 *
 * This replaces a table of three hard-coded coordinates keyed by the demo data's ids. Production
 * communities have other ids, so on a real phone the check could never succeed: every customer,
 * including those standing at a gate we serve, was told "we don't deliver here yet".
 */

const EARTH_M = 6371000;
const rad = (deg) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in metres. Plain degree maths is wrong by ~5% in longitude at Hyderabad's
 * latitude, which matters when the whole radius is a few hundred metres.
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 */
export function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const isPoint = (p) =>
  !!p &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lng) <= 180;

/** The radius used when the operator has set coordinates but no radius. */
export const DEFAULT_RADIUS_M = 600;

/**
 * Where a point sits among the communities.
 *
 * `hit` is the community whose radius contains the point — the nearest one, if radii overlap. GPS
 * accuracy is ADDED to the radius (capped, so a wild fix cannot match everything): a phone that
 * reports "within 80 m" of a spot 40 m outside the line is more likely inside than out, and the cost
 * of a wrong yes is only a pre-filled picker the shopper can change.
 *
 * `nearest` is the closest community with coordinates at all, hit or not, so a miss can still say
 * "the nearest one is 3 km away".
 *
 * @param {Array<{ id: string, name: string, area?: string, geo?: { lat: number, lng: number, radiusM?: number }|null }>} communities
 * @param {{ lat: number, lng: number }} point
 * @param {{ accuracyM?: number }} [opts]
 * @returns {{ hit: any|null, nearest: { community: any, distanceM: number }|null, located: number }}
 *   `located` = how many communities have coordinates; 0 means the check cannot say anything.
 */
export function matchCommunity(communities, point, { accuracyM = 0 } = {}) {
  if (!isPoint(point)) return { hit: null, nearest: null, located: 0 };
  const slack = Math.min(Math.max(Number(accuracyM) || 0, 0), 150);
  let hit = null;
  let hitDistance = Infinity;
  let nearest = null;
  let located = 0;
  for (const c of communities || []) {
    if (!isPoint(c?.geo)) continue;
    located += 1;
    const d = distanceM(point, c.geo);
    if (!nearest || d < nearest.distanceM) nearest = { community: c, distanceM: d };
    const radius = Number(c.geo.radiusM) > 0 ? Number(c.geo.radiusM) : DEFAULT_RADIUS_M;
    if (d <= radius + slack && d < hitDistance) {
      hit = c;
      hitDistance = d;
    }
  }
  return { hit, nearest, located };
}

/** 420 → "420 m", 3180 → "3.2 km", 14200 → "14 km". */
export function distanceLabel(metres) {
  if (!Number.isFinite(metres)) return '';
  if (metres < 950) return `${Math.max(50, Math.round(metres / 50) * 50)} m`;
  const km = metres / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

const clean = (s) =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

/**
 * What the platform's reverse geocoder said, reduced to the three things worth keeping. The fields
 * differ by platform and by place — "district" is the neighbourhood on Android and often empty on
 * iOS, where it lands in "subregion" or "name" — so take the most local one that is present.
 * @param {any} g  one result of expo-location's reverseGeocodeAsync
 * @returns {{ locality?: string, city?: string, pincode?: string }}
 */
export function placeFromGeocode(g) {
  if (!g) return {};
  const city = clean(g.city || g.subregion || g.region);
  const locality = clean(g.district || g.subregion || g.street || g.name);
  const pincode = /^\d{6}$/.test(String(g.postalCode || '').trim())
    ? String(g.postalCode).trim()
    : undefined;
  const out = {};
  // A "locality" that is only a plus code or a house number says nothing about the area.
  if (locality && !/^[\dA-Z+]{4,}\+?[\dA-Z]*$/.test(locality) && !/^\d+$/.test(locality))
    out.locality = locality;
  if (city && city !== out.locality) out.city = city;
  if (pincode) out.pincode = pincode;
  return out;
}

/** "Kondapur · 500084", "Kondapur", "Hyderabad · 500084", or null when nothing is known. */
export function placeLabel(place) {
  const name = place?.locality || place?.city;
  const parts = [name, place?.pincode].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
