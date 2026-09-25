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

/**
 * The two windows every community ran before they became operator-editable.
 *
 * This is now only a FALLBACK. A community defines its own list — it may run one window, or add an
 * afternoon one — and the API sends each window's `label` and `hours` alongside its key. Use
 * `windowLabel` / `windowHours` below rather than indexing this directly: they prefer what the
 * server said, fall back to this map for the two familiar keys, and for anything else derive a
 * readable name from the key itself ("LATE_NIGHT" → "Late night"), which is what keeps an app
 * build older than the operator's newest window from rendering a blank.
 */
export const WINDOWS = {
  MORNING: { key: 'MORNING', label: 'Morning', hours: '6:00 – 12:00', start: 6, end: 12 },
  EVENING: { key: 'EVENING', label: 'Evening', hours: '5:00 – 9:00 pm', start: 17, end: 21 },
};

/**
 * What to call a delivery window.
 * @param {string} key      the window key stored on the order, e.g. MORNING, AFTERNOON
 * @param {any} [w]         the window object from the API, when we have one (it carries `label`)
 */
export function windowLabel(key, w) {
  if (w?.label) return w.label;
  if (WINDOWS[key]) return WINDOWS[key].label;
  const s = String(key || '')
    .replace(/_/g, ' ')
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
}

/**
 * The delivery hours to show under a window's name, or '' when we don't know them — which is the
 * case for a past order whose window the operator has since removed. Callers render nothing rather
 * than guessing, because a wrong time at the door is worse than no time.
 */
export function windowHours(key, w) {
  if (w?.hours) return w.hours;
  return WINDOWS[key]?.hours || '';
}

/** An icon bucket for a window, from when it actually starts. '' falls back to the key. */
export function windowIsEarly(key, w) {
  const start = w?.start ? Number(String(w.start).slice(0, 2)) : WINDOWS[key]?.start;
  return start == null ? key === 'MORNING' : start < 15;
}

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
