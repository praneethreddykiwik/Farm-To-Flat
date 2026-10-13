/**
 * "Who can access admin" — the Google addresses allowed into the operator panel, managed from the
 * console instead of from the ADMIN_GOOGLE_EMAILS env var (which required a redeploy to change).
 *
 * Two tiers come back on every read:
 *   - owners:  parsed from ADMIN_GOOGLE_EMAILS. Read-only here — they are the lockout-proof failsafe
 *              and the only source of SUPER_ADMIN, so they can only be changed on the server.
 *   - managed: the editable list. Everything added here gets the ADMIN role.
 *
 * SUPER_ADMIN only (enforced by the RULES table in routes/admin/auth.js). Removal takes effect on
 * the removed person's NEXT request, because adminAuth re-reads roleForEmail on every call.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../../http.js';
import { validateBody } from '../../validate.js';
import { listAdminEmails, addAdminEmail, removeAdminEmail } from '../../store.js';
import { adminDirectory } from '../../lib/admin-directory.js';
import { recordAction } from '../../lib/audit.js';

export const adminEmailsRouter = Router();

const snapshot = () => ({
  owners: [...adminDirectory().entries()].map(([email, role]) => ({ email, role })),
  managed: listAdminEmails().map((email) => ({ email, role: 'ADMIN' })),
});

adminEmailsRouter.get('/admin-emails', (_req, res) => res.json(snapshot()));

adminEmailsRouter.post(
  '/admin-emails',
  validateBody(
    z.object({
      email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (adminDirectory().has(email) || listAdminEmails().includes(email))
      throw fail(409, 'ALREADY_LISTED', 'That email already has access.');
    await addAdminEmail(email);
    await recordAction({ staff: req.staff, action: 'ADMIN_EMAIL_ADD', target: email });
    res.json(snapshot());
  }),
);

adminEmailsRouter.delete(
  '/admin-emails/:email',
  asyncHandler(async (req, res) => {
    const email = String(req.params.email || '')
      .trim()
      .toLowerCase();
    if (adminDirectory().has(email))
      throw fail(
        400,
        'ENV_PROTECTED',
        'That address is set in the server configuration and can only be removed there.',
      );
    if (!listAdminEmails().includes(email))
      throw fail(404, 'NOT_LISTED', 'That email is not on the list.');
    await removeAdminEmail(email);
    await recordAction({ staff: req.staff, action: 'ADMIN_EMAIL_REMOVE', target: email });
    res.json(snapshot());
  }),
);
