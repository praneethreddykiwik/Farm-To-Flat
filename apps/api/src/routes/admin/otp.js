/**
 * Sign-in code delivery (operator). Read-only.
 *   GET /admin/otp-status   which channel is actually carrying login codes, and what is blocking it
 *
 * This exists because the answer was only ever visible in the API's boot logs, which scroll away on
 * a hosted service — so "WhatsApp OTP is configured" and "WhatsApp OTP is working" could disagree
 * for weeks with nothing to show the difference. Names and booleans only: the auth key and the
 * tester numbers never appear in the response.
 */
import { Router } from 'express';
import { asyncHandler } from '../../http.js';
import { otpStatus } from '../../customer-store.js';

export const adminOtpRouter = Router();

adminOtpRouter.get(
  '/otp-status',
  asyncHandler(async (_req, res) => {
    res.json(otpStatus());
  }),
);
