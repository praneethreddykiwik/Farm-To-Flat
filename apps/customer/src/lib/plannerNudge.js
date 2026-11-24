/**
 * "Have you tried the meal planner?" (Discussion on Fooducia Strategies, 22 Nov 2026).
 *
 * A card on Home with a Try it button, and — if the phone allows notifications — one quiet reminder
 * with the same button. Only for people who can open the planner (super admin today; see
 * selectAiVisible), only until they have made a plan, and never more than once a week after
 * "Not now": repeated prompting is the "nagging" dark pattern under the CCPA guidelines.
 *
 * Pure: no React Native imports, so the rules are tested.
 */
export const SNOOZE_DAYS = 7;
export const PLANNER_NUDGE_ID = 'planner_nudge';
const DAY = 864e5;
const IST_OFFSET_MS = 330 * 60000;

/** Has this person used the planner? A draft or anything on the calendar counts. */
export const hasTriedPlanner = ({ draft, scheduled }) => !!draft || (scheduled || []).length > 0;

/** @param {{ visible: boolean, tried: boolean, snoozedUntil?: number|null, now: number }} s */
export function shouldShowNudge({ visible, tried, snoozedUntil, now }) {
  return !!visible && !tried && !(snoozedUntil && now < snoozedUntil);
}

export const snoozeUntil = (now) => now + SNOOZE_DAYS * DAY;

/**
 * When the one reminder should fire: 4:30 PM IST two days from now, or two days after the snooze
 * ends. Tea time, well before the 5:30 PM cut-off, never at night.
 */
export function nudgeInstant({ now, snoozedUntil }) {
  const from = Math.max(now, snoozedUntil || 0) + 2 * DAY;
  const ist = new Date(from + IST_OFFSET_MS);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 16, 30) - IST_OFFSET_MS,
  );
}
