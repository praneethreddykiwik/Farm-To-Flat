/**
 * Error tracking.
 *
 * Until now the only way we learned something had broken in production was a customer saying so,
 * or someone happening to read Render's logs — which are ephemeral on the free plan, so by the
 * time you went looking the evidence was often gone.
 *
 * Two things this file takes seriously:
 *
 * 1. **It must never send personal data.** We handle names, phone numbers, flat numbers and
 *    delivery addresses. Under the DPDP Act those are personal data and a third-party error
 *    tracker is a processor; the cheapest way to stay on the right side of that is to not send
 *    them at all. `sendDefaultPii` is off, and `beforeSend` strips request bodies, query strings,
 *    cookies and auth headers before anything leaves the process.
 *
 * 2. **It must be inert without a DSN.** Local development, tests and anyone running this without
 *    a Sentry account should see exactly the behaviour they had before — no network calls, no
 *    warnings, no init. Every function here is a no-op when SENTRY_DSN is unset.
 */
import * as Sentry from '@sentry/node';
import { IS_PROD, IS_TEST } from './env.js';

const DSN = process.env.SENTRY_DSN;
export const sentryEnabled = !!DSN && !IS_TEST;

/** Header and body keys that must never leave this process. Mirrors the pino redact list. */
const SECRET_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-admin-token',
  'x-admin-session',
  'x-razorpay-signature',
  'password',
  'otp',
  'imagebase64',
  'database64',
  'razorpaysignature',
]);

/** Recursively drop anything secret or personal. Returns a shallow, safe copy. */
function scrub(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return `[array of ${value.length}]`;
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEYS.has(k.toLowerCase()) ? '[redacted]' : scrub(v, depth + 1);
  }
  return out;
}

export function initSentry() {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV || (IS_PROD ? 'production' : 'development'),
    // Which commit is actually serving. Without this a stack trace points at a line number in a
    // file that has since changed, which is worse than no stack trace because it misleads.
    release: process.env.RENDER_GIT_COMMIT?.slice(0, 8) || undefined,
    // Never attach the user's IP, cookies or headers automatically.
    sendDefaultPii: false,
    // Performance data is useful but it is the thing that silently costs money at volume. 10% is
    // plenty to see a slow endpoint; turn it up deliberately when chasing something.
    tracesSampleRate: IS_PROD ? 0.1 : 0,
    beforeSend(event) {
      // The request is the likeliest place for a phone number or an address to hitch a ride.
      if (event.request) {
        delete event.request.cookies;
        delete event.request.query_string;
        event.request.data = '[stripped]';
        if (event.request.headers) event.request.headers = scrub(event.request.headers);
      }
      // We never identify a user to a third party. The order number in the message is enough to
      // find them in our own system, and it means nothing to anyone else.
      delete event.user;
      if (event.contexts) event.contexts = scrub(event.contexts);
      return event;
    },
  });
}

/**
 * Report an error that we handled but still want to know about.
 * @param {unknown} err
 * @param {Record<string, any>} [tags] small, non-personal labels — order number, route, outcome
 */
export function reportError(err, tags) {
  if (!sentryEnabled) return;
  Sentry.withScope((s) => {
    if (tags) for (const [k, v] of Object.entries(tags)) s.setTag(k, String(v));
    Sentry.captureException(err);
  });
}

/** Flush pending events before the process exits, so a crash report is not lost with it. */
export async function flushSentry(ms = 2000) {
  if (!sentryEnabled) return;
  try {
    await Sentry.flush(ms);
  } catch {
    /* never let telemetry delay a shutdown */
  }
}

export { Sentry };
