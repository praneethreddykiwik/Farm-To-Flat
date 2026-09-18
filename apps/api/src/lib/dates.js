/**
 * Date helpers pinned to IST (Asia/Kolkata, UTC+5:30). Delivery windows, cut-offs and the
 * "today" boundary are all business-day concepts in IST, never the server's local zone.
 * Dates are handled as plain `YYYY-MM-DD` strings; there is no time-of-day arithmetic here.
 */

const IST_OFFSET_MIN = 5 * 60 + 30;

/** Current business date in IST as `YYYY-MM-DD`. */
export function todayISO() {
  const now = new Date();
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

/** Add `n` days to a `YYYY-MM-DD` string, returning a `YYYY-MM-DD` string. */
export function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** JS weekday for a `YYYY-MM-DD` string: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/**
 * The real UTC instant (ms since epoch) for a given IST wall-clock moment — date `iso`
 * (YYYY-MM-DD) at time `hhmm` ("HH:MM", 24h). Used for order cut-offs: "orders for the Sep 19
 * MORNING window close at 03:45 IST" needs an actual instant to compare "now" against, not just a
 * date. Safe to compare directly with `Date.now()`.
 */
export function istInstantMs(iso, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const midnightIstUtcMs = Date.parse(`${iso}T00:00:00Z`) - IST_OFFSET_MIN * 60 * 1000;
  return midnightIstUtcMs + (h * 60 + m) * 60 * 1000;
}
