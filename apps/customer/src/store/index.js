import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { AppState } from 'react-native';
import { api } from '../api/api';
import { LIVE_TAGS, watchForeground } from '../lib/foregroundRefresh';
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

// RN never fires the window events setupListeners listens for, so refresh the account's live data
// ourselves whenever the app returns to the screen — see lib/foregroundRefresh.js.
watchForeground(AppState, () => {
  if (store.getState().auth.status === 'signedIn')
    store.dispatch(api.util.invalidateTags(/** @type {any} */ (LIVE_TAGS)));
});
