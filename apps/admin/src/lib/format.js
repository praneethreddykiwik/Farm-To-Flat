/**
 * Display formatters. Money arrives as integer-paise STRINGS from the API and is only ever turned
 * into rupees here, for display — never stored or sent back as a float.
 */

/**
 * "3600" (paise) -> "₹36" ; keeps paise if non-round.
 * @param {number|string} paise
 * @param {{ decimals?: number }} [opts]
 */
export function inr(paise, { decimals } = {}) {
  const n = Number(paise) / 100;
  const d = decimals ?? (Number.isInteger(n) ? 0 : 2);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

/** paise -> rupees number (for chart values / inputs). */
export const toRupees = (paise) => Math.round(Number(paise)) / 100;
/** rupees number/string -> integer paise. */
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-08" -> "Mon 8 Sep" */
export function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
}
/** "2026-09-08" -> "8 Sep" */
export function dayLabel(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
}

export const titleCase = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const UNIT_LABEL = {
  KG: '/kg',
  BUNCH: '/bunch',
  PIECE: '/pc',
  DOZEN: '/dozen',
  PACK: '/pack',
};

/**
 * Input sanitizers — keep bad data out of the admin fields. Money/quantity stay non-negative
 * numeric strings (callers still convert rupees → integer paise on save — never store a float).
 */
/** Strip to digits and cap length — for numeric text inputs (e.g. a mobile number). */
export const digits = (v, max = 10) =>
  String(v ?? '')
    .replace(/\D/g, '')
    .slice(0, max);
/** Valid Indian mobile: 10 digits starting 6–9. */
export const isMobile = (v) => /^[6-9]\d{9}$/.test(String(v || ''));
/** Basic email shape. */
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || ''));
/** Non-negative numeric string: strips junk, blocks negatives, caps at max. integer drops the dot. */
export function num(v, { max = Infinity, integer = false } = {}) {
  let s = String(v ?? '').replace(integer ? /[^\d]/g : /[^\d.]/g, '');
  if (!integer) {
    const [head, ...rest] = s.split('.');
    s = rest.length ? `${head}.${rest.join('')}` : head;
  }
  if (s === '' || s === '.') return s;
  if (Number(s) > max) return String(max);
  return s;
}
/** Trim leading whitespace — for name/label fields (blocks leading-space-only values). */
export const noLead = (v) => String(v ?? '').replace(/^\s+/, '');

/**
 * Read a coordinate pair the way people paste one. Google Maps copies "17.4645, 78.3062"; a
 * spreadsheet gives "17.4645\t78.3062"; someone typing adds brackets or a degree sign. All of those
 * are the same two numbers, so all of them are accepted.
 * @param {string} text
 * @returns {{ lat: number, lng: number } | null} null until it reads as a real place
 */
export function parseLatLng(text) {
  const m = String(text || '')
    .replace(/[()°]/g, ' ')
    .match(/(-?\d{1,3}(?:\.\d+)?)\s*[\s,;]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

/** "17.4645, 78.3062" — five decimals is about a metre, which is more than a gate needs. */
export const latLngText = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number'
    ? `${Number(lat.toFixed(5))}, ${Number(lng.toFixed(5))}`
    : '';

/** A link that opens the point in Google Maps, so a pasted pin can be checked by eye. */
export const mapUrl = (lat, lng) =>
  `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;

/** "3 Oct, 4:05 pm" */
export function dateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}
