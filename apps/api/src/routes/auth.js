/**
 * Auth (contract). OTP request/verify, refresh-token rotation, logout. Dev OTP is 123456 and the
 * request response includes `devOtp` (mock parity) — a real MSG91 send replaces that in Adnan's
 * service. Public routes; logout reads the Bearer token if present.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateBody } from '../validate.js';
import { mobile } from '../lib/validators.js';
import { customerPublic } from '../serialize.js';
import {
  hasAddress,
  issueTokens,
  logout,
  requestOtp,
  resolveAccess,
  rotateRefresh,
  verifyOtp,
} from '../customer-store.js';

export const authRouter = Router();

authRouter.post(
  '/otp/request',
  validateBody(z.object({ mobile })),
  asyncHandler(async (req, res) => {
    res.json(requestOtp(req.body.mobile));
  }),
);

authRouter.post(
  '/otp/verify',
  validateBody(z.object({ mobile, otp: z.string().regex(/^\d{4,8}$/, 'Enter the code we sent.') })),
  asyncHandler(async (req, res) => {
    const r = verifyOtp(req.body.mobile, req.body.otp);
    if (r.error) throw fail(r.error.status, r.error.code, r.error.message);
    const tokens = issueTokens(r.customer.id);
    res.json({
      ...tokens,
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
    if (cid) logout(cid);
    res.json({ ok: true });
  }),
);
