/**
 * Countdown maths for "Order in 59:59" (review #48, 21 Nov 2026).
 *
 * The countdown used to subtract one from a counter on every interval tick. Timers are throttled
 * and paused while the app is in the background or the phone is busy, so the figure fell behind
 * the clock — come back after ten minutes away and it still showed the old time. Now the server's
 * snapshot is turned into a deadline once, and every tick reads the clock against it.
 */

/**
 * @param {number} secondsUntil  the server's snapshot
 * @param {number} nowMs         when that snapshot is being anchored
 */
export function deadlineFrom(secondsUntil, nowMs) {
  return nowMs + Math.max(0, Number(secondsUntil) || 0) * 1000;
}

/** Whole seconds left until `deadlineMs`, never negative. */
export function secondsLeft(deadlineMs, nowMs) {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}
