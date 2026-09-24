/**
 * Delivery-window generation. 14 days out from a start date, restricted to each community's
 * delivery weekdays, two windows a day (MORNING / EVENING).
 *
 * Ordering is gated by a per-window CUT-OFF TIME, not by a capacity count. Each community sets a
 * same-day clock time for each window (e.g. MORNING closes at 03:45 IST, EVENING at 15:00 — late
 * enough for a customer to order fresh, early enough for the farm to actually procure and pack
 * before that window's delivery run) — configurable from the admin panel. A window is open until
 * that instant passes; there is no other limit on how many orders it can hold.
 *
 * THE CUT-OFF IS THE ONLY DEADLINE. Each window closes at its own configured time on its own
 * delivery day, so the morning and evening slots of the same day have DIFFERENT deadlines and
 * therefore different countdowns — "order by 03:45 for the 6–12 run, by 15:00 for the 17–21 run".
 *
 * HOW SOON A SLOT MAY BE is a separate question from WHEN IT CLOSES, and conflating the two broke
 * this twice. `orderLeadDays` (default 1) decides how far ahead the earliest deliverable day is —
 * with 1, ordering today reaches tomorrow at the soonest, which is what the farm needs to harvest
 * against real orders. The cut-off time still belongs to the delivery day itself, so morning and
 * evening keep DIFFERENT deadlines and different countdowns.
 *
 * An earlier attempt expressed the lead as a midnight deadline instead. Because midnight is always
 * earlier than either cut-off it became the binding deadline for both windows, collapsing them onto
 * the same instant — every slot showed an identical countdown and the operator's cut-off times had
 * no effect on ordering at all. Leaving the cut-off where it is and filtering the DATES is what
 * keeps both behaviours intact.
 *
 * Every OPEN window carries `secondsUntilCutoff` and `showCountdown: true`, so the app can show a
 * live "59:59 left to order" timer for the whole time the window is orderable, not only in the
 * final minutes. `isUrgent` marks the last `cutoffWarningMinutes` before the deadline, so the
 * client can turn the same timer red without changing whether it is shown at all.
 */
import { addDaysISO, istInstantMs, todayISO, weekdayOf } from './dates.js';

/**
 * The last instant an order may be placed for window `w` on delivery date `d`: the community's
 * configured cut-off clock time, on the delivery day itself.
 */
function closesAtMs(community, d, w) {
  const cutoffTime = w === 'MORNING' ? community.morningCutoff : community.eveningCutoff;
  return istInstantMs(d, cutoffTime);
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
  // The soonest day an order placed now may be delivered. 0 means same-day is allowed.
  const lead = Math.max(0, Number(community.orderLeadDays ?? 1));
  const earliest = addDaysISO(fromDate, lead);
  for (let i = 0; i < 14 + lead; i += 1) {
    const d = addDaysISO(fromDate, i);
    if (d < earliest) continue;
    if (!community.deliveryDays.includes(weekdayOf(d))) continue;
    for (const w of ['MORNING', 'EVENING']) {
      const closesAt = closesAtMs(community, d, w);
      const msLeft = closesAt - now;
      const isOpen = msLeft > 0;
      const secondsUntilCutoff = isOpen ? Math.round(msLeft / 1000) : 0;
      out.push({
        id: `win_${community.id}_${d}_${w}`,
        date: d,
        window: w,
        booked: bookedFor(community.id, d, w), // informational only — never gates ordering
        isOpen,
        // A window is now only ever shut for one reason: its cut-off passed. Kept as a field so
        // existing clients that read it don't see `undefined`.
        tooSoon: false,
        cutoffAt: new Date(closesAt).toISOString(),
        // Same instant as `cutoffAt` now that the cut-off is the only deadline; kept separate
        // because the admin schedule labels it as the operator's configured harvest time.
        harvestCutoffAt: new Date(closesAt).toISOString(),
        secondsUntilCutoff,
        // Shown for the entire time the window is open — see the countdown note at the top.
        showCountdown: isOpen,
        isUrgent: isOpen && msLeft <= warningMs,
      });
    }
  }
  return out;
}

// Re-exported so callers that only need "is it today" (e.g. display copy) don't need their own
// IST-aware date math.
export { todayISO };
