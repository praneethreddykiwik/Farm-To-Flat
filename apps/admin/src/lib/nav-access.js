/**
 * Which admin pages a staff role can actually use (security audit, 21 Nov 2026, S8-01).
 *
 * The server is the real gate: every admin API call is checked by `roleMayAccess` in
 * apps/api/src/routes/admin/auth.js and answers 403 otherwise. This only hides the pages a role
 * would open to an empty, refused screen, so a packer or buyer sees just their own work. It mirrors
 * those server rules; if they disagree, the server still wins.
 */
const ADMIN_UP = ['ADMIN', 'SUPER_ADMIN'];

/** Page → the roles that may open it. A page not listed is for admins only. */
const PAGE_ROLES = {
  // Console KPIs: every staff role (the /metrics rule is open to all of them).
  '/admin': ['ADMIN', 'SUPER_ADMIN', 'PROCUREMENT', 'FULFILMENT'],
  '/procurement': ['ADMIN', 'SUPER_ADMIN', 'PROCUREMENT'],
  // The fulfilment board and the orders list both read /orders, which the delivery role may use.
  '/fulfilment': ['ADMIN', 'SUPER_ADMIN', 'FULFILMENT'],
  '/orders': ['ADMIN', 'SUPER_ADMIN', 'FULFILMENT'],
  // Owner only on the server.
  '/audit': ['SUPER_ADMIN'],
};

/**
 * @param {string} path  a page address, e.g. '/finance'
 * @param {string|null|undefined} role  the signed-in operator's role
 * @param {boolean} [sharedToken]  signed in with the old shared operator token (full access while it
 *   is still accepted; the server refuses it once ADMIN_TOKEN_SUNSET=1)
 */
export function mayOpenPage(path, role, sharedToken = false) {
  if (sharedToken) return true;
  if (!role) return false;
  return (PAGE_ROLES[path] || ADMIN_UP).includes(role);
}
