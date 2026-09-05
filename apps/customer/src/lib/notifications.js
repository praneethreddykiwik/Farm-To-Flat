import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { env } from './env';

let configured = false;

export function configureNotifications() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Registers for push and returns the Expo push token, or null when unavailable
 * (Expo Go on Android cannot receive remote push since SDK 53; a dev build can).
 * @returns {Promise<string|null>}
 */
export async function registerForPush() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('orders', {
        name: 'Order updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 120, 200],
        lightColor: '#1E7A4C',
      });
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;
    if (env.isExpoGo && Platform.OS === 'android') return null;
    if (!env.easProjectId) return null;
    const token = await Notifications.getExpoPushTokenAsync({ projectId: env.easProjectId });
    return token.data;
  } catch {
    return null;
  }
}

/** Local notification used for in-app confirmations while the server push is not wired. */
export async function notifyLocal(title, body, data = {}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data },
      trigger: null,
    });
  } catch {}
}
