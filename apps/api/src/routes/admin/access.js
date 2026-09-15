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
// Only a SUPER_ADMIN may grant, change or revoke SUPER_ADMIN. An ADMIN manages the rest.
const superOnly = (req, target) => {
  if (req.staff?.role === 'SUPER_ADMIN') return;
  if (req.body?.role === 'SUPER_ADMIN' || target?.role === 'SUPER_ADMIN')
    throw fail(403, 'FORBIDDEN', 'Only a super admin can manage super admins.');
};

adminAccessRouter.post(
  '/access',
  validateBody(CreateBody),
  asyncHandler(async (req, res) => {
    superOnly(req);
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
    const target = getStaff(req.params.id);
    if (!target) throw fail(404, 'NOT_FOUND', 'Member not found');
    superOnly(req, target);
    res.json({ staff: serialise(updateStaff(req.params.id, req.body)) });
  }),
);

adminAccessRouter.delete(
  '/access/:id',
  asyncHandler(async (req, res) => {
    const target = getStaff(req.params.id);
    if (!target) throw fail(404, 'NOT_FOUND', 'Member not found');
    superOnly(req, target);
    removeStaff(req.params.id);
    res.json({ ok: true });
  }),
);
