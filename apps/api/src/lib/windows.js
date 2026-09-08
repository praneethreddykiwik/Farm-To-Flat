/**
 * Delivery-window generation. 14 days out from a start date, restricted to each community's
 * delivery weekdays, two windows a day (MORNING / EVENING), with capacity and a cut-off.
 *
 * `remaining` = capacity − real bookings − a stable pseudo-load so the schedule looks lived-in
 * without being random on every request (the mock used Math.random; the admin panel needs a
 * stable view to trust). The Prisma build replaces the pseudo-load with real counts.
 */
import { addDaysISO, todayISO, weekdayOf } from './dates.js';

/** deterministic 0..1 hash from a string */
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

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
      const pseudo = Math.floor(
        hash01(`${community.id}|${d}|${w}`) * (community.windowCapacity * 0.7),
      );
      const remaining = Math.max(0, community.windowCapacity - booked - pseudo);
      const isToday = d === today;
      out.push({
        id: `win_${community.id}_${d}_${w}`,
        date: d,
        window: w,
        capacity: community.windowCapacity,
        booked: booked + pseudo,
        remaining,
        isOpen: !isToday && remaining > 0,
        cutoffAt: `${addDaysISO(d, -1)}T20:00:00+05:30`,
      });
    }
  }
  return out;
}
