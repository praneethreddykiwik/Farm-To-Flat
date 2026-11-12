import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useSelector } from 'react-redux';
import { useMealDayQuery } from '../api/api';
import { selectAuth } from '../features/auth/authSlice';
import { selectProfile, selectScheduled } from '../features/plan/planSlice';
import { selectAiVisible } from '../features/role/roleSlice';
import { addDaysISO, todayISO } from '../lib/dates';
import {
  REMINDER_DAYS,
  armMealReminders,
  clearMealReminders,
  slotsForMeals,
} from '../lib/mealReminders';

/**
 * Keeps the next few days of meal-time reminders in step with reality: the meals actually on the
 * plan, the meals already logged today, and whether the customer wants reminders at all.
 *
 * Re-arms when any of those change and each time the app comes back to the foreground (which is
 * also how the window rolls forward a day). Mounted once, at the root.
 *
 * Reminders are ON by default once a plan is on the calendar, and can be switched off from the
 * meal-tracking screen (`profile.mealReminders`). Without a plan they stay off unless the customer
 * turns them on, in which case they follow "meals a day" from the profile.
 */
export function useMealReminders() {
  const signedIn = useSelector(selectAuth).status === 'signedIn';
  const enabledFor = useSelector(selectAiVisible) && signedIn; // same audience as the tracker
  const profile = useSelector(selectProfile);
  const scheduled = useSelector(selectScheduled);
  const [tick, setTick] = useState(0);
  const today = todayISO();

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setTick((n) => n + 1));
    return () => sub.remove();
  }, []);

  const { data: day } = useMealDayQuery(today, { skip: !enabledFor });
  const loggedKey = (day?.logs || [])
    .map((l) => l.slot)
    .sort()
    .join(',');

  const mealsByDate = useMemo(() => {
    /** @type {Record<string, { slot: string, name?: string, kcal?: number }[]>} */
    const out = {};
    for (let i = 0; i < REMINDER_DAYS; i++) {
      const date = addDaysISO(today, i);
      const meals = scheduled.flatMap((p) =>
        p.days
          .filter((d) => d.date === date)
          .flatMap((d) =>
            d.meals.map((m) => ({ slot: m.slot, name: m.name, kcal: m.totals?.kcal })),
          ),
      );
      if (meals.length) out[date] = meals;
    }
    return out;
  }, [scheduled, today]);

  const hasPlan = Object.keys(mealsByDate).length > 0;
  const wanted = profile.mealReminders ?? hasPlan;
  const defaultSlots = useMemo(
    () => (profile.mealReminders === true ? slotsForMeals(profile.mealsPerDay) : []),
    [profile.mealReminders, profile.mealsPerDay],
  );

  useEffect(() => {
    if (!enabledFor || !wanted) {
      clearMealReminders();
      return;
    }
    armMealReminders({
      now: new Date(),
      dates: Array.from({ length: REMINDER_DAYS }, (_, i) => addDaysISO(today, i)),
      mealsByDate,
      defaultSlots,
      logged: { [today]: loggedKey ? loggedKey.split(',') : [] },
    });
  }, [enabledFor, wanted, mealsByDate, defaultSlots, loggedKey, today, tick]);
}
