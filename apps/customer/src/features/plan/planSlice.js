import { createSlice } from '@reduxjs/toolkit';
import { KV_KEYS, kv } from '../../lib/kv';

/**
 * Diet planner state: the customer's profile + standing instructions, the last generated plan,
 * plans placed on the calendar, and reminder ids. Persisted to the device key-value store.
 */
const DEFAULT_PROFILE = {
  age: '',
  sex: 'male',
  weightKg: '',
  heightCm: '',
  activity: 'moderate',
  goal: 'maintain',
  diet: 'vegetarian + eggs',
  mealsPerDay: 3,
  nonVegDaysPerWeek: 4, // how many days a week may include chicken/mutton/prawns
  cheatDaysPerWeek: 0, // 0–3 relaxed "cheat" days a week (flexible eating)
  region: 'south', // 'south' | 'north' | 'both' cooking style
  excludes: [], // tapped allergy/avoid keywords the planner must never use (items or steps)
  avoid: '',
  customInstructions: '',
};

const persisted = kv.getJSON(KV_KEYS.plan) || {};

const initialState = {
  profile: { ...DEFAULT_PROFILE, ...(persisted.profile || {}) },
  draft: null, // last generated plan (not yet on the calendar)
  scheduled: persisted.scheduled || [], // [{ id, planId, title, startDate, days:[{date, meals}], reminderIds:[] }]
  provider: persisted.provider || null,
};

const planSlice = createSlice({
  name: 'plan',
  initialState,
  reducers: {
    profileUpdated(state, action) {
      state.profile = { ...state.profile, ...action.payload };
      persist(state);
    },
    draftSet(state, action) {
      state.draft = action.payload;
    },
    draftCleared(state) {
      state.draft = null;
    },
    planScheduled(state, action) {
      state.scheduled = [
        ...state.scheduled.filter((s) => s.id !== action.payload.id),
        action.payload,
      ].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
      persist(state);
    },
    planUnscheduled(state, action) {
      state.scheduled = state.scheduled.filter((s) => s.id !== action.payload);
      persist(state);
    },
    dayOrdered(state, action) {
      const sch = state.scheduled.find((x) => x.id === action.payload.id);
      if (!sch) return;
      sch.ordered = [...new Set([...(sch.ordered || []), action.payload.date])];
      sch.orderIds = { ...(sch.orderIds || {}), [action.payload.date]: action.payload.orderId };
      persist(state);
    },
    dayToggled(state, action) {
      const sch = state.scheduled.find((x) => x.id === action.payload.id);
      if (!sch) return;
      const d = action.payload.date;
      const done = sch.completed || [];
      sch.completed = done.includes(d) ? done.filter((x) => x !== d) : [...done, d];
      persist(state);
    },
    remindersAttached(state, action) {
      const s = state.scheduled.find((x) => x.id === action.payload.id);
      if (s) s.reminderIds = action.payload.reminderIds;
      persist(state);
    },
    providerSet(state, action) {
      state.provider = action.payload;
      persist(state);
    },
  },
});

function persist(state) {
  kv.setJSON(KV_KEYS.plan, {
    profile: state.profile,
    scheduled: state.scheduled,
    provider: state.provider,
  });
}

export const {
  profileUpdated,
  draftSet,
  draftCleared,
  planScheduled,
  planUnscheduled,
  remindersAttached,
  providerSet,
  dayToggled,
  dayOrdered,
} = planSlice.actions;
export default planSlice.reducer;

export const selectProfile = (s) => s.plan.profile;
export const selectDraft = (s) => s.plan.draft;
export const selectScheduled = (s) => s.plan.scheduled;
export const selectProvider = (s) => s.plan.provider;

/** Meals scheduled on a given ISO date across all plans. */
export const selectMealsOn = (dateISO) => (s) =>
  s.plan.scheduled.flatMap((p) =>
    p.days
      .filter((d) => d.date === dateISO)
      .flatMap((d) => d.meals.map((m) => ({ ...m, planTitle: p.title, planId: p.id }))),
  );

/** The next planned day that has not been ordered yet, used for the confirm banner. */
export const selectNextUnordered = (s) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = s.plan.scheduled.flatMap((p) =>
    p.days
      .filter((d) => d.date > today && !(p.ordered || []).includes(d.date))
      .map((d) => ({ date: d.date, planId: p.id, title: p.title, meals: d.meals.length })),
  );
  return rows.sort((a, b) => (a.date < b.date ? -1 : 1))[0] || null;
};
