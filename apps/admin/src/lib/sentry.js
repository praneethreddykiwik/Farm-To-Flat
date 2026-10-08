/**
 * Error tracking for the operator console.
 *
 * This surface shows customer names, phone numbers and flat numbers on every screen, and it is
 * the place refunds are issued from. So the rules are stricter than they would be for a marketing
 * site: no breadcrumbs carrying DOM text, no request bodies, no session replay, no user identity.
 * We want to know that a screen threw, and where — not what was on it.
 *
 * Inert without VITE_SENTRY_DSN, so local development and anyone building this without a Sentry
 * account behaves exactly as before.
 */
import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN;
export const sentryEnabled = !!DSN;

export function initSentry() {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // Vercel exposes the deploy's commit. Without a release, a stack trace points at a line in a
    // bundle that no longer exists.
    release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || undefined,
    sendDefaultPii: false,
    initialScope: { tags: { service: 'admin' } },
    // Deliberately NOT enabling Session Replay. It would record a video of a screen full of
    // customers' names, phones and addresses and send it to a third party.
    integrations: [],
    tracesSampleRate: 0,
    beforeBreadcrumb(crumb) {
      // A UI breadcrumb carries the text of whatever was clicked — on this console that is often
      // a customer's name or an order they are about to refund. The fact that a click happened is
      // useful; the label is not worth the exposure.
      if (crumb.category === 'ui.click' || crumb.category === 'ui.input') {
        return { ...crumb, message: '[ui interaction]', data: undefined };
      }
      // A fetch breadcrumb's URL carries order ids and search queries (which are phone numbers,
      // routinely). Keep the path, drop the rest.
      if (crumb.category === 'fetch' || crumb.category === 'xhr') {
        const url = crumb.data?.url;
        if (typeof url === 'string') {
          const path = url.split('?')[0];
          return { ...crumb, data: { ...crumb.data, url: path } };
        }
      }
      return crumb;
    },
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.cookies;
        delete event.request.query_string;
        delete event.request.data;
      }
      return event;
    },
  });
}

/** @param {unknown} err @param {Record<string, any>} [tags] */
export function reportError(err, tags) {
  if (!sentryEnabled) return;
  Sentry.withScope((s) => {
    if (tags) for (const [k, v] of Object.entries(tags)) s.setTag(k, String(v));
    Sentry.captureException(err);
  });
}

export { Sentry };
