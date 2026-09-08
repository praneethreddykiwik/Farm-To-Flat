/**
 * Admin auth seam. In production this verifies an operator JWT minted by Adnan's auth service and
 * checks the `admin` role. Until that lands, it is permissive in development and enforced only if
 * an `ADMIN_TOKEN` env var is set (then callers must send `x-admin-token: <token>`), so the panel
 * runs locally today and gets a real gate the moment one is configured.
 * @type {import('express').RequestHandler}
 */
export function adminAuth(req, res, next) {
  const required = process.env.ADMIN_TOKEN;
  if (!required) return next(); // dev: open. TODO(Adnan): replace with JWT + role check.
  const provided = req.header('x-admin-token');
  if (provided !== required) {
    return res
      .status(401)
      .json({ error: { code: 'UNAUTHENTICATED', message: 'Admin sign-in required.' } });
  }
  next();
}
