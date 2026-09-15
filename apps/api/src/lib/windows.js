/**
 * Delivery-window generation. 14 days out from a start date, restricted to each community's
 * delivery weekdays, two windows a day (MORNING / EVENING), with capacity and a cut-off.
 *
 * `remaining` = capacity − real bookings (live orders for that community/date/window). A demo-era
 * "pseudo-load" used to pre-fill 0–70% of every window with fake bookings and was used for the hard
 * WINDOW_FULL check too — it made a 30-capacity window reject real customers after 10 orders.
 */
import { addDaysISO, todayISO, weekdayOf } from './dates.js';

/**
 * @param {any} community
 * @param {string} fromDate  YYYY-MM-DD
 * @param {(communityId:string,date:string,window:string)=>number} bookedFor
 */
export function generateWindows(community, fromDate, bookedFor) {
  const out = [];
  const today = todayISO();
  for (let i = 0; i < 14; i += 1) {
    const d = addDaysISO(fromDate, i);
    if (!community.deliveryDays.includes(weekdayOf(d))) continue;
    for (const w of ['MORNING', 'EVENING']) {
      const booked = bookedFor(community.id, d, w);
      const remaining = Math.max(0, community.windowCapacity - booked);
      const isToday = d === today;
      out.push({
        id: `win_${community.id}_${d}_${w}`,
        date: d,
        window: w,
        capacity: community.windowCapacity,
        booked,
        remaining,
        isOpen: !isToday && remaining > 0,
        cutoffAt: `${addDaysISO(d, -1)}T20:00:00+05:30`,
      });
    }
  }
  return out;
}
