/**
 * Who may open which /staff screen.
 *
 * Review #47 (21 Nov 2026): the route guard sent staff to their own tools but never sent a
 * customer away from them, so a deep link (fooducia://staff/console) opened the ops screens for
 * anyone. The server still refuses the data to a non-staff token; this keeps the screens shut too.
 *
 * Mirrors the routing in app/_layout.js: procurement and fulfilment get their own screen plus the
 * shared customer-notes one; admin and super admin get every staff screen.
 *
 * @param {{ signedIn: boolean, resolved: boolean, role: string|null|undefined, section?: string }} p
 * @returns {'allow'|'wait'|'deny'}  wait = the role is not known yet, render nothing
 */
export function staffAccess({ signedIn, resolved, role, section }) {
  if (!signedIn || !resolved) return 'wait';
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return 'allow';
  const own = role === 'PROCUREMENT' ? 'procurement' : role === 'FULFILMENT' ? 'fulfilment' : null;
  if (!own) return 'deny';
  // Their layout entry point (no section yet) is fine; the gate in _layout.js picks the screen.
  if (!section || section === own || section === 'notes') return 'allow';
  return 'deny';
}

/** Where a denied visitor goes instead. @param {string|null|undefined} role */
export function staffHomeFor(role) {
  if (role === 'PROCUREMENT') return '/staff/procurement';
  if (role === 'FULFILMENT') return '/staff/fulfilment';
  return '/(tabs)';
}
