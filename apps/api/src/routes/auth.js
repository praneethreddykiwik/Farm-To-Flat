/**
 * Auth (contract). OTP request/verify, refresh-token rotation, logout. Dev OTP is 123456 and the
 * request response includes `devOtp` (mock parity) — a real MSG91 send replaces that in Adnan's
 * service. Public routes; logout reads the Bearer token if present.
 */
import { Router } from 'express';
import { track, platformOf } from '../lib/events.js';
import { cancelDeletionOnSignIn } from '../lib/account-deletion.js';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateBody } from '../validate.js';
import { mobile } from '../lib/validators.js';
import { ipOf, rateLimit } from '../lib/rate-limit.js';
import { customerPublic } from '../serialize.js';
import { consentRequired, recordConsent } from '../lib/consent.js';
import { logSecurityEvent } from '../lib/security-log.js';
import {
  hasAddress,
  issueTokens,
  logout,
  requestOtp,
  resolveAccess,
  rotateRefresh,
  unregisterDevice,
  verifyOtp,
} from '../customer-store.js';

export const authRouter = Router();

// Two keys, because they stop different attacks. Per-mobile stops someone grinding one account
// (and stops us texting one number repeatedly); per-IP stops one host farming many numbers, which
// is what SMS toll fraud looks like.
const otpPerMobile = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  key: (req) => `otp:m:${req.body?.mobile}`,
  code: 'OTP_RATE_LIMITED',
  message: 'Too many codes requested for this number. Please wait a few minutes.',
});
// Deliberately loose. Indian mobile carriers put huge numbers of subscribers behind CGNAT, so an
// IP here can legitimately be thousands of real customers — a tight per-IP cap locks out paying
// users to stop an attacker. The per-MOBILE limit above is the real control; this one only has to
// be low enough to make farming hundreds of different numbers from one host impractical.
const otpPerIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  key: (req) => `otp:ip:${ipOf(req)}`,
  code: 'OTP_RATE_LIMITED',
  message: 'Too many codes requested. Please wait a few minutes.',
});
// verifyOtp already caps guesses at 3 — but setOtp resets that counter on every new code, so
// without this an attacker just alternates request/verify for unlimited guesses.
const verifyPerIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 90,
  key: (req) => `otpv:ip:${ipOf(req)}`,
  code: 'OTP_RATE_LIMITED',
  message: 'Too many attempts. Please wait a few minutes.',
});

authRouter.post(
  '/otp/request',
  otpPerMobile,
  otpPerIp,
  validateBody(z.object({ mobile })),
  asyncHandler(async (req, res) => {
    const r = await requestOtp(req.body.mobile);
    if (r.error) throw fail(r.error.status, r.error.code, r.error.message);
    res.json(r);
  }),
);

authRouter.post(
  '/otp/verify',
  verifyPerIp,
  validateBody(
    z.object({
      mobile,
      otp: z.string().regex(/^\d{4,8}$/, 'Enter the code we sent.'),
      // The two boxes ticked on the sign-in screen (DPDP §6, §9). Optional so an app from before
      // 21 Nov 2026 can still sign in; such customers are asked once in the app instead.
      consent: z.object({ version: z.string().max(60), adult: z.boolean() }).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const r = verifyOtp(req.body.mobile, req.body.otp);
    if (r.error) {
      logSecurityEvent(r.error.code === 'OTP_LOCKED' ? 'OTP_LOCKED' : 'SIGN_IN_FAILED', {
        req,
        mobile: req.body.mobile,
      });
      throw fail(r.error.status, r.error.code, r.error.message);
    }
    logSecurityEvent('SIGN_IN', { req, customerId: r.customer.id, mobile: req.body.mobile });
    if (req.body.consent) {
      // Never let a failed save stop a sign-in: an unrecorded consent just means the one-time
      // prompt in the app asks again.
      const c = await recordConsent(r.customer.id, { ...req.body.consent, via: 'signup' }).catch(
        () => ({ ok: false }),
      );
      if ('ok' in c && c.ok)
        logSecurityEvent('CONSENT_GIVEN', {
          req,
          customerId: r.customer.id,
          details: { via: 'signup' },
        });
    }
    const tokens = issueTokens(r.customer.id);
    // Signing in during the 60-day grace period keeps the account (lib/account-deletion.js) — the
    // deletion screen says so before anyone confirms. The app tells them it was cancelled.
    const deletionCancelled = await cancelDeletionOnSignIn(r.customer.id).catch(() => false);
    track(
      'signed_in',
      { is_new_user: !!r.isNew, platform: platformOf(req) },
      { customerId: r.customer.id },
    );
    res.json({
      ...tokens,
      ...(deletionCancelled ? { deletionCancelled: true } : {}),
      // True until this account has agreed to the current privacy notice (and said it is 18+).
      consentRequired: consentRequired(r.customer.id),
      customer: customerPublic(r.customer, {
        isNew: r.isNew,
        hasAddress: hasAddress(r.customer.id),
      }),
    });
  }),
);

authRouter.post(
  '/refresh',
  validateBody(z.object({ refreshToken: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const r = rotateRefresh(req.body.refreshToken);
    if (!r) throw fail(401, 'REFRESH_INVALID', 'Session expired.');
    const { getCustomer } = await import('../customer-store.js');
    res.json({
      accessToken: r.accessToken,
      refreshToken: r.refreshToken,
      customer: customerPublic(getCustomer(r.customerId), { hasAddress: hasAddress(r.customerId) }),
    });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const cid = token && resolveAccess(token);
    if (cid) {
      // The app sends this phone's push token so the signed-out account stops notifying it.
      const push = typeof req.body?.expoPushToken === 'string' ? req.body.expoPushToken : null;
      if (push) unregisterDevice(cid, push);
      logout(cid);
      logSecurityEvent('SIGN_OUT', { req, customerId: cid });
    }
    res.json({ ok: true });
  }),
);
