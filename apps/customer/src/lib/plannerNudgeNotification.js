/**
 * The one "Have you tried the meal planner?" reminder, scheduled on the phone with a Try it button.
 * Never asks for permission (that happens once, at sign-in) and never throws. Re-arming with the
 * same id replaces the earlier one, so there is at most one waiting.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { CATEGORY } from './notificationRoutes';
import { PLANNER_NUDGE_ID, nudgeInstant } from './plannerNudge';
import { KV_KEYS, kv } from './kv';

const CHANNEL = 'reminders';

export async function clearPlannerNudge() {
  try {
    await Notifications.cancelScheduledNotificationAsync(PLANNER_NUDGE_ID);
  } catch {
    /* nothing scheduled, or scheduling unavailable */
  }
}

export async function armPlannerNudge({ snoozedUntil = null, title, body }) {
  try {
    const now = Date.now();
    const saved = kv.getJSON(KV_KEYS.plannerNudge) || {};
    // Already waiting for the same moment, or one went out less than a week ago: leave it be.
    // Without this, opening the app every day would push the reminder forward for ever.
    const sameSnooze = (saved.notifySnooze || null) === (snoozedUntil || null);
    if (saved.notifyAt && sameSnooze && now < saved.notifyAt + 7 * 864e5) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Meal & order reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#1E7A4C',
      });
    const at = nudgeInstant({ now, snoozedUntil });
    await Notifications.scheduleNotificationAsync({
      identifier: PLANNER_NUDGE_ID,
      content: {
        title,
        body,
        data: { kind: 'PLANNER_NUDGE' },
        categoryIdentifier: CATEGORY.PLANNER,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        channelId: CHANNEL,
      },
    });
    kv.setJSON(KV_KEYS.plannerNudge, {
      ...(kv.getJSON(KV_KEYS.plannerNudge) || {}),
      notifyAt: at.getTime(),
      notifySnooze: snoozedUntil || null,
    });
  } catch {
    /* a nudge is a nicety, never a crash */
  }
}
