import { createSlice } from '@reduxjs/toolkit';
import { KV_KEYS, kv } from '../../lib/kv';

/**
 * The saved reading language, read lazily rather than at module scope.
 *
 * Touching storage while the slice module is still evaluating means it runs before the store — and
 * before the native storage module is necessarily ready. Same pattern the reduced-motion preference
 * already uses: a plain default here, hydrated by an action once the app is running.
 */
export const readSavedLanguage = () => {
  try {
    const v = kv.getString(KV_KEYS.language);
    return ['en', 'hi', 'te'].includes(v) ? v : null;
  } catch {
    return null;
  }
};

const initialState = {
  toast: null, // { id, title, message?, tone: 'neutral'|'success'|'error' }
  reducedMotion: false,
  bagPulse: 0, // increments when an item is added, drives the tab-bar bag bounce
  dietPref: 'ALL', // 'ALL' | 'VEG' | 'NONVEG' — veg/non-veg filter, shared by shop + search
  // Reading language. A DEVICE setting, not an account one: it is how this person reads, and it has
  // to be right on the very first screen, before anybody has signed in. Restored synchronously at
  // startup so the app never flashes English and then re-renders.
  language: null, // null = not chosen yet → ask once; hydrated by hydrateLanguage() at startup
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
      try {
        kv.setString(KV_KEYS.language, next);
      } catch {
        /* a device that cannot persist it still switches for this session */
      }
    },
    /** Restore the saved choice at startup. Never overwrites a choice made since. */
    hydrateLanguage(state, action) {
      if (state.language == null && action.payload) state.language = action.payload;
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

export const {
  showToast,
  hideToast,
  setReducedMotion,
  pulseBag,
  setDietPref,
  setLanguage,
  hydrateLanguage,
} = uiSlice.actions;
export default uiSlice.reducer;
export const selectToast = (s) => s.ui.toast;
export const selectReducedMotion = (s) => s.ui.reducedMotion;
export const selectBagPulse = (s) => s.ui.bagPulse;
export const selectDietPref = (s) => s.ui.dietPref;
/** The chosen reading language, or 'en' until one is picked. */
export const selectLanguage = (s) => s.ui.language || 'en';
/**
 * Whether a language has been chosen yet. Nothing asks this at sign-up any more — the choice lives
 * in the profile, and everyone starts in English — but it is what lets a later screen tell "never
 * chosen" apart from "chose English", which are different answers.
 */
export const selectLanguageUnset = (s) => !s.ui.language;
/** Filter a product list by the current veg/non-veg preference. */
export const filterByDiet = (products, pref) =>
  !pref || pref === 'ALL' ? products : products.filter((p) => (p.diet || 'VEG') === pref);
