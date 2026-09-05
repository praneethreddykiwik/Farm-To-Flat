import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  toast: null, // { id, title, message?, tone: 'neutral'|'success'|'error' }
  reducedMotion: false,
  bagPulse: 0, // increments when an item is added, drives the tab-bar bag bounce
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
  },
});

export const { showToast, hideToast, setReducedMotion, pulseBag } = uiSlice.actions;
export default uiSlice.reducer;
export const selectToast = (s) => s.ui.toast;
export const selectReducedMotion = (s) => s.ui.reducedMotion;
export const selectBagPulse = (s) => s.ui.bagPulse;
