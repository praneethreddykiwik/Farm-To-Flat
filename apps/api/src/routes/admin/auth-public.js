/**
 * The only admin routes that are NOT behind adminAuth — the sign-in itself.
 *
 * Everything under /admin requires a credential; these three are how you get one, so they cannot
 * require one. They are mounted ahead of the authenticated admin router in index.js.
 *
 *   GET  /admin/auth/config   what sign-in methods this server offers (no secrets — the Google
 *                             client id is public by design; it appears in the page that uses it)
 *   POST /admin/auth/google   trade a verified Google ID token for an operator session
 *   POST /admin/auth/signout  revoke the session presented
 *
 * Rate limited hard. An unauthenticated endpoint that does RSA verification and an outbound fetch
 * is a free CPU and bandwidth amplifier otherwise, and the per-IP ceiling in index.js is set for
 * ordinary shopping traffic, not for a login.
 */
import { Router } from 'express';
import { recordAction } from '../../lib/audit.js';
import { rateLimit, ipOf } from '../../lib/rate-limit.js';
import { clientIp } from '../../lib/edge.js';
import { googleEnabled, googleClientId, verifyGoogleIdToken } from '../../lib/google-auth.js';
import { googleDirectoryEnabled, roleForEmail } from '../../lib/admin-directory.js';
import {
  issueAdminSession,
  revokeAdminSession,
  verifyAdminSession,
} from '../../lib/admin-session.js';
import { ROLE_META } from '../../lib/roles.js';

export const adminAuthPublicRouter = Router();

const signInLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  key: (req) => `admin-signin:${ipOf(req)}`,
  code: 'RATE_LIMITED',
  message: 'Too many sign-in attempts. Wait a few minutes and try again.',
});

adminAuthPublicRouter.get('/config', (_req, res) => {
  const google = googleEnabled() && googleDirectoryEnabled();
  res.json({
    google: {
      // Both halves have to be present for the button to be worth showing: a client id with an
      // empty allowlist would sign everyone in and then reject every one of them.
      enabled: google,
      clientId: google ? googleClientId() : null,
    },
    // Report the truth rather than a constant. The sign-in screen needs to know whether to offer
    // the token box at all, and "always yes" stops being true the moment the token is sunset.
    token: { enabled: process.env.ADMIN_TOKEN_SUNSET !== '1' && !!process.env.ADMIN_TOKEN },
  });
});

adminAuthPublicRouter.post('/google', signInLimit, async (req, res) => {
  const credential = req.body?.credential;
  if (!credential)
    return res
      .status(422)
      .json({ error: { code: 'VALIDATION', message: 'No Google sign-in was supplied.' } });

  let who;
  try {
    who = await verifyGoogleIdToken(credential);
  } catch (e) {
    return res
      .status(e.status || 401)
      .json({ error: { code: e.code || 'GOOGLE_REJECTED', message: e.message } });
  }

  const role = roleForEmail(who.email);
  if (!role) {
    // Deliberately does NOT say whether the address exists anywhere, and deliberately does not vary
    // with the reason — this endpoint must not become a way to enumerate who works here.
    // eslint-disable-next-line no-console
    console.warn(`[admin-auth] refused Google sign-in for an address that is not on the list.`);
    return res.status(403).json({
      error: {
        code: 'NOT_AUTHORISED',
        message: 'That Google account does not have access to this panel.',
      },
    });
  }

  const { token, expiresAt } = issueAdminSession({
    email: who.email,
    role,
    name: who.name,
    picture: who.picture,
  });
  // A sign-in used to leave one console.error on an ephemeral host, which meant the only record
  // of who had access to the refund console disappeared with the next deploy. Awaited: if we
  // cannot record that someone signed in, we do not sign them in.
  await recordAction({
    staff: { email: who.email, role, viaGoogle: true },
    action: 'ADMIN_SIGN_IN',
    target: null,
    // clientIp, not req.ip: behind Cloudflare the latter is an edge datacentre address, so every
    // sign-in would be recorded as coming from the same place. The point of keeping it is to be
    // able to say where someone signed in from.
    details: { name: who.name || null, ip: clientIp(req) || null },
  });
  // eslint-disable-next-line no-console
  console.error(`[admin-auth] ${who.email} signed in as ${role}.`);
  return res.json({
    session: token,
    expiresAt,
    operator: {
      email: who.email,
      name: who.name,
      picture: who.picture,
      role,
      roleLabel: ROLE_META[role]?.label || role,
    },
  });
});

adminAuthPublicRouter.post('/signout', async (req, res) => {
  // Read the session BEFORE revoking it, or there is nobody left to name in the record.
  const who = verifyAdminSession(req.header('x-admin-session') || '');
  revokeAdminSession(req.header('x-admin-session') || '');
  // Sign-out matters as much as sign-in: "when did this person stop having access" is half of
  // any access question. Not awaited-and-refused like sign-in — refusing to sign someone OUT
  // because the log is down would be the wrong way round.
  if (who)
    recordAction({
      staff: { email: who.email, role: who.role, viaGoogle: true },
      action: 'ADMIN_SIGN_OUT',
    }).catch(() => {});
  // Always 200: whether that token was real is not information this endpoint should hand out, and
  // the client's job after signing out is identical either way.
  res.json({ ok: true });
});
