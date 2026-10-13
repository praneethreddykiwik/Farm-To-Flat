/**
 * Which Google accounts may open the operator panel, and as what.
 *
 * A verified Google sign-in proves WHO someone is. It says nothing about whether they work here —
 * anyone on earth has a verified Google address. This is the second half of the check, and without
 * it "sign in with Google" is an open door with a logo on it.
 *
 * The list lives in ADMIN_GOOGLE_EMAILS on the API host, comma-separated, each entry an address
 * with an optional role:
 *
 *   ADMIN_GOOGLE_EMAILS="owner@fooducia.in:SUPER_ADMIN, ops@fooducia.in:ADMIN, buyer@x.com:PROCUREMENT"
 *
 * A bare address with no role gets ADMIN, not SUPER_ADMIN: a typo in this variable should not hand
 * out the ability to grant roles. Unset means Google sign-in is off — it fails CLOSED, so a
 * half-finished configuration never becomes "everyone is an admin".
 *
 * The staff table is keyed by mobile number and has no email column, so it cannot answer this yet.
 * When an email column is added, this is the one function that has to start reading it.
 */
import { ROLE_META } from './roles.js';
import { listAdminEmails } from '../store.js';

const normalise = (s) =>
  String(s || '')
    .trim()
    .toLowerCase();

/** @returns {Map<string, string>} email -> role */
export function adminDirectory() {
  const out = new Map();
  for (const entry of (process.env.ADMIN_GOOGLE_EMAILS || '').split(',')) {
    const raw = entry.trim();
    if (!raw) continue;
    const [addr, role] = raw.split(':').map((s) => s.trim());
    const email = normalise(addr);
    if (!email.includes('@')) continue;
    const wanted = (role || '').toUpperCase();
    out.set(email, ROLE_META[wanted] ? wanted : 'ADMIN');
  }
  return out;
}

export const googleDirectoryEnabled = () =>
  adminDirectory().size > 0 || listAdminEmails().length > 0;

/**
 * The role this verified Google address may use, or null if it is on neither list.
 *
 * Two sources, env first: ADMIN_GOOGLE_EMAILS is the failsafe and the only place SUPER_ADMIN is
 * granted, so an owner can never be locked out by edits made in the console. The console-managed
 * list (listAdminEmails) is the editable layer and always resolves to ADMIN.
 */
export const roleForEmail = (email) => {
  const e = normalise(email);
  const env = adminDirectory().get(e);
  if (env) return env;
  return listAdminEmails().includes(e) ? 'ADMIN' : null;
};
