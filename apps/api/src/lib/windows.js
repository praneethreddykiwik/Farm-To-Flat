/**
 * Delivery-window generation. 14 days out from a start date, restricted to each community's
 * delivery weekdays, two windows a day (MORNING / EVENING).
 *
 * Ordering is gated by a per-window CUT-OFF TIME, not by a capacity count. Each community sets a
 * same-day clock time for each window (e.g. MORNING closes at 03:45 IST — late enough for a
 * customer to order fresh, early enough for the farm to actually procure and pack before the
 * delivery run) — configurable from the admin panel. A window is open until that instant passes;
 * there is no other limit on how many orders it can hold.
 *
 * The last `cutoffWarningMinutes` before the deadline, the window carries `secondsUntilCutoff` and
 * `showCountdown: true` so the app can show a live "12:45 left to order" timer — the exact scenario
 * of a customer trying to order at 3:30 AM for the 03:45 morning cut-off.
 */
import { addDaysISO, istInstantMs, todayISO, weekdayOf } from './dates.js';

/**
 * @param {any} community
 * @param {string} fromDate  YYYY-MM-DD
 * @param {(communityId:string,date:string,window:string)=>number} bookedFor  informational order
 *   count for the admin schedule view — never gates ordering.
 * @param {number} [now]  ms since epoch; injectable for tests, defaults to the real clock.
 */
export function generateWindows(community, fromDate, bookedFor, now = Date.now()) {
  const out = [];
  const warningMs = (community.cutoffWarningMinutes ?? 15) * 60 * 1000;
  for (let i = 0; i < 14; i += 1) {
    const d = addDaysISO(fromDate, i);
    if (!community.deliveryDays.includes(weekdayOf(d))) continue;
    for (const w of ['MORNING', 'EVENING']) {
      const cutoffTime = w === 'MORNING' ? community.morningCutoff : community.eveningCutoff;
      const cutoffAtMs = istInstantMs(d, cutoffTime);
      const msLeft = cutoffAtMs - now;
      const isOpen = msLeft > 0;
      const secondsUntilCutoff = isOpen ? Math.round(msLeft / 1000) : 0;
      out.push({
        id: `win_${community.id}_${d}_${w}`,
        date: d,
        window: w,
        booked: bookedFor(community.id, d, w), // informational only — never gates ordering
        isOpen,
        cutoffAt: new Date(cutoffAtMs).toISOString(),
        secondsUntilCutoff,
        showCountdown: isOpen && msLeft <= warningMs,
      });
    }
  }
  return out;
}

// Re-exported so callers that only need "is it today" (e.g. display copy) don't need their own
// IST-aware date math.
export { todayISO };
