/**
 * Role-based access catalog for the staff app experience. A phone number assigned one of these
 * roles on the admin panel opens the app straight into that role's surface instead of the normal
 * customer app. Managed on the admin "Access & roles" page; the app reads it via
 * GET /api/v1/access/resolve at login (NOT wired into the app yet — this is the ready seam).
 *
 * `sections` are the app surfaces the role may see (they map to the admin screens the operator
 * already knows: dashboard, products, pricing, communities, orders, procurement, fulfilment,
 * statistics — plus 'ai' for the planner button and 'customer' for the shopping side).
 */

export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'PROCUREMENT', 'FULFILMENT'];

const ALL_OPERATOR = [
  'dashboard',
  'products',
  'pricing',
  'communities',
  'orders',
  'procurement',
  'fulfilment',
  'statistics',
];

export const ROLE_META = {
  SUPER_ADMIN: {
    label: 'Super admin',
    sections: [...ALL_OPERATOR, 'ai', 'customer'],
    ai: true,
    description:
      'Everything — all operator screens, the AI planner, and the customer shopping app.',
  },
  ADMIN: {
    label: 'Admin',
    sections: ALL_OPERATOR,
    ai: false,
    description:
      'All operator screens (dashboard, products, pricing, communities, orders, procurement, fulfilment, statistics).',
  },
  PROCUREMENT: {
    label: 'Procurement',
    sections: ['procurement'],
    ai: false,
    description: 'Only the procurement buy-list — for the purchasing team.',
  },
  FULFILMENT: {
    label: 'Fulfilment / delivery',
    sections: ['fulfilment'],
    ai: false,
    description:
      'Only the fulfilment board — packing + delivery details (flat, window) for the delivery team.',
  },
};

/** Effective AI-button access = the role grants it, or the member is individually enabled. */
export const hasAi = (role, aiAccessFlag) => !!(ROLE_META[role]?.ai || aiAccessFlag);

/** What a staff member resolves to for the app: role, its screens, and AI visibility. */
export function resolveAccess(role, aiAccessFlag) {
  const meta = ROLE_META[role];
  if (!meta) return { isStaff: false, role: null, sections: [], aiAccess: false };
  return {
    isStaff: true,
    role,
    roleLabel: meta.label,
    sections: meta.sections,
    aiAccess: hasAi(role, aiAccessFlag),
  };
}
