/**
 * The one place a customer notification is created and delivered.
 *
 * `emitNotification` writes the event to the customer's in-app feed (the notification centre, which
 * they can always open and read back) AND sends an Expo push to their devices. WhatsApp for order
 * and complaint events continues to go through notify-whatsapp.js at the same call sites; this module
 * owns the in-app record + push so every event is tracked in one shape.
 *
 * It is deliberately decoupled from store.js / customer-store.js write paths and is only ever called
 * from ROUTE handlers, to avoid an import cycle (customer-store → lib/*; routes → everything).
 */
import { addNotification, getDevices } from '../customer-store.js';
import { sendExpoPush } from './push.js';

/** Record an event in the feed and push it. `data` travels to the app so it can deep-link. */
export function emitNotification(customerId, { type, title, body, data = {} } = {}) {
  if (!customerId || !title) return null;
  const record = addNotification(customerId, { type, title, body, data });
  const tokens = getDevices(customerId);
  if (tokens?.length) {
    sendExpoPush(tokens, {
      title,
      body,
      data: { ...data, type, notificationId: record?.id },
    });
  }
  return record;
}

/* ── copy helpers ──────────────────────────────────────────────────────────── */

export function firstName(customer) {
  const n = String(customer?.name || '').trim();
  return n ? n.split(/\s+/)[0] : 'there';
}

const rupees = (paise) => `₹${Math.round(Number(paise || 0) / 100).toLocaleString('en-IN')}`;

/** A short, human list of what's in the order — "Tomato · 1 kg, Palak · 2, +3 more". */
export function itemsSummary(order, max = 5) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return '';
  const fmt = (l) => {
    const q = Number(l.quantity);
    const qty = Number.isFinite(q)
      ? q % 1 === 0
        ? String(q)
        : q.toFixed(2).replace(/0$/, '')
      : '';
    const unit = l.unit && l.unit !== 'piece' && l.unit !== 'pc' ? ` ${l.unit}` : '';
    return `${l.name}${qty ? ` · ${qty}${unit}` : ''}`;
  };
  const shown = items.slice(0, max).map(fmt).join(', ');
  const extra = items.length > max ? `, +${items.length - max} more` : '';
  return shown + extra;
}

/**
 * In-app + push copy for each lifecycle event, keyed by a notification type. Returns { title, body }.
 * The caller supplies the order / extras. Kept here so every surface reads the same wording.
 */
export const COPY = {
  ORDER_PLACED: (o) => ({
    title: 'Order placed 🌱',
    body: `${o.orderNumber} is confirmed — we'll harvest it fresh. Tap to track your order.`,
  }),
  ORDER_PACKED: (o) => ({
    title: 'Packed & ready 📦',
    body: `${o.orderNumber} has been packed this morning and is ready for delivery.`,
  }),
  ORDER_OUT: (o, when) => {
    const items = itemsSummary(o);
    const code = o.deliveryOtp ? ` Your door code is ${o.deliveryOtp}.` : '';
    const win = when ? ` (${when})` : '';
    return {
      title: 'Out for delivery 🛵',
      body: `${o.orderNumber} is on its way${win}${items ? `: ${items}.` : '.'}${code}`,
    };
  },
  ORDER_DELIVERED: (o) => ({
    title: 'Delivered ✅',
    body: `${o.orderNumber} has been delivered. Please check the bag — anything wrong? Report it from your order screen.`,
  }),
  ORDER_CANCELLED: (o) => ({
    title: 'Order cancelled',
    body: `${o.orderNumber} was cancelled before packing.${
      o.refundPaise ? ` ${rupees(o.refundPaise)} will be refunded.` : ''
    }`,
  }),
  CANCEL_REQUESTED: (o) => ({
    title: 'Cancellation requested',
    body: `We've received your request to cancel ${o.orderNumber}. As it was already packed, our team will confirm shortly.`,
  }),
  REFUND_INITIATED: (o, days) => ({
    title: 'Refund initiated 💸',
    body: `A refund for ${o.orderNumber}${o.refundPaise ? ` of ${rupees(o.refundPaise)}` : ''} has been initiated. It usually reaches you in ${days} working day${days === 1 ? '' : 's'}.`,
  }),
  FEEDBACK_INVITE: (o) => ({
    title: 'How was your order? ⭐',
    body: `We'd love your feedback on ${o.orderNumber}. Tap to rate your order — it takes a moment.`,
  }),
  COMPLAINT_REPLY: (o, reply) => ({
    title: 'Update on your complaint 💬',
    body: `Our team replied about ${o.orderNumber}: ${reply}`,
  }),
};
