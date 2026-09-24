/**
 * Expo push delivery for order updates. When an order advances (Confirmed → Packing → On the road →
 * Delivered) we notify the customer's registered devices.
 *
 * NOTE ON DELIVERY: Expo relays to Apple (APNs) and Google (FCM). Android delivery needs an FCM
 * key configured in EAS credentials and a build that includes it; iOS needs APNs (an Apple account).
 * Until those exist Expo accepts the request but a real phone won't ring. This module is a safe
 * no-op in that case — the app's live in-app status still updates by polling.
 */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Friendly copy per fulfilment status. Keys match the order.status values the app already uses.
const MESSAGES = {
  CONFIRMED: (o) => ({
    title: 'Order confirmed 🌱',
    body: `${o.orderNumber} is in — we'll harvest it fresh.`,
  }),
  PACKING: () => ({ title: 'Packing your order 📦', body: 'Weighed and bagged this morning.' }),
  // The code goes in the notification itself: the customer is usually holding the door open when
  // they need it, and making them open the app, find the order and scroll is the wrong moment.
  // Cash is named here too, so there is time to fetch it before the knock.
  OUT_FOR_DELIVERY: (o) => {
    const cash =
      o.paymentMethod === 'COD'
        ? Math.max(0, Number(o.totalPaise) - Number(o.codCollectedPaise || 0))
        : 0;
    const bits = [];
    if (o.deliveryOtp) bits.push(`Your code is ${o.deliveryOtp}`);
    if (cash > 0) bits.push(`keep ₹${Math.round(cash / 100)} ready`);
    return {
      title: 'On its way 🛵',
      body: bits.length ? `${bits.join(' — ')}.` : 'Heading to your block now.',
    };
  },
  DELIVERED: () => ({
    title: 'Delivered ✅',
    body: 'Please check the bag. Anything wrong? Send us a photo from your order screen.',
  }),
  CANCELLED: (o) => ({ title: 'Order cancelled', body: `${o.orderNumber} was cancelled.` }),
};

/** POST a batch of messages to Expo's push service. Only well-formed Expo tokens are sent. */
export async function sendExpoPush(tokens, { title, body, data }) {
  const valid = (tokens || []).filter(
    (t) => typeof t === 'string' && t.startsWith('ExponentPushToken'),
  );
  if (!valid.length) return;
  const messages = valid.map((to) => ({
    to,
    title,
    body,
    data: data || {},
    sound: 'default',
    channelId: 'orders',
    priority: 'high',
  }));
  try {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[push] send failed:', e?.message || e);
  }
}

/**
 * Notify an order's customer of its new status. `getDevices(customerId)` returns their push tokens.
 * Fire-and-forget; safe no-op when there is no customer, no devices, or no message for the status.
 */
export function notifyOrderStatus(order, getDevices) {
  if (!order?.customerId) return;
  const make = MESSAGES[order.status];
  if (!make) return;
  const tokens = getDevices(order.customerId);
  if (!tokens?.length) return;
  const { title, body } = make(order);
  sendExpoPush(tokens, { title, body, data: { orderId: order.id, status: order.status } });
}
