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
 * How many days ahead the earliest orderable delivery is.
 *
 * The farm harvests against the night's order list — "picked tonight, at your door by breakfast" —
 * so an order placed today is delivered tomorrow at the earliest. Before this, a midday order could
 * take that same evening's slot, which showed a customer a delivery date of TODAY for produce that
 * had not been picked yet.
 *
 * Today's windows are still generated so the operator's schedule shows the run that is in flight;
 * they simply cannot be ordered into (`isOpen: false`, with `tooSoon` saying why).
 */
export const MIN_LEAD_DAYS = 1;

/**
 * The last instant an order may be placed for delivery date `d`.
 *
 * Two deadlines apply and the earlier one wins:
 *  - the community's configured harvest cut-off, a clock time ON the delivery day (03:45 / 15:00);
 *  - the lead-time boundary — once the delivery day is no longer far enough out, it is closed.
 *
 * With a one-day lead the boundary is midnight at the start of the delivery day, which always falls
 * before that day's 03:45, so in practice the boundary is what binds: orders for Tuesday close at
 * midnight on Monday. That is strictly earlier than the harvest cut-off, so it is operationally
 * safe — and it is the deadline the countdown must count to, otherwise the app would show time
 * remaining against a cut-off the customer can no longer reach.
 */
function closesAtMs(community, d, w) {
  const cutoffTime = w === 'MORNING' ? community.morningCutoff : community.eveningCutoff;
  const harvestCutoff = istInstantMs(d, cutoffTime);
  const leadBoundary = istInstantMs(addDaysISO(d, 1 - MIN_LEAD_DAYS), '00:00');
  return Math.min(harvestCutoff, leadBoundary);
}

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
  const earliest = addDaysISO(todayISO(now), MIN_LEAD_DAYS);
  for (let i = 0; i < 14; i += 1) {
    const d = addDaysISO(fromDate, i);
    if (!community.deliveryDays.includes(weekdayOf(d))) continue;
    for (const w of ['MORNING', 'EVENING']) {
      const cutoffTime = w === 'MORNING' ? community.morningCutoff : community.eveningCutoff;
      const closesAt = closesAtMs(community, d, w);
      const msLeft = closesAt - now;
      const tooSoon = d < earliest;
      const isOpen = msLeft > 0;
      const secondsUntilCutoff = isOpen ? Math.round(msLeft / 1000) : 0;
      out.push({
        id: `win_${community.id}_${d}_${w}`,
        date: d,
        window: w,
        booked: bookedFor(community.id, d, w), // informational only — never gates ordering
        isOpen,
        // Why it is shut, for copy: too close to the delivery day vs. the deadline simply passed.
        tooSoon: !isOpen && tooSoon,
        cutoffAt: new Date(closesAt).toISOString(),
        // The operator's configured harvest time, kept separate from the ordering deadline above.
        harvestCutoffAt: new Date(istInstantMs(d, cutoffTime)).toISOString(),
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
