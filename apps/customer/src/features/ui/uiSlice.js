import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  toast: null, // { id, title, message?, tone: 'neutral'|'success'|'error' }
  reducedMotion: false,
  bagPulse: 0, // increments when an item is added, drives the tab-bar bag bounce
  dietPref: 'ALL', // 'ALL' | 'VEG' | 'NONVEG' — veg/non-veg filter, shared by shop + search
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
  },
  // dietPref is a per-account preference, not a device setting — reset it on sign-out so the
  // next account starts at the default filter instead of inheriting the last user's choice.
  // String action type avoids a circular import with authSlice.
  extraReducers: (builder) => {
    builder.addCase('auth/signedOut', (state) => {
      state.dietPref = initialState.dietPref;
    });
  },
});

export const { showToast, hideToast, setReducedMotion, pulseBag, setDietPref } = uiSlice.actions;
export default uiSlice.reducer;
export const selectToast = (s) => s.ui.toast;
export const selectReducedMotion = (s) => s.ui.reducedMotion;
export const selectBagPulse = (s) => s.ui.bagPulse;
export const selectDietPref = (s) => s.ui.dietPref;
/** Filter a product list by the current veg/non-veg preference. */
export const filterByDiet = (products, pref) =>
  !pref || pref === 'ALL' ? products : products.filter((p) => (p.diet || 'VEG') === pref);
