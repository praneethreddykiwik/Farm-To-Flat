/**
 * "Confirm tomorrow's order" reminders. Produce is harvested after the order, so every planned day
 * needs its ingredients ordered the evening before. We schedule one local notification per planned
 * day at 18:00 IST the day before (two hours before the 20:00 cut-off). Tapping it deep-links to
 * /confirm/<date>, where one tap places the order.
 *
 * Local notifications work in Expo Go and in dev builds; no server needed.
 */
import * as Notifications from 'expo-notifications';
import { addDaysISO, formatDateShort, parseISODate, todayISO } from './dates';
import { CATEGORY } from './notificationRoutes';

const REMIND_HOUR_IST = 18;

/** @param {string} dateISO the delivery day @returns {Date} 18:00 IST the evening before */
export function remindAtFor(dateISO) {
  const at = parseISODate(addDaysISO(dateISO, -1));
  at.setUTCHours(REMIND_HOUR_IST - 6, 30, 0, 0); // 18:00 IST == 12:30 UTC (was 13:30 → 7 pm)
  return at;
}

/**
 * One reminder per planned day, so nothing is missed on a week or month plan.
 * @param {{ id?: string, title: string, days: { date: string, meals: any[] }[], ordered?: string[], skipped?: string[] }} plan
 * @returns {Promise<string[]>}
 */
export async function scheduleOrderReminders(plan) {
  const { status } = await Notifications.getPermissionsAsync();
  let granted = status === 'granted';
  if (!granted) granted = (await Notifications.requestPermissionsAsync()).status === 'granted';
  if (!granted) return [];

  const today = todayISO();
  const ids = [];
  const settled = new Set([...(plan.ordered || []), ...(plan.skipped || [])]);
  for (const day of plan.days) {
    if (day.date <= today || settled.has(day.date)) continue;
    const at = remindAtFor(day.date);
    if (at.getTime() < Date.now()) continue;
    const items = day.meals.reduce((n, m) => n + m.items.length, 0);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Confirm tomorrow’s order?`,
        body: `${plan.title}: ${items} ingredients for ${formatDateShort(day.date)}. Confirm by 8 pm and we harvest tonight — or skip the day.`,
        categoryIdentifier: CATEGORY.PLAN,
        data: {
          type: 'plan-confirm',
          planId: plan.id,
          date: day.date,
          url: `/confirm/${day.date}`,
        },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
    ids.push(id);
  }
  return ids;
}

export async function cancelReminders(ids = []) {
  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})),
  );
}
