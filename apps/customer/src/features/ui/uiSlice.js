import { createSlice } from '@reduxjs/toolkit';
import { KV_KEYS, kv } from '../../lib/kv';

const initialState = {
  toast: null, // { id, title, message?, tone: 'neutral'|'success'|'error' }
  reducedMotion: false,
  bagPulse: 0, // increments when an item is added, drives the tab-bar bag bounce
  dietPref: 'ALL', // 'ALL' | 'VEG' | 'NONVEG' — veg/non-veg filter, shared by shop + search
  // Reading language. A DEVICE setting, not an account one: it is how this person reads, and it has
  // to be right on the very first screen, before anybody has signed in. Restored synchronously at
  // startup so the app never flashes English and then re-renders.
  language: kv.getString(KV_KEYS.language) || null, // null = not chosen yet → ask once
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    showToast(state, action) {
      state.toast = { id: Date.now(), tone: 'neutral', ...action.payload };
    },
    hideToast(state) {
      state.toast = null;
    },
    setReducedMotion(state, action) {
      state.reducedMotion = !!action.payload;
    },
    pulseBag(state) {
      state.bagPulse += 1;
    },
    setDietPref(state, action) {
      state.dietPref = action.payload; // 'ALL' | 'VEG' | 'NONVEG'
    },
    setLanguage(state, action) {
      const next = ['en', 'hi', 'te'].includes(action.payload) ? action.payload : 'en';
      state.language = next;
      kv.setString(KV_KEYS.language, next);
    },
  },
  // dietPref is a per-account preference, not a device setting — reset it on sign-out so the
  // next account starts at the default filter instead of inheriting the last user's choice.
  // String action type avoids a circular import with authSlice.
  extraReducers: (builder) => {
    builder.addCase('auth/signedOut', (state) => {
      state.dietPref = initialState.dietPref;
      // `language` deliberately survives sign-out — the next person to pick up the phone still
      // reads the same way, and being thrown back to English is jarring.
    });
  },
});

export const { showToast, hideToast, setReducedMotion, pulseBag, setDietPref, setLanguage } =
  uiSlice.actions;
export default uiSlice.reducer;
export const selectToast = (s) => s.ui.toast;
export const selectReducedMotion = (s) => s.ui.reducedMotion;
export const selectBagPulse = (s) => s.ui.bagPulse;
export const selectDietPref = (s) => s.ui.dietPref;
/** The chosen reading language, or 'en' until one is picked. */
export const selectLanguage = (s) => s.ui.language || 'en';
/** Whether we still owe this person the one-time language question. */
export const selectLanguageUnset = (s) => !s.ui.language;
/** Filter a product list by the current veg/non-veg preference. */
export const filterByDiet = (products, pref) =>
  !pref || pref === 'ALL' ? products : products.filter((p) => (p.diet || 'VEG') === pref);
