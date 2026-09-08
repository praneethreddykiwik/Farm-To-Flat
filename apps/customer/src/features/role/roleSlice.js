import { createSlice } from '@reduxjs/toolkit';

/**
 * Staff role for the app experience. Mirrors apps/api/src/lib/roles.js. A phone number assigned a
 * role on the admin panel opens the app into that role's tools instead of the customer shopping app.
 * `role: null` = a normal customer. `devRole` is a local preview override (Profile → Preview as).
 */
const ALL_OPERATOR = ['dashboard', 'orders', 'procurement', 'fulfilment', 'statistics'];
export const ROLE_META = {
  SUPER_ADMIN: { label: 'Super admin', sections: [...ALL_OPERATOR, 'ai', 'customer'], ai: true },
  ADMIN: { label: 'Admin', sections: ALL_OPERATOR, ai: false },
  PROCUREMENT: { label: 'Procurement', sections: ['procurement'], ai: false },
  FULFILMENT: { label: 'Fulfilment', sections: ['fulfilment'], ai: false },
};

const initialState = {
  resolved: false,
  role: null, // from the server for the signed-in number
  roleLabel: null,
  sections: [],
  aiAccess: false,
  devRole: null, // local preview override
};

const roleSlice = createSlice({
  name: 'role',
  initialState,
  reducers: {
    roleResolved(state, action) {
      const r = action.payload || {};
      state.resolved = true;
      state.role = r.isStaff ? r.role : null;
      state.roleLabel = r.roleLabel || null;
      state.sections = r.sections || [];
      state.aiAccess = !!r.aiAccess;
    },
    roleResolveFailed(state) {
      state.resolved = true; // treat as a normal customer if we can't resolve
    },
    setDevRole(state, action) {
      state.devRole = action.payload; // 'SUPER_ADMIN' | ... | null
    },
    roleCleared() {
      return initialState;
    },
  },
  // Any sign-in / sign-out resets the role so it re-resolves for the new number. String action
  // types avoid a circular import with authSlice.
  extraReducers: (builder) => {
    builder.addCase('auth/signedIn', (state) => ({ ...initialState, devRole: state.devRole }));
    builder.addCase('auth/signedOut', () => initialState);
  },
});

export const { roleResolved, roleResolveFailed, setDevRole, roleCleared } = roleSlice.actions;
export default roleSlice.reducer;

/** Effective role: a local preview override wins, else the resolved server role. */
export const selectEffectiveRole = (s) => {
  const dev = s.role.devRole;
  if (dev) return { role: dev, ...ROLE_META[dev], resolved: true, aiAccess: ROLE_META[dev].ai };
  return {
    role: s.role.role,
    label: s.role.roleLabel,
    sections: s.role.sections,
    ai: ROLE_META[s.role.role]?.ai,
    aiAccess: s.role.aiAccess,
    resolved: s.role.resolved,
  };
};
export const selectRoleState = (s) => s.role;
export const selectIsStaff = (s) => !!selectEffectiveRole(s).role;
export const selectAiVisible = (s) => {
  const r = selectEffectiveRole(s);
  return !r.role ? false : !!r.aiAccess; // normal customers never see AI; staff per their grant
};
