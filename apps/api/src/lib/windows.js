/**
 * Delivery-window generation. 14 days out from a start date, restricted to each community's
 * delivery weekdays, and — for each of those days — one entry per window the community defines.
 *
 * WINDOWS ARE A LIST, NOT A PAIR. A community used to have exactly two, MORNING and EVENING, each
 * with its own column. It now carries `windows: [{ key, label, cutoff, start, end }, …]`, so an
 * operator can add an afternoon run, drop the evening one for a community that only delivers at
 * dawn, or rename what the customer sees — without a schema change or a deploy.
 *
 * `key` is the identity. It is what an ORDER stores, so it must never change once orders exist
 * against it: the admin edits the label, and the key is derived from the label only at the moment a
 * window is first created. Deleting a window does not rewrite history — old orders keep their key
 * and still display, they simply stop being offered.
 *
 * Ordering is gated by a per-window CUT-OFF TIME, not by a capacity count. Each window sets a
 * same-day clock time (e.g. 03:45 IST for the 6–12 run — late enough for a customer to order fresh,
 * early enough for the farm to procure and pack). A window is open until that instant passes; there
 * is no other limit on how many orders it can hold.
 *
 * THE CUT-OFF IS THE ONLY DEADLINE. Each window closes at its own configured time on its own
 * delivery day, so two windows on the same day have DIFFERENT deadlines and therefore different
 * countdowns — "order by 03:45 for the 6–12 run, by 15:00 for the 17–21 run".
 *
 * HOW SOON A SLOT MAY BE is a separate question from WHEN IT CLOSES, and conflating the two broke
 * this twice. `orderLeadDays` (default 1) decides how far ahead the earliest deliverable day is —
 * with 1, ordering today reaches tomorrow at the soonest, which is what the farm needs to harvest
 * against real orders. The cut-off time still belongs to the delivery day itself, so each window
 * keeps its OWN deadline and its own countdown.
 *
 * An earlier attempt expressed the lead as a midnight deadline instead. Because midnight is always
 * earlier than any cut-off it became the binding deadline for every window, collapsing them onto
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
 * @typedef {object} WindowDef
 * @property {string} key      immutable identity; what an order stores
 * @property {string} label    what the customer is shown
 * @property {string} cutoff   "HH:MM" IST — orders close at this time on the delivery day
 * @property {string} start    "HH:MM" IST — when the delivery run begins
 * @property {string} end      "HH:MM" IST — when it ends
 */

/** @type {WindowDef[]} The two windows every community had before they became editable. */
export const LEGACY_WINDOWS = [
  { key: 'MORNING', label: 'Morning', cutoff: '03:45', start: '06:00', end: '12:00' },
  { key: 'EVENING', label: 'Evening', cutoff: '15:00', start: '17:00', end: '21:00' },
];

const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * "06:00" → 360. Used only for ordering windows within a day and picking an icon.
 * @param {string} t
 * @returns {number}
 */
export const minutesOfClock = (t) => {
  if (!CLOCK_RE.test(String(t || ''))) return 0;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};

/**
 * "17:00" → "5:00 pm". The display form the app shows under a window's name.
 * @param {string} t
 */
function clock12(t) {
  const mins = minutesOfClock(t);
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

/**
 * "6:00 am – 12:00 pm" — what a customer reads under the window's name.
 * @param {{start?: string, end?: string}} w
 */
export const hoursLabel = (w) =>
  w.start && w.end ? `${clock12(w.start)} – ${clock12(w.end)}` : '';

/**
 * A label the operator typed → the immutable key an order will store. Uppercase, underscores, no
 * punctuation: "Late night" → LATE_NIGHT. Matches the shape of the original MORNING/EVENING keys,
 * which is what lets an old client title-case an unknown key and still show something sensible.
 * @param {string} label
 * @param {string[]} [taken]  keys already used in this community, so the result is unique
 * @returns {string}
 */
export function keyFromLabel(label, taken = []) {
  const base =
    String(label || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'WINDOW';
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 100; i += 1) if (!taken.includes(`${base}_${i}`)) return `${base}_${i}`;
  return `${base}_${Date.now()}`;
}

/**
 * The community's windows, whatever vintage the record is.
 *
 * A community stored before windows were editable has no `windows` array — only the old
 * `morningCutoff` / `eveningCutoff` columns. Rather than migrate every row (and break a rollback),
 * those two columns are read here and presented as the same two-window list they always described.
 * Everything downstream sees one shape.
 *
 * @param {any} community
 * @returns {Array<WindowDef & {hours: string}>} sorted by start time, so "the day's windows in
 *   order" is true by construction.
 */
export function communityWindows(community) {
  /** @type {any[]|null} */
  const stored = Array.isArray(community?.windows) ? community.windows : null;
  const list =
    stored && stored.length
      ? stored
      : LEGACY_WINDOWS.map((w) => ({
          ...w,
          cutoff:
            (w.key === 'MORNING' ? community?.morningCutoff : community?.eveningCutoff) || w.cutoff,
        }));
  return list
    .filter((/** @type {any} */ w) => w && w.key)
    .map((/** @type {any} */ w) => ({
      key: String(w.key),
      label: w.label || String(w.key),
      cutoff: CLOCK_RE.test(w.cutoff || '') ? w.cutoff : '03:45',
      start: CLOCK_RE.test(w.start || '') ? w.start : '06:00',
      end: CLOCK_RE.test(w.end || '') ? w.end : '12:00',
    }))
    .map((/** @type {any} */ w) => ({ ...w, hours: hoursLabel(w) }))
    .sort(
      (/** @type {any} */ a, /** @type {any} */ b) =>
        minutesOfClock(a.start) - minutesOfClock(b.start),
    );
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
  const defs = communityWindows(community);
  const warningMs = (community.cutoffWarningMinutes ?? 15) * 60 * 1000;
  // The soonest day an order placed now may be delivered. 0 means same-day is allowed.
  const lead = Math.max(0, Number(community.orderLeadDays ?? 1));
  const earliest = addDaysISO(fromDate, lead);
  for (let i = 0; i < 14 + lead; i += 1) {
    const d = addDaysISO(fromDate, i);
    if (d < earliest) continue;
    if (!community.deliveryDays.includes(weekdayOf(d))) continue;
    for (const def of defs) {
      // The last instant an order may be placed for this window: its own configured cut-off clock
      // time, on the delivery day itself.
      const closesAt = istInstantMs(d, def.cutoff);
      const msLeft = closesAt - now;
      const isOpen = msLeft > 0;
      out.push({
        id: `win_${community.id}_${d}_${def.key}`,
        date: d,
        window: def.key,
        // Carried so the app renders whatever the operator named this window, rather than looking
        // it up in a two-entry table it shipped with.
        label: def.label,
        hours: def.hours,
        start: def.start,
        end: def.end,
        booked: bookedFor(community.id, d, def.key), // informational only — never gates ordering
        isOpen,
        // A window is now only ever shut for one reason: its cut-off passed. Kept as a field so
        // existing clients that read it don't see `undefined`.
        tooSoon: false,
        cutoffAt: new Date(closesAt).toISOString(),
        // Same instant as `cutoffAt` now that the cut-off is the only deadline; kept separate
        // because the admin schedule labels it as the operator's configured harvest time.
        harvestCutoffAt: new Date(closesAt).toISOString(),
        secondsUntilCutoff: isOpen ? Math.round(msLeft / 1000) : 0,
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
