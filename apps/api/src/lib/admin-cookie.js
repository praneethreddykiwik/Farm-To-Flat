/**
 * Operator session as an HttpOnly cookie.
 *
 * The web console issues a Google sign-in, trades it for an operator session, and historically kept
 * that session token in the browser's localStorage and sent it as the `x-admin-session` header. That
 * works, but a token readable by JavaScript is stealable by any XSS. This sets the same token as an
 * HttpOnly cookie too, so a console served same-site with this API (the operator console on
 * `fooducia.in`, this API on `api.fooducia.in` — same registrable domain) can authenticate with a
 * cookie the page's JS can never read.
 *
 * It is additive: `adminAuth` still accepts the `x-admin-session` header, so the mobile ops console
 * (which sends a Bearer session, not this cookie) and anything still on the header path keep working.
 * SameSite=Lax is correct here because the console and the API are the SAME site — the cookie is sent
 * on those first-party requests and withheld from genuinely cross-site ones.
 *
 * No cookie-parser dependency: Express sets cookies natively via res.cookie, and reading one value
 * out of the raw Cookie header is a few lines.
 */
export const ADMIN_COOKIE = 'f2f_admin';

/** Set the operator session cookie, expiring in step with the session token itself. */
export function setAdminCookie(res, token, expiresAt) {
  const maxAge = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

/** Clear it on sign-out (same attributes, so the browser matches and removes it). */
export function clearAdminCookie(res) {
  res.clearCookie(ADMIN_COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
}

/** Read the operator session token from the Cookie header, or null. */
export function readAdminCookie(req) {
  const raw = req.headers?.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === ADMIN_COOKIE) {
      return decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  return null;
}
