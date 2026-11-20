/**
 * Every EXPO_PUBLIC_* variable is inlined into the JavaScript bundle, which anyone can unzip from the
 * APK or pull from the OTA CDN. A name that says KEY / SECRET / TOKEN / PRIVATE is almost always a
 * server credential that was given the prefix to "make it work" — and then shipped to every phone.
 *
 * Why this exists (review #53, 21 Nov 2026): neither preflight looked at names at all, so
 * EXPO_PUBLIC_GROQ_API_KEY (which src/lib/env.js still reads for local dev) could reach a build or an
 * update without a word. Both preflights now refuse such names.
 *
 * ALLOWED is for a name that matches the pattern but is public by design. It is empty today: the
 * Sentry DSN does not match, the Razorpay key id comes from the payment intent, and the Supabase anon
 * key is deliberately not shipped at all. Add a name here only with a comment saying why it is public.
 */
const SECRET_LOOKING = /^EXPO_PUBLIC_(?:\w+_)?(?:API_KEY|SECRET|TOKEN|PRIVATE)(?:_\w+)?$/;

export const ALLOWED = new Set([]);

/** The names from `names` that must not ship in a bundle. */
export const secretLookingPublicNames = (names) =>
  [...names].filter((n) => SECRET_LOOKING.test(n) && !ALLOWED.has(n));
