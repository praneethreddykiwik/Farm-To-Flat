/**
 * The tracking events in Rapture7's Developer Tracking Brief (19 Nov 2026) — recorded on OUR
 * server, in the OpsRecord table (kind 'event'). No third-party analytics SDK, no paid attribution
 * service: the brief asks for none, and every one of these facts already passes through the API.
 *
 * Privacy (DPDP): an event carries the account id and business facts (order value, community,
 * tower, source) — never a name, a mobile number or a flat. The weekly export goes further and
 * replaces the account id with a one-way key, so the agency reading it never sees who anyone is.
 *
 * Server-side events are recorded where the fact happens (sign-in, address saved, order placed,
 * delivered, refunded, referral paid, waitlist vote, reminder sent). A short allowlist of events
 * that only the phone can see (install referrer, checkout opened, link shared, reorder tapped,
 * voice used, reminder opened) comes in through POST /api/v1/events.
 *
 * Writes are SOFT: recording must never be the reason a customer cannot sign in or order.
 */
import { randomBytes } from 'node:crypto';
import { getSettings, listOps, putOpsSoft } from '../ops-store.js';
import { getCommunity } from '../store.js';
import { communityWindows } from './windows.js';
import { istInstantMs } from './dates.js';

/** Every event the brief names, with its phase. Anything else is refused. */
export const EVENT_NAMES = {
  // NOW
  signed_in: 'server',
  community_selected: 'server',
  install_source_captured: 'client',
  source_answered: 'server',
  order_placed: 'server',
  order_delivered: 'server',
  order_refunded: 'server',
  referral_reward_applied: 'server',
  waitlist_vote: 'server',
  // NEXT
  cutoff_reminder_sent: 'server',
  cutoff_reminder_opened: 'client',
  checkout_started: 'client',
  referral_link_shared: 'client',
  repeat_basket_used: 'client',
  voice_order_used: 'client',
  // LATER (built early, 20 Nov 2026 — each is one line in the app)
  product_viewed: 'client',
  product_story_viewed: 'client',
  cart_updated: 'client',
  // Meal planner usage (strategy discussion, 22 Nov 2026)
  planner_nudge_shown: 'client',
  planner_nudge_tapped: 'client',
  planner_nudge_dismissed: 'client',
  planner_opened: 'client',
  plan_generated: 'client',
  plan_scheduled: 'client',
  meal_logged: 'server',
};

export const CLIENT_EVENTS = Object.keys(EVENT_NAMES).filter((n) => EVENT_NAMES[n] === 'client');

const newId = () => `ev_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;

/** Keep only small, flat, non-personal values: strings ≤120, numbers, booleans. */
function clean(props = {}) {
  const out = {};
  for (const [k, v] of Object.entries(props || {}).slice(0, 25)) {
    if (!/^[a-z_]{1,40}$/.test(k)) continue;
    if (/mobile|phone|name|flat|email|address/.test(k)) continue; // never personal data
    if (typeof v === 'string') out[k] = v.slice(0, 120);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean' || v === null) out[k] = v;
  }
  return out;
}

/**
 * Record an event. Never throws.
 * @param {string} name   one of EVENT_NAMES
 * @param {object} [props]
 * @param {{ customerId?: string|null, at?: string }} [who]
 */
export function track(name, props = {}, { customerId = null, at } = {}) {
  try {
    if (!EVENT_NAMES[name]) return null;
    // Admin → Friday report → Events: tracking as a whole, or one event, can be switched off.
    const t = getSettings('tracking');
    if (t.enabled === false || (t.disabledEvents || []).includes(name)) return null;
    const ev = {
      name,
      customerId: customerId || null,
      at: at || new Date().toISOString(),
      props: clean(props),
    };
    return putOpsSoft('event', newId(), ev);
  } catch {
    return null;
  }
}

/** Events in a date range (ISO instants), newest first. */
export function listEvents({ fromMs = 0, toMs = Date.now() + 864e5, name = null } = {}) {
  return listOps('event')
    .filter(
      (e) => (!name || e.name === name) && Date.parse(e.at) >= fromMs && Date.parse(e.at) <= toMs,
    )
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Which app sent the request: React Native on Android uses okhttp; on iOS, CFNetwork/Darwin. */
export function platformOf(req) {
  const ua = String(req.get?.('user-agent') || '');
  if (/okhttp|android/i.test(ua)) return 'android';
  if (/cfnetwork|darwin|iphone|ipad/i.test(ua)) return 'ios';
  return 'web';
}

/**
 * order_delivered, with on_time: delivered inside the order's own delivery window on its delivery
 * day (06:00–10:00 for the standard morning run). Unknown window → on_time null, never a guess.
 */
export function trackDelivered(order) {
  if (!order?.id || order.status !== 'DELIVERED') return;
  let onTime = null;
  try {
    const c = getCommunity(order.address?.communityId);
    const def = c ? communityWindows(c).find((w) => w.key === order.window) : null;
    if (def && order.deliveryDate && order.deliveredAt) {
      const at = Date.parse(order.deliveredAt);
      onTime =
        at >= istInstantMs(order.deliveryDate, def.start) &&
        at <= istInstantMs(order.deliveryDate, def.end);
    }
  } catch {
    onTime = null;
  }
  track(
    'order_delivered',
    {
      order_id: order.id,
      delivered_at: order.deliveredAt || new Date().toISOString(),
      on_time: onTime,
    },
    { customerId: order.customerId },
  );
}
