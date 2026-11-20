/**
 * The daily "order before the cut-off" reminder (Rapture7 brief, NEXT) — at 5 PM IST by default,
 * half an hour before the 17:30 cut-off.
 *
 *   Who:   customers with the app's notifications switched on (a registered device), skipping any
 *          household that already has an order for tomorrow — the brief's rule.
 *   How:   an app push now; WhatsApp too once an approved template is set
 *          (MSG91_WA_TEMPLATE_CUTOFF_REMINDER). Meta classes a reminder like this as a MARKETING
 *          template, which needs the customer's opt-in — so WhatsApp stays off until that exists.
 *   Off by default: switched on in the admin (Growth → Settings → Reminders).
 *
 * Runs once per IST day (an OpsRecord 'reminder' row with id auto-YYYY-MM-DD marks it done, so a
 * restart at 5:01 PM does not send twice). That row is saved to the database BEFORE anything is
 * sent (review #17, 21 Nov 2026). Each send is a cutoff_reminder_sent event, and the day's
 * reminder appears in Weekly insights → Routine so its effect on orders is measured.
 */
import { listOrdersForCustomer } from '../store.js';
import { customersWithDevices, getCustomer } from '../customer-store.js';
import { getOps, getSettings, putOps, putOpsSoft } from '../ops-store.js';
import { emitNotification } from './notify.js';
import { sendTemplate, whatsappEnabled, cutoffReminderTemplate } from './msg91.js';
import { addDaysISO, istInstantMs, todayISO } from './dates.js';
import { track } from './events.js';
import { isErased } from './customer-history.js';
import { reportError } from './sentry.js';
import { isLeader } from './leader.js';

const HAS_ORDER = new Set(['PENDING_PAYMENT', 'CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY']);

/** Who would get today's reminder right now: households with notifications on and no order yet. */
export function reminderAudience(now = Date.now()) {
  const tomorrow = addDaysISO(todayISO(now), 1);
  let reach = 0;
  let ordered = 0;
  for (const cid of customersWithDevices()) {
    const c = getCustomer(cid);
    if (!c || isErased(c) || getOps('deletion', cid)) continue;
    if (
      listOrdersForCustomer(cid).some((o) => o.deliveryDate === tomorrow && HAS_ORDER.has(o.status))
    )
      ordered += 1;
    else reach += 1;
  }
  return { reach, alreadyOrdered: ordered, forDate: tomorrow };
}

/** Send today's reminder if it is time and it has not gone out yet. Returns how many were sent. */
export async function runCutoffReminder(now = Date.now(), { force = false } = {}) {
  const s = getSettings('reminders');
  if (!s.enabled && !force) return 0;
  const today = todayISO(now);
  const doneId = `auto-${today}`;
  if (getOps('reminder', doneId) && !force) return 0;
  if (!force && now < istInstantMs(today, s.time || '17:00')) return 0;
  const tomorrow = addDaysISO(today, 1);
  const channel = whatsappEnabled && cutoffReminderTemplate ? 'BROADCAST' : 'PUSH';
  const marker = {
    at: new Date(now).toISOString(),
    channel,
    communityId: null,
    by: 'system',
  };

  // Save "today's reminder has gone" to the database first, and wait for it. The marker used to be
  // a soft write made AFTER the sends, so a restart mid-send — or before that write landed — found
  // no marker and sent the whole batch again, at whatever time the new process came up
  // (review #17, 21 Nov 2026). If the marker cannot be saved we do not send: a missed reminder is
  // a smaller failure than everyone getting two.
  try {
    await putOps('reminder', doneId, { ...marker, note: 'Automatic 5 PM reminder · sending' });
  } catch (e) {
    reportError(e, { scope: 'cutoff-reminder', what: 'sent-marker' });
    return 0;
  }

  let sent = 0;
  let skipped = 0;
  for (const cid of customersWithDevices()) {
    const c = getCustomer(cid);
    if (!c || isErased(c) || getOps('deletion', cid)) continue;
    const hasOrder = listOrdersForCustomer(cid).some(
      (o) => o.deliveryDate === tomorrow && HAS_ORDER.has(o.status),
    );
    if (hasOrder) {
      skipped += 1;
      continue;
    }
    emitNotification(cid, {
      type: 'CUTOFF_REMINDER',
      title: s.title || 'Order by 5:30 for tomorrow morning',
      body: s.body || 'Tell the farm what to pick tonight — your vegetables arrive by breakfast.',
      data: { action: 'shop', reminder: today },
    });
    track(
      'cutoff_reminder_sent',
      { channel: 'push', sent_at: new Date(now).toISOString(), has_order_for_tomorrow: false },
      { customerId: cid },
    );
    if (whatsappEnabled && cutoffReminderTemplate && c.mobile) {
      sendTemplate({
        mobile: c.mobile,
        template: cutoffReminderTemplate,
        params: [String(c.name || 'there').split(/\s+/)[0]],
      }).catch((e) => reportError(e, { scope: 'cutoff-reminder' }));
      track(
        'cutoff_reminder_sent',
        {
          channel: 'whatsapp',
          sent_at: new Date(now).toISOString(),
          has_order_for_tomorrow: false,
        },
        { customerId: cid },
      );
    }
    sent += 1;
  }
  // The day's reminder in the Routine log, so orders before/after it are compared.
  putOpsSoft('reminder', doneId, {
    ...marker,
    note: `Automatic 5 PM reminder · sent ${sent}, skipped ${skipped} who had already ordered`,
  });
  return sent;
}

let timer = null;
/** Check every minute. Never holds the process open. */
export function startCutoffReminders(everyMs = 60e3) {
  if (timer) return timer;
  timer = setInterval(() => {
    if (!isLeader()) return; // one instance sends (review #14)
    runCutoffReminder().catch((e) => reportError(e, { scope: 'cutoff-reminder' }));
  }, everyMs);
  timer.unref?.();
  return timer;
}
