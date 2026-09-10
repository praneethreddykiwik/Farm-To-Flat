/**
 * Display formatters. Money arrives as integer-paise STRINGS from the API and is only ever turned
 * into rupees here, for display — never stored or sent back as a float.
 */

/** "3600" (paise) -> "₹36" ; keeps paise if non-round. */
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
