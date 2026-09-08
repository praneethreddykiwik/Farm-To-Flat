/**
 * Access & roles (operator). Assign a phone number a staff role (+ AI-button access). The app reads
 * these at login to open straight into the role's surface (see routes/access.js). Operator-only.
 *   GET    /admin/access                 role catalog + staff list
 *   POST   /admin/access                 add { mobile, role, name?, aiAccess? }
 *   PATCH  /admin/access/:id             change role / name / aiAccess
 *   DELETE /admin/access/:id             revoke
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../../http.js';
import { validateBody } from '../../validate.js';
import { ROLES, ROLE_META, hasAi } from '../../lib/roles.js';
import { addStaff, getStaff, listStaff, removeStaff, updateStaff } from '../../access-store.js';

export const adminAccessRouter = Router();

const serialise = (s) => ({
  id: s.id,
  mobile: s.mobile,
  name: s.name,
  role: s.role,
  roleLabel: ROLE_META[s.role]?.label,
  sections: ROLE_META[s.role]?.sections || [],
  aiAccess: hasAi(s.role, s.aiAccess),
  createdAt: s.createdAt,
});

adminAccessRouter.get(
  '/access',
  asyncHandler(async (_req, res) => {
    res.json({
      roles: ROLES.map((r) => ({ code: r, ...ROLE_META[r] })),
      staff: listStaff().map(serialise),
    });
  }),
);

const CreateBody = z.object({
  mobile: z.string(),
  role: z.enum(ROLES),
  name: z.string().max(80).optional(),
  aiAccess: z.boolean().optional(),
});
adminAccessRouter.post(
  '/access',
  validateBody(CreateBody),
  asyncHandler(async (req, res) => {
    const r = addStaff(req.body);
    if (r.error) throw fail(r.error.status, r.error.code, r.error.message);
    res.status(201).json({ staff: serialise(r.staff) });
  }),
);

const UpdateBody = z.object({
  role: z.enum(ROLES).optional(),
  name: z.string().max(80).nullable().optional(),
  aiAccess: z.boolean().optional(),
});
adminAccessRouter.patch(
  '/access/:id',
  validateBody(UpdateBody),
  asyncHandler(async (req, res) => {
    if (!getStaff(req.params.id)) throw fail(404, 'NOT_FOUND', 'Member not found');
    res.json({ staff: serialise(updateStaff(req.params.id, req.body)) });
  }),
);

adminAccessRouter.delete(
  '/access/:id',
  asyncHandler(async (req, res) => {
    if (!removeStaff(req.params.id)) throw fail(404, 'NOT_FOUND', 'Member not found');
    res.json({ ok: true });
  }),
);
