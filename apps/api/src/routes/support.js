/**
 * Support contact.
 *   GET   /support           public — the email/phone the app shows, each only if its toggle is on
 *   GET   /admin/support     operator — full settings incl. toggles
 *   PATCH /admin/support     operator — edit email / phone / visibility
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http.js';
import { validateBody } from '../validate.js';
import { getSupport, publicSupport, updateSupport } from '../store.js';

export const supportRouter = Router();
supportRouter.get(
  '/',
  asyncHandler(async (_req, res) => res.json({ support: publicSupport() })),
);

export const adminSupportRouter = Router();
adminSupportRouter.get(
  '/support',
  asyncHandler(async (_req, res) => res.json({ support: getSupport() })),
);
adminSupportRouter.patch(
  '/support',
  validateBody(
    z.object({
      email: z.string().email().or(z.literal('')).optional(),
      phone: z.string().max(20).optional(),
      showEmail: z.boolean().optional(),
      showPhone: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => res.json({ support: updateSupport(req.body) })),
);
