import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { env } from './env';
import { kv } from './kv';

// Remembers that we have already shown the OS notification prompt once and been turned down, so a
// cold start doesn't ask again. Android only stops offering the dialog after two refusals, which
// meant a declined tester saw "Allow Farm to Flat to send you notifications?" on EVERY launch.
const ASKED_KEY = 'notifications.prompted';

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
  // Create the Android channels up front so the live-order card can be presented before the user has
  // gone through push registration. Fire-and-forget; no-op off Android.
  ensureAndroidChannels().catch(() => {});
}

/**
 * Registers for push and returns the Expo push token, or null when unavailable
 * (Expo Go on Android cannot receive remote push since SDK 53; a dev build can).
 * @returns {Promise<string|null>}
 */
// The stable id for the single "live" order notification. Re-presenting with the SAME id replaces
// the notification in place (Android coalesces by id), which is what makes it read like a Live
// Activity — one card that advances Confirmed → Packing → On the road rather than a new buzz each time.
const ORDER_LIVE_ID = 'order-live';
const ORDER_LIVE_CHANNEL = 'order-live';

/** Ensure the Android channels exist. Safe to call repeatedly; no-op off Android. */
export async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Order updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: '#1E7A4C',
  });
  // Low importance + no vibration: the live card sits quietly in the shade and updates silently as
  // the order advances, instead of buzzing on every step.
  await Notifications.setNotificationChannelAsync(ORDER_LIVE_CHANNEL, {
    name: 'Live order status',
    importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: [0],
    lightColor: '#1E7A4C',
    showBadge: false,
  });
}

export async function registerForPush() {
  try {
    if (Platform.OS === 'android') {
      await ensureAndroidChannels();
    }
    const perms = await Notifications.getPermissionsAsync();
    let status = perms.status;
    if (status !== 'granted') {
      // Ask at most once, and only while the OS is still willing to show the dialog. Re-prompting a
      // shopper who already said no is nagging, not onboarding — they can still turn notifications
      // on from system settings whenever they want the delivery updates.
      if (perms.canAskAgain === false || kv.getString(ASKED_KEY)) return null;
      kv.setString(ASKED_KEY, '1');
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

// The four steps of a live order, in order, so the card can show "step 2 of 4" progress. PENDING and
// terminal states are handled by the caller (the card only exists for an order that's actually moving).
const LIVE_STEPS = ['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const LIVE_COPY = {
  CONFIRMED: ['Order confirmed 🌱', 'We’ll harvest it fresh for your window.'],
  PACKING: ['Packing your order 📦', 'Weighed and bagged this morning.'],
  OUT_FOR_DELIVERY: ['On its way 🛵', 'Your order is heading to your block.'],
};

/** True when a status deserves the live card (moving, not finished). */
export const isLiveStatus = (s) => s === 'CONFIRMED' || s === 'PACKING' || s === 'OUT_FOR_DELIVERY';

/**
 * Android's closest thing to an iOS Live Activity: one ongoing (sticky) notification that updates in
 * place as the order advances. Re-presented with a fixed id, so Confirmed → Packing → On the road all
 * land on the SAME card instead of stacking. Low-importance channel keeps updates silent. No-op off
 * Android (iOS gets real Live Activities later, once there's an Apple Developer account).
 *
 * @param {{orderId:string, orderNumber:string, status:string, windowLabel?:string}} order
 */
export async function presentOrderLive(order) {
  if (Platform.OS !== 'android' || !order || !isLiveStatus(order.status)) return;
  try {
    await ensureAndroidChannels();
    const step = LIVE_STEPS.indexOf(order.status) + 1;
    const [title, body] = LIVE_COPY[order.status] || ['Your order', ''];
    await Notifications.scheduleNotificationAsync({
      identifier: ORDER_LIVE_ID,
      content: {
        title: `${title}`,
        body: order.windowLabel ? `${body} · ${order.windowLabel}` : body,
        subtitle: `${order.orderNumber} · Step ${step} of 4`,
        data: { orderId: order.orderId, status: order.status },
        color: '#1E7A4C',
        sticky: true, // ongoing — the customer can't swipe it away while the order is live
        autoDismiss: false,
        priority: 'low',
      },
      trigger: { channelId: ORDER_LIVE_CHANNEL }, // Android: channel lives on the trigger, not content
    });
  } catch {}
}

/** Remove the live order card (order delivered, cancelled, or no active order). No-op off Android. */
export async function dismissOrderLive() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.dismissNotificationAsync(ORDER_LIVE_ID);
  } catch {}
}
