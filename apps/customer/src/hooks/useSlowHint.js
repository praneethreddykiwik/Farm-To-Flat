import { useEffect, useState } from 'react';

/**
 * True once a request has been running longer than `delayMs`.
 *
 * Why this exists: the API is on Render's free tier, which puts the service to sleep after ~15
 * minutes idle and takes roughly 50 seconds to wake. The app handles that correctly — it waits,
 * retries and keeps the session — but a spinner that turns for 50 seconds with nothing said is
 * indistinguishable from a broken app, and that is exactly what a first-time tester meets.
 *
 * So: say something. The wait is the same length either way; the difference is whether the person
 * holding the phone thinks it is working.
 *
 * @param {boolean} active   whether the request is in flight
 * @param {number} [delayMs] how long to stay quiet first — long enough that a normal ~150ms
 *                           response never flashes the message
 */
export function useSlowHint(active, delayMs = 5000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const t = setTimeout(() => setSlow(true), delayMs);
    // Clearing on the way out, rather than resetting synchronously when `active` is false, keeps the
    // state update out of the effect body — a sync setState there re-renders every caller twice.
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [active, delayMs]);
  return slow;
}

/** The one wording for this, so every screen explains the wait the same way. */
export const WAKING_MESSAGE =
  'Waking up the server — the first request after a quiet spell can take up to a minute.';
