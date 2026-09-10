/**
 * Admin auth seam. In production this verifies an operator JWT minted by Adnan's auth service and
 * checks the `admin` role. Until that lands, it is permissive in development and enforced only if
 * an `ADMIN_TOKEN` env var is set (then callers must send `x-admin-token: <token>`), so the panel
 * runs locally today and gets a real gate the moment one is configured.
 * @type {import('express').RequestHandler}
 */
export function adminAuth(req, res, next) {
  const required = process.env.ADMIN_TOKEN;
  if (!required) {
    // Fail CLOSED in production: never serve the operator panel open to the internet. In dev it
    // stays open so the local panel works without config. TODO(Adnan): replace with JWT + role.
    if (process.env.NODE_ENV === 'production') {
      return res
        .status(503)
        .json({
          error: { code: 'ADMIN_NOT_CONFIGURED', message: 'Admin auth is not configured.' },
        });
    }
    return next();
  }
  const provided = req.header('x-admin-token');
  if (provided !== required) {
    return res
      .status(401)
      .json({ error: { code: 'UNAUTHENTICATED', message: 'Admin sign-in required.' } });
  }
  next();
}
