import { createSlice } from '@reduxjs/toolkit';

/**
 * @typedef {object} AuthState
 * @property {'booting'|'signedOut'|'signedIn'} status
 * @property {string|null} accessToken
 * @property {object|null} customer   // { id, mobile, name?, hasAddress }
 * @property {string|null} pendingMobile
 */

/** @type {AuthState} */
const initialState = {
  status: 'booting',
  accessToken: null,
  customer: null,
  pendingMobile: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    bootFinished(state) {
      if (state.status === 'booting') state.status = 'signedOut';
    },
    setPendingMobile(state, action) {
      state.pendingMobile = action.payload;
    },
    signedIn(state, action) {
      state.status = 'signedIn';
      state.accessToken = action.payload.accessToken;
      state.customer = action.payload.customer;
      state.pendingMobile = null;
    },
    accessRefreshed(state, action) {
      state.accessToken = action.payload;
    },
    customerUpdated(state, action) {
      state.customer = { ...(state.customer || {}), ...action.payload };
    },
    /**
     * @param {{ payload?: { reason?: 'user'|'expired' } }} action  'user' = they tapped Sign out,
     * 'expired' = the refresh token was rejected. Only the first is a decision about the account;
     * the second is the network telling us the session aged out, and device preferences must not be
     * thrown away over it.
     */
    signedOut(state, action) {
      state.signOutReason = action?.payload?.reason === 'user' ? 'user' : 'expired';
      state.status = 'signedOut';
      state.accessToken = null;
      state.customer = null;
    },
  },
});

export const {
  bootFinished,
  setPendingMobile,
  signedIn,
  accessRefreshed,
  customerUpdated,
  signedOut,
} = authSlice.actions;
export default authSlice.reducer;

export const selectAuth = (s) => s.auth;
export const selectIsSignedIn = (s) => s.auth.status === 'signedIn';
export const selectCustomer = (s) => s.auth.customer;
/** The bearer token, for the few places that fetch outside RTK Query (file downloads). */
export const selectAccessToken = (s) => s.auth.accessToken;
