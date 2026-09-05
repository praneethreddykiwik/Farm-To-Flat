/**
 * Dates are always Asia/Kolkata. The device may be anywhere; delivery windows are not.
 * Kept dependency-free: Intl with a fixed timeZone is enough for P1 display needs.
 */
export const TZ = 'Asia/Kolkata';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "2026-09-05" → Date at noon IST (avoids DST/offset edge cases on either side) */
export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 6, 30)); // 12:00 IST
}

/** @param {Date} date */
export function toISODate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function todayISO() {
  return toISODate(new Date());
}

/** @param {string} iso @param {number} days */
export function addDaysISO(iso, days) {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/** Weekday index 0..6 in IST for an ISO date */
export function weekdayOf(iso) {
  return parseISODate(iso).getUTCDay();
}

export function dayShort(iso) {
  return DAY_SHORT[weekdayOf(iso)];
}

export function dayNumber(iso) {
  return Number(iso.slice(8, 10));
}

export function monthShort(iso) {
  return MONTH_SHORT[Number(iso.slice(5, 7)) - 1];
}

/** "Sat, 6 Sep" */
export function formatDateShort(iso) {
  return `${dayShort(iso)}, ${dayNumber(iso)} ${monthShort(iso)}`;
}

/** Relative label used in window pickers: Today / Tomorrow / Sat 6 */
export function relativeDayLabel(iso) {
  const today = todayISO();
  if (iso === today) return 'Today';
  if (iso === addDaysISO(today, 1)) return 'Tomorrow';
  return `${dayShort(iso)} ${dayNumber(iso)}`;
}

/** @param {string|number|Date} ts */
export function formatDateTime(ts) {
  const d = new Date(ts);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export const WINDOWS = {
  MORNING: { key: 'MORNING', label: 'Morning', hours: '6:00 – 12:00', start: 6, end: 12 },
  EVENING: { key: 'EVENING', label: 'Evening', hours: '5:00 – 9:00 pm', start: 17, end: 21 },
};

/** Greeting by IST hour */
export function greeting() {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hour12: false }).format(
      new Date(),
    ),
  );
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
