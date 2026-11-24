/**
 * Are the "order before the cut-off" reminders working? (Discussion on Fooducia Strategies,
 * 22 Nov 2026: "track if orders have increased after we sent reminders".)
 *
 * For each day a reminder went out:
 *   sent      people it was sent to
 *   opened    of those, how many tapped it (app notifications only; WhatsApp does not tell us)
 *   ordered   of those, how many placed an order later that same day
 *   orders    every order in the 2 hours after it, against `usual`: the average for the same two
 *             hours on up to four earlier same weekdays with no reminder
 * and the same totals for the period before, so it is plain whether interest is rising or falling.
 *
 * An order after a reminder is not proof the reminder caused it. `usual` is there so nobody has to
 * guess; with no comparable day it is null, never zero.
 */
import { listOrders } from '../store.js';
import { listOps } from '../ops-store.js';
import { listEvents } from './events.js';
import { wasPlaced } from './customer-history.js';
import { addDaysISO, istInstantMs } from './dates.js';
import { REMINDER_WINDOW_H, istDate } from './insights.js';

const USUAL_DAYS = 4;
const USUAL_LOOKBACK_WEEKS = 8;
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
/** One person once. An erased account's events have no id: each stays its own count. */
const who = (e) => e.customerId || `gone:${e.id}`;

function context() {
  const orders = listOrders()
    .filter(wasPlaced)
    .map((o) => ({ at: Date.parse(o.createdAt), day: istDate(o.createdAt), cid: o.customerId }));
  const byCustomer = new Map();
  for (const o of orders) {
    if (!byCustomer.has(o.cid)) byCustomer.set(o.cid, []);
    byCustomer.get(o.cid).push(o);
  }
  const sent = listEvents({ name: 'cutoff_reminder_sent' });
  const opened = listEvents({ name: 'cutoff_reminder_opened' });
  const reminderDays = new Set([
    ...sent.map((e) => istDate(e.at)),
    ...listOps('reminder').map((r) => istDate(r.at)),
  ]);
  return { orders, byCustomer, sent, opened, reminderDays };
}

const ordersIn = (orders, from, to) => orders.filter((o) => o.at >= from && o.at < to).length;

/** Average orders in the same window on earlier same weekdays that had no reminder. */
function usualFor(ctx, day, offsetMs, windowMs) {
  const first = ctx.orders.length ? Math.min(...ctx.orders.map((o) => o.at)) : Infinity;
  const counts = [];
  for (let w = 1; w <= USUAL_LOOKBACK_WEEKS && counts.length < USUAL_DAYS; w += 1) {
    const d = addDaysISO(day, -7 * w);
    const start = istInstantMs(d, '00:00') + offsetMs;
    if (ctx.reminderDays.has(d) || start < first) continue;
    counts.push(ordersIn(ctx.orders, start, start + windowMs));
  }
  if (!counts.length) return null;
  return {
    average: Math.round((counts.reduce((a, b) => a + b, 0) / counts.length) * 10) / 10,
    days: counts.length,
  };
}

function dayRow(ctx, day) {
  const sentAt = new Map();
  let whatsapp = 0;
  for (const e of ctx.sent.filter((x) => istDate(x.at) === day)) {
    if (e.props?.channel === 'whatsapp') whatsapp += 1;
    const k = who(e);
    const t = Date.parse(e.at);
    if (!sentAt.has(k) || t < sentAt.get(k)) sentAt.set(k, t);
  }
  const openers = new Set(
    ctx.opened
      .filter((e) => (e.props?.sent_on || istDate(e.at)) === day)
      .map(who)
      .filter((k) => sentAt.has(k) || k.startsWith('gone:')),
  );
  const orderedBy = (keys) =>
    [...keys].filter((k) =>
      (ctx.byCustomer.get(k) || []).some((o) => o.day === day && o.at >= sentAt.get(k)),
    ).length;
  const t0 = Math.min(...sentAt.values());
  const w = REMINDER_WINDOW_H * 3600e3;
  const after = ordersIn(ctx.orders, t0, t0 + w);
  const usual = usualFor(ctx, day, t0 - istInstantMs(day, '00:00'), w);
  return {
    date: day,
    at: new Date(t0).toISOString(),
    sent: sentAt.size,
    whatsapp,
    opened: openers.size,
    openedPct: pct(openers.size, sentAt.size),
    ordered: orderedBy(sentAt.keys()),
    orderedPct: pct(orderedBy(sentAt.keys()), sentAt.size),
    openedAndOrdered: orderedBy([...openers].filter((k) => sentAt.has(k))),
    ordersAfter: after,
    usual: usual?.average ?? null,
    usualDays: usual?.days ?? 0,
    change: usual ? Math.round((after - usual.average) * 10) / 10 : null,
  };
}

function rowsFor(ctx, { from, to }) {
  const days = new Set(ctx.sent.map((e) => istDate(e.at)).filter((d) => d && d >= from && d <= to));
  return [...days].sort().map((d) => dayRow(ctx, d));
}

function totals(rows) {
  const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
  return {
    reminders: rows.length,
    sent: sum('sent'),
    opened: sum('opened'),
    ordered: sum('ordered'),
    openedPct: pct(sum('opened'), sum('sent')),
    orderedPct: pct(sum('ordered'), sum('sent')),
  };
}

/** 'up' | 'down' | 'same' | null — null when either side has nothing to compare. */
function direction(now, before) {
  if (now == null || before == null) return null;
  const d = Math.round((now - before) * 10) / 10;
  return { points: d, way: d > 0 ? 'up' : d < 0 ? 'down' : 'same' };
}

export function reminderEffect({ from, to }) {
  const ctx = context();
  const span = Math.round((istInstantMs(to, '00:00') - istInstantMs(from, '00:00')) / 864e5) + 1;
  const prev = { from: addDaysISO(from, -span), to: addDaysISO(from, -1) };
  const rows = rowsFor(ctx, { from, to });
  const now = totals(rows);
  const before = totals(rowsFor(ctx, prev));
  return {
    windowHours: REMINDER_WINDOW_H,
    now,
    before,
    comparedWith: prev,
    trend: {
      opened: direction(now.openedPct, before.openedPct),
      ordered: direction(now.orderedPct, before.orderedPct),
    },
    days: rows.reverse(),
  };
}
