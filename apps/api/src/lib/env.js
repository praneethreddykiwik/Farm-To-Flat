/**
 * One place that answers "are we in production?".
 *
 * Every production-only safeguard (never return the OTP, fail CORS closed, never seed demo orders into
 * the real database, require ADMIN_TOKEN) used to key off NODE_ENV alone. Render only applies the
 * render.yaml env block to Blueprint-created services — a service created by hand in the dashboard
 * runs WITHOUT NODE_ENV=production, which silently switched every one of those safeguards off in
 * production (the live API was handing the login OTP back in the response). Render always sets
 * RENDER=true on its own, so treat that as production too. Belt and braces: still set
 * NODE_ENV=production in the Render dashboard.
 */
export const IS_TEST = process.env.NODE_ENV === 'test';
export const IS_PROD =
  !IS_TEST && (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true');
