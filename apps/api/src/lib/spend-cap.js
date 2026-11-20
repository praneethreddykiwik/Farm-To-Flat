/**
 * Daily ceilings on the things that cost money per call (review #32, 21 Nov 2026).
 *
 * Every per-IP and per-number limit can be worked around by someone with enough addresses or
 * numbers; nothing put a ceiling on the TOTAL. A day's WhatsApp code sends and vision/AI calls are
 * now counted, an alert goes to Sentry at 80% of the ceiling, and at the ceiling the call is refused
 * until midnight IST. The ceilings are deliberately far above real use and can be changed without a
 * deploy:
 *   DAILY_OTP_SEND_CAP  (default 3000 WhatsApp/SMS code sends a day)
 *   DAILY_AI_CALL_CAP   (default 2000 vision/planner calls a day)
 *
 * Counts are in memory: a restart starts the day's count again. That errs towards serving
 * customers, and the 80% alert still fires on a real flood.
 */
import { todayISO } from './dates.js';
import { reportError } from './sentry.js';

const DEFAULTS = { otp: 3000, ai: 2000 };
const ENV = { otp: 'DAILY_OTP_SEND_CAP', ai: 'DAILY_AI_CALL_CAP' };

/** kind -> { day, count, warned } */
const counters = new Map();

export function capFor(kind) {
  const v = Number(process.env[ENV[kind]]);
  return Number.isFinite(v) && v > 0 ? v : DEFAULTS[kind];
}

function counter(kind) {
  const day = todayISO();
  let c = counters.get(kind);
  if (!c || c.day !== day) {
    c = { day, count: 0, warned: false };
    counters.set(kind, c);
  }
  return c;
}

/**
 * Take one unit of today's allowance. Returns false when the day's ceiling is reached.
 * @param {'otp'|'ai'} kind
 */
export function takeDaily(kind) {
  const c = counter(kind);
  const cap = capFor(kind);
  if (c.count >= cap) return false;
  c.count += 1;
  if (!c.warned && c.count >= Math.ceil(cap * 0.8)) {
    c.warned = true;
    reportError(new Error(`daily ${kind} spend at 80% of its ceiling (${c.count}/${cap})`), {
      scope: 'spend-cap',
      kind,
    });
  }
  return true;
}

export const dailyUsage = () =>
  Object.fromEntries(
    Object.keys(DEFAULTS).map((k) => [k, { used: counter(k).count, cap: capFor(k) }]),
  );

/** Tests only. */
export function __resetSpend() {
  counters.clear();
}
