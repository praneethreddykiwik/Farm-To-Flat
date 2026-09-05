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
    signedOut(state) {
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
