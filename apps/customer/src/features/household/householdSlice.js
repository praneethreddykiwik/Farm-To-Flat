import { createSlice } from '@reduxjs/toolkit';
import { kv } from '../../lib/kv';
import { cleanHousehold } from '../../lib/household';

/**
 * Who eats at home: a number of adults and a number of children. Nothing else — no names, no ages.
 *
 * Kept on this phone only. It exists to answer one question on this phone ("is this enough for us?")
 * and nothing on the server needs it, so it is never sent anywhere; what is not collected cannot be
 * leaked, and there is nothing to erase but this key. The cost is that a new phone asks again.
 *
 * `asked` records that the question was put once, so declining it is an answer too.
 */
const KEY = 'household.v1';

const read = () => {
  try {
    const v = kv.getJSON(KEY);
    return { value: cleanHousehold(v?.value), asked: !!v?.asked };
  } catch {
    return { value: null, asked: false };
  }
};
const write = (state) => {
  try {
    kv.setJSON(KEY, { value: state.value, asked: state.asked });
  } catch {
    /* a phone that cannot keep it still has it for this session */
  }
};

const slice = createSlice({
  name: 'household',
  initialState: { value: null, asked: false, hydrated: false },
  reducers: {
    /** Restore what this phone holds, once the app is running (storage is not ready any earlier). */
    hydrateHousehold(state) {
      if (state.hydrated) return;
      const saved = read();
      state.value = saved.value;
      state.asked = saved.asked;
      state.hydrated = true;
    },
    setHousehold(state, action) {
      state.value = cleanHousehold(action.payload);
      state.asked = true;
      write(state);
    },
    /** "Not now": do not ask again on its own. */
    declineHousehold(state) {
      state.asked = true;
      write(state);
    },
  },
  extraReducers: (builder) => {
    // Someone signing OUT takes their household with them; an expired session does not.
    builder.addCase('auth/signedOut', (state, /** @type {any} */ action) => {
      if (action?.payload?.reason !== 'user') return;
      state.value = null;
      state.asked = false;
      try {
        kv.remove(KEY);
      } catch {
        /* nothing kept is nothing to clear */
      }
    });
  },
});

export const { hydrateHousehold, setHousehold, declineHousehold } = slice.actions;
export default slice.reducer;
export const selectHousehold = (s) => s.household.value;
export const selectHouseholdAsked = (s) => s.household.asked;
export const selectHouseholdReady = (s) => s.household.hydrated;
