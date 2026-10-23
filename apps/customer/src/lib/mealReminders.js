/**
 * Daily meal-time reminders for the adherence loop. The plan carries meal SLOTS, not clock times, so
 * these are the default nudge times; tapping a reminder opens the check-in screen. Super-admin only
 * for now (the caller gates it). iOS gets a real Dynamic Island Live Activity later — for now both
 * platforms use a normal scheduled notification, which is the agreed MVP.
 */
import * as Notifications from 'expo-notifications';
import { ensureAndroidChannels } from './notifications';

/** 24h clock time per meal slot. Tweakable later / per-user. */
export const SLOT_TIMES = {
  breakfast: { hour: 9, minute: 0 },
  lunch: { hour: 13, minute: 0 },
  snack: { hour: 17, minute: 0 },
  dinner: { hour: 20, minute: 30 },
};

const SLOT_LABEL = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  snack: 'your snack',
  dinner: 'dinner',
};

/** Cancel the meal reminders we previously scheduled (leaves other notifications alone). */
export async function clearMealReminders() {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => n?.content?.data?.kind === 'MEAL_CHECKIN')
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );
  } catch {
    /* scheduling unavailable (older binary / denied) — nothing to clear */
  }
}

/**
 * Schedule one daily repeating reminder per meal slot. Replaces any previously scheduled set.
 * @param {string[]} slots the slots the active plan uses (defaults to the standard three meals)
 */
export async function scheduleMealReminders(slots = ['breakfast', 'lunch', 'dinner']) {
  try {
    await ensureAndroidChannels();
    await clearMealReminders();
    const DAILY = Notifications.SchedulableTriggerInputTypes?.DAILY || 'daily';
    for (const slot of slots) {
      const t = SLOT_TIMES[slot];
      if (!t) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Did you have ${SLOT_LABEL[slot] || slot}? 🍲`,
          body: 'Tap to log it — add a photo and we’ll check the calories against your plan.',
          data: { kind: 'MEAL_CHECKIN', slot },
        },
        trigger: { type: DAILY, hour: t.hour, minute: t.minute },
      });
    }
  } catch {
    /* no-op: reminders are a nice-to-have, never a crash */
  }
}
