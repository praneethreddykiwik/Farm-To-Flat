/**
 * The privacy-notice consent the app collects (DPDP Act §6, §9). Must equal NOTICE_VERSION in
 * apps/api/src/lib/consent.js; the server refuses any other version as "notice changed".
 */
export const NOTICE_VERSION = 'privacy-2026-11-21';

/** The boxes ticked on the sign-in screen, carried to the code-check screen. */
let pending = /** @type {{ version: string, adult: boolean } | null} */ (null);
export const setSignupConsent = (v) => {
  pending = v;
};
export const signupConsent = () => pending;
