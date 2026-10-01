/**
 * Order and complaint updates over WhatsApp.
 *
 * WHY THIS EXISTS ALONGSIDE PUSH. lib/push.js already sends the same news over Expo, but Expo only
 * rings a real phone once FCM (Android) and APNs (iOS, which needs an Apple account) are configured
 * — neither is, so today push is accepted and silently goes nowhere. WhatsApp reaches the customer
 * on a number we already verified at sign-in, with no app install required at all. Push stays: when
 * it does start working it is free and instant, and the two are harmless together.
 *
 * NOTHING HERE MAY BREAK AN ORDER. A notification is a side effect of a state change that has
 * already been committed; if Meta is down, or the template was renamed, or the customer's number is
 * not on WhatsApp, the order must still advance. Every send is fire-and-forget and every failure is
 * logged and swallowed.
 *
 * DORMANT UNTIL CONFIGURED. Each template name is read from the environment and may be absent. An
 * absent template is not an error — that notification simply is not sent, exactly as it was before
 * this module existed.
 *
 * OPT-OUT. Customers who reply STOP are suppressed by MSG91's own Opt-out Rules, at the platform
 * level, before a message leaves. There is deliberately no per-customer flag here yet: storing one
 * means a column on Customer, and the production table has drifted from the Prisma schema, so that
 * is a migration to make on purpose rather than a side effect of this feature. These are utility
 * messages about the customer's own order, which is the category WhatsApp expects to be sent
 * without a separate subscription.
 */
import { complaintTemplate, deliveryTemplate, sendTemplate, whatsappEnabled } from './msg91.js';

/** The first name we greet them by. Falls back to a neutral word rather than an empty variable, which Meta rejects. */
const firstName = (customer) =>
  String(customer?.name || '')
    .trim()
    .split(/\s+/)[0] || 'there';

/**
 * Run a send without letting it reach the caller.
 * @param {string} what  for the log line
 * @param {Promise<any>} p
 */
function detach(what, p) {
  p.catch((e) => {
    // eslint-disable-next-line no-console
    console.warn(`[notify] ${what} over WhatsApp failed: ${e?.message || e}`);
  });
}

/**
 * "Your order is on its way" — sent once, when the order goes out for delivery.
 *
 * The door code is the reason this message earns its place: the customer is usually at the door
 * when they need it, and the alternative is opening the app and finding the order. When no code
 * applies, variable 4 carries a sentence that reads correctly on its own rather than an empty
 * string — Meta refuses a blank parameter, and a template cannot omit one conditionally.
 *
 * @param {any} order
 * @param {any} customer
 * @param {string} [when]  human delivery window, e.g. "6:00 am – 12:00 pm"
 */
export function notifyOrderOnTheWay(order, customer, when) {
  if (!whatsappEnabled || !deliveryTemplate) return;
  if (!customer?.mobile || !order?.orderNumber) return;
  const code = order.deliveryOtp
    ? `Please share this door code with our delivery partner: ${order.deliveryOtp}`
    : 'Our delivery partner will hand it over at your door.';
  detach(
    `order ${order.orderNumber}`,
    sendTemplate({
      mobile: customer.mobile,
      template: deliveryTemplate,
      params: [firstName(customer), order.orderNumber, when || 'today', code],
    }),
  );
}

/**
 * "Here is what we did about your complaint" — sent when an issue is resolved or declined.
 *
 * The operator's own words are the message. They are typed free-hand into a prompt, so they arrive
 * with newlines and stray spacing that Meta would reject outright; templateParam() flattens them.
 *
 * @param {any} order
 * @param {any} issue    the resolved issue, carrying `resolution`
 * @param {any} customer
 */
export function notifyComplaintResolved(order, issue, customer) {
  if (!whatsappEnabled || !complaintTemplate) return;
  if (!customer?.mobile || !order?.orderNumber) return;
  // Nothing to say — the operator closed it without writing a reason, and a message that reads
  // "about your complaint: (blank)" is worse than no message.
  const words = String(issue?.resolution || '').trim();
  if (!words) return;
  detach(
    `complaint on ${order.orderNumber}`,
    sendTemplate({
      mobile: customer.mobile,
      template: complaintTemplate,
      params: [firstName(customer), order.orderNumber, words],
    }),
  );
}
