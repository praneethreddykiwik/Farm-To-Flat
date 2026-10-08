/**
 * Crash reporting for the app.
 *
 * This is the surface we were blindest on. A crash on a customer's phone produced no signal at
 * all — they closed the app, and if we were lucky somebody mentioned it. An OTA update that
 * white-screens on launch cannot even be fixed by another OTA, because the app crashes before it
 * can fetch one, so knowing within minutes rather than days is the difference between a rollback
 * and a week of quiet churn.
 *
 * What it must not send: the customer's name, phone, flat or address. Those are on nearly every
 * screen, and under the DPDP Act they are personal data in a third party's hands. Identity is off,
 * breadcrumbs are scrubbed, and nothing carries a request body.
 *
 * Inert without EXPO_PUBLIC_SENTRY_DSN, so Expo Go and anyone building without an account behave
 * exactly as before.
 */
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { env } from './env';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const sentryEnabled = !!DSN && !env.isExpoGo;

export function initSentry() {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: DSN,
    environment: __DEV__ ? 'development' : 'production',
    // Which BUNDLE is running, not just which binary. With over-the-air updates the installed app
    // version is not enough to identify the code — two phones on the same build can be running
    // different JS. This is the only way a stack trace maps back to a commit.
    dist: Constants.expoConfig?.version || undefined,
    sendDefaultPii: false,
    initialScope: { tags: { service: 'app' } },
    // No Session Replay: it would record a screen showing someone's address and send it onward.
    tracesSampleRate: 0,
    beforeBreadcrumb(crumb) {
      // Touch breadcrumbs carry the label of whatever was tapped — product names are fine, but so
      // is the customer's own address on the home screen. Keep that something was tapped.
      if (crumb.category === 'touch') return { ...crumb, message: '[tap]', data: undefined };
      // A request URL carries order ids and search text, and search text here is routinely a
      // phone number. Keep the path, drop the query.
      if (crumb.category === 'xhr' || crumb.category === 'fetch') {
        const url = crumb.data?.url;
        if (typeof url === 'string') {
          return { ...crumb, data: { ...crumb.data, url: url.split('?')[0] } };
        }
      }
      return crumb;
    },
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.data;
        delete event.request.query_string;
        delete event.request.cookies;
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
