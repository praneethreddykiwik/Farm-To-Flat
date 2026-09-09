/**
 * In-memory store for staff access grants: phone number -> role (+ AI-button access). Managed on
 * the admin panel; resolved by the app at login. The Prisma build backs this with a `staff` table.
 * One number maps to at most one role (unique mobile). Not the same as customer accounts.
 */
import { id } from './lib/ids.js';
import { ROLE_META } from './lib/roles.js';

/** @type {Map<string, any>} id -> staff */
const staff = new Map();

const byMobile = (mobile) => [...staff.values()].find((s) => s.mobile === mobile);

// Seed staff so every role works the moment the API boots (survives restarts of the in-memory
// store). Replace these with the real team numbers on the admin "Access & roles" page.
(function seed() {
  const seeded = [
    { mobile: '9999900001', name: 'Owner (example)', role: 'SUPER_ADMIN', aiAccess: true },
    { mobile: '9848033333', name: 'Admin (example)', role: 'ADMIN', aiAccess: false },
    { mobile: '9848011111', name: 'Procurement (example)', role: 'PROCUREMENT', aiAccess: false },
    { mobile: '9848022222', name: 'Fulfilment (example)', role: 'FULFILMENT', aiAccess: false },
  ];
  for (const row of seeded) {
    const s = { id: id('stf', 8), ...row, createdAt: new Date().toISOString() };
    staff.set(s.id, s);
  }
})();

export const listStaff = () => [...staff.values()].sort((a, b) => a.role.localeCompare(b.role));
export const getStaff = (sid) => staff.get(sid) || null;
export const findStaffByMobile = (mobile) => byMobile(mobile) || null;

/** @returns {{ staff:any } | { error:{status,code,message} }} */
export function addStaff({ mobile, role, name, aiAccess }) {
  if (!/^[6-9]\d{9}$/.test(String(mobile)))
    return {
      error: { status: 422, code: 'VALIDATION', message: 'Enter a valid 10-digit mobile number.' },
    };
  if (!ROLE_META[role])
    return { error: { status: 422, code: 'VALIDATION', message: 'Choose a valid role.' } };
  if (byMobile(mobile))
    return {
      error: {
        status: 409,
        code: 'MOBILE_TAKEN',
        message: 'That number already has a role. Edit it instead.',
      },
    };
  const s = {
    id: id('stf', 8),
    mobile: String(mobile),
    name: name?.trim() || null,
    role,
    aiAccess: aiAccess ?? ROLE_META[role].ai,
    createdAt: new Date().toISOString(),
  };
  staff.set(s.id, s);
  return { staff: s };
}

export function updateStaff(sid, patch) {
  const s = staff.get(sid);
  if (!s) return null;
  if (patch.role && ROLE_META[patch.role]) s.role = patch.role;
  if (patch.name !== undefined) s.name = patch.name?.trim() || null;
  if (patch.aiAccess !== undefined) s.aiAccess = !!patch.aiAccess;
  return s;
}

export function removeStaff(sid) {
  return staff.delete(sid);
}
