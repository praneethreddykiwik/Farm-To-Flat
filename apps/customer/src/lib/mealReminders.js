/**
 * Meal-time reminders: "it's lunch — snap your plate".
 *
 * One notification per meal the customer has actually planned (or, without a plan, per meal they
 * said they eat in a day), each with action buttons — Snap my plate · I had it · Skipped it — so
 * logging is one tap from the lock screen.
 *
 * These are one-shot notifications for the next few days, re-armed every time the app opens, rather
 * than a blind daily repeat. That is what lets us NOT nag: the moment lunch is logged, today's lunch
 * reminder is cancelled, and a day with no dinner planned gets no dinner reminder. Repeated prompts
 * for something already done are a "nagging" dark pattern under the CCPA guidelines; a reminder
 * that knows when to stay quiet is also simply better.
 *
 * Android delivers these within a few minutes of the time, not to the second: exact alarms are
 * reserved for alarm-clock apps. That is fine for a meal.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { CATEGORY } from './notificationRoutes';

export const SLOT_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];

/** 24h IST clock time per meal slot. All inside 9 am – 9 pm: no reminder ever lands at night. */
export const SLOT_TIMES = {
  breakfast: { hour: 9, minute: 0 },
  lunch: { hour: 13, minute: 30 },
  snack: { hour: 17, minute: 0 },
  dinner: { hour: 20, minute: 30 },
};

const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };
const REMINDER_CHANNEL = 'reminders';
const IST_OFFSET_MIN = 330;
export const REMINDER_DAYS = 5;

/** Which meals a person who eats `n` times a day should be asked about. */
export function slotsForMeals(n) {
  const count = Math.max(1, Math.min(4, Number(n) || 3));
  if (count === 1) return ['lunch'];
  if (count === 2) return ['lunch', 'dinner'];
  if (count === 3) return ['breakfast', 'lunch', 'dinner'];
  return ['breakfast', 'lunch', 'snack', 'dinner'];
}

/** The instant a slot's reminder fires on an IST calendar date. */
export function slotInstant(dateISO, slot) {
  const t = SLOT_TIMES[slot];
  if (!t) return null;
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, t.hour, t.minute) - IST_OFFSET_MIN * 60000);
}

export const reminderId = (dateISO, slot) => `meal_${dateISO}_${slot}`;

/**
 * @typedef {{ slot: string, name?: string, kcal?: number }} PlannedMeal
 * @typedef {object} ReminderInput
 * @property {Date} now
 * @property {string[]} dates  IST dates to cover, today first
 * @property {Record<string, PlannedMeal[]>} [mealsByDate]  what the plan has on each date
 * @property {string[]} [defaultSlots]  used on dates the plan says nothing about ([] = stay silent)
 * @property {Record<string, string[]>} [logged]  slots already logged, by date
 */

/**
 * Work out which reminders should exist. Pure — the scheduling below just carries this out.
 * @param {ReminderInput} input
 * @returns {{ id: string, date: string, slot: string, at: Date, title: string, body: string }[]}
 */
export function planReminders({ now, dates, mealsByDate = {}, defaultSlots = [], logged = {} }) {
  const out = [];
  for (const date of dates) {
    const planned = mealsByDate[date];
    const slots = planned?.length ? planned.map((m) => m.slot) : defaultSlots;
    for (const slot of SLOT_ORDER) {
      if (!slots.includes(slot)) continue;
      if ((logged[date] || []).includes(slot)) continue;
      const at = slotInstant(date, slot);
      if (!at || at.getTime() <= now.getTime() + 60000) continue;
      const meal = planned?.find((m) => m.slot === slot);
      out.push({
        id: reminderId(date, slot),
        date,
        slot,
        at,
        title: `${SLOT_LABEL[slot]} time — snap your plate`,
        body: meal?.name
          ? `Planned: ${meal.name}${meal.kcal ? ` (about ${Math.round(meal.kcal)} kcal)` : ''}. One photo and we do the counting.`
          : 'One photo and we do the counting.',
      });
    }
  }
  return out;
}

async function ensureReminderChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name: 'Meal & order reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#1E7A4C',
  });
}

/** Cancel every meal reminder we scheduled (leaves all other notifications alone). */
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
 * Replace the scheduled meal reminders with the set described by `input` (see planReminders).
 * Never asks for notification permission — that happens once, at sign-in. Never throws.
 * @param {ReminderInput} input
 * @returns {Promise<number>} how many were scheduled
 */
export async function armMealReminders(input) {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return 0;
    await ensureReminderChannel();
    await clearMealReminders();
    const reminders = planReminders(input);
    for (const r of reminders) {
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: {
          title: r.title,
          body: r.body,
          data: { kind: 'MEAL_CHECKIN', slot: r.slot, date: r.date },
          categoryIdentifier: CATEGORY.MEAL,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: r.at,
          channelId: REMINDER_CHANNEL,
        },
      });
    }
    return reminders.length;
  } catch {
    return 0; // reminders are a nicety, never a crash
  }
}

/** A meal was logged: its reminder must not fire, and one already showing should go away. */
export async function settleMealReminder(dateISO, slot) {
  try {
    await Notifications.cancelScheduledNotificationAsync(reminderId(dateISO, slot)).catch(() => {});
    const shown = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      shown
        .filter((n) => {
          const d = n?.request?.content?.data || {};
          return d.kind === 'MEAL_CHECKIN' && d.slot === slot && (!d.date || d.date === dateISO);
        })
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {})),
    );
  } catch {
    /* no-op */
  }
}

/** @deprecated kept so an older caller cannot crash; use armMealReminders. */
export const scheduleMealReminders = () => Promise.resolve();
