/**
 * How long the app takes to start, step by step (21 Nov 2026).
 *
 * The owner saw the opening logo sit on screen, frozen mid-drawing, on a real phone. We could not
 * see why from here: the server answered in a third of a second. So the app now notes when each
 * step of a start-up finishes, and a start-up that takes longer than SLOW_BOOT_MS is reported to
 * the error tracker with those timings — no names, numbers or tokens, just milliseconds and the
 * sign-in state — so the next slow start on a customer's phone tells us where the time went.
 *
 * Pure apart from the clock, so it can be tested.
 */

/**
 * The longest the opening logo waits, once drawn, for the app behind it (21 Nov 2026). It used to
 * wait for as long as signing in took, so on a slow connection the logo simply sat there and looked
 * frozen. Now it steps aside and the app shows its own "reconnecting" state instead.
 */
export const MAX_HOLD_MS = 2500;

/** A start-up longer than this is worth a report. */
export const SLOW_BOOT_MS = 5000;

const T0 = Date.now();
/** @type {Record<string, number>} */
const marks = {};

/** Record that a step finished, once, as milliseconds since the app's JavaScript started. */
export function markBoot(step, now = Date.now()) {
  if (marks[step] == null) marks[step] = now - T0;
  return marks[step];
}

/** Everything recorded so far. */
export const bootMarks = () => ({ ...marks });

/**
 * Should this start-up be reported, and with what? Null when it was quick enough.
 * @param {Record<string, number>} m
 * @param {number} [limit]
 */
export function slowBootReport(m, limit = SLOW_BOOT_MS) {
  const total = m.introDone ?? m.ready ?? null;
  if (total == null || total < limit) return null;
  // The slowest step is the likeliest culprit; name it so the report groups usefully.
  const steps = Object.entries(m).filter(([k]) => k !== 'introDone');
  const slowest = steps.sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
  return { total, slowest, marks: m };
}

/** For tests: forget what was recorded. */
export function _resetBoot() {
  for (const k of Object.keys(marks)) delete marks[k];
}
