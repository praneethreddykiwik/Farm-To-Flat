/**
 * Push-token registration (contract, authenticated). Stores the Expo push token for the customer;
 * the notification sender (Adnan / a worker) reads these. No-op-safe.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http.js';
import { validateBody } from '../validate.js';
import { registerDevice } from '../customer-store.js';

export const devicesRouter = Router();

devicesRouter.post(
  '/',
  validateBody(z.object({ expoPushToken: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    registerDevice(req.customerId, req.body.expoPushToken);
    res.json({ ok: true });
  }),
);
