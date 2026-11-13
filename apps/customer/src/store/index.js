import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { api } from '../api/api';
import authReducer from '../features/auth/authSlice';
import uiReducer from '../features/ui/uiSlice';
import planReducer from '../features/plan/planSlice';
import roleReducer from '../features/role/roleSlice';
import householdReducer from '../features/household/householdSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    ui: uiReducer,
    plan: planReducer,
    role: roleReducer,
    household: householdReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefault) =>
    getDefault({ serializableCheck: false, immutableCheck: false }).concat(api.middleware),
});

setupListeners(store.dispatch);
