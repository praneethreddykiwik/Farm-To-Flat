/**
 * "Tomorrow's order" in the Dynamic Island (25 Nov 2026): what the card says and when it is shown.
 * Pure: no React Native, no native module. The card itself is targets/order-island (SwiftUI).
 *
 *   Skip tomorrow · Confirm order   →   Cash on delivery · Pay ₹620
 *
 * Skip and Confirm happen inside the island. Cash and Pay are links that open the app on
 * /confirm/<date>, which places the order or opens Razorpay straight away. They carry a random
 * token that only the card knows: without it the link just opens the screen, so a link in a message
 * or on a web page cannot place an order.
 */
import { addDaysISO, formatDateShort, parseISODate, windowLabel } from './dates';
import { formatPaise } from './money';
import { openWindowOn, orderForMeals, quoteLines } from './planOrder';

/** The card comes up this long before ordering closes, and never later than 6 pm the day before. */
export const LEAD_MS = 2 * 60 * 60 * 1000;

/** Midnight IST at the start of the delivery day: after it, "tomorrow" would be wrong. */
const dayStartMs = (dateISO) => parseISODate(dateISO).getTime() - 12 * 60 * 60 * 1000;

export function closesAtFor(cutoffMs, dateISO) {
  return Math.min(cutoffMs, dayStartMs(dateISO));
}

export function popAtFor(closesAtMs, dateISO) {
  const sixPmBefore = parseISODate(addDaysISO(dateISO, -1)).getTime() + 6 * 60 * 60 * 1000;
  return Math.min(closesAtMs - LEAD_MS, sixPmBefore);
}

/**
 * Tomorrow's planned day, if it still needs an answer.
 * @param {{ scheduled: any[], productsById: Record<string, any>, today: string }} p
 * @returns {{ date: string, planId: string, items: { productId: string, quantity: string }[] } | null}
 */
export function tomorrowsPlan({ scheduled, productsById, today }) {
  const date = addDaysISO(today, 1);
  const plan = (scheduled || []).find((p) => p.days.some((d) => d.date === date));
  if (!plan) return null;
  if ((plan.ordered || []).includes(date) || (plan.skipped || []).includes(date)) return null;
  const { lines } = orderForMeals(plan.days.find((d) => d.date === date)?.meals, productsById);
  const items = quoteLines(lines);
  return items.length ? { date, planId: plan.id, items } : null;
}

/**
 * The card's contents, or null when tomorrow's order cannot honestly be offered: no open window on
 * that day, no price from the server, an item that is gone, or a coupon checkout would refuse.
 *
 * @param {{ plan: any, windows: any[]|undefined, quote: any, now: number }} p
 */
export function buildCard({ plan, windows, quote, now }) {
  if (!plan || !quote) return null;
  const slot = openWindowOn(windows, plan.date);
  const cutoff = slot ? Date.parse(slot.cutoffAt) : NaN;
  if (!Number.isFinite(cutoff)) return null;
  const closesAtMs = closesAtFor(cutoff, plan.date);
  if (closesAtMs <= now) return null;
  const total = Number(quote.totalPaise);
  if (!(total > 0) || quote.missing?.length || quote.couponError) return null;

  const gap = Number(quote.minOrderValuePaise) - Number(quote.subtotalPaise);
  const short = !quote.meetsMinimum && gap > 0;
  const fromWallet = Math.min(Number(quote.walletBalancePaise || 0), total);
  const due = total - fromWallet;
  const [rupees, frac] = formatPaise(total, { symbol: false, compact: false }).split('.');
  return {
    date: plan.date,
    title: 'Tomorrow’s order',
    when: `${formatDateShort(plan.date)} · ${windowLabel(slot.window, slot)}`,
    items: `${quote.itemCount} ${quote.itemCount === 1 ? 'item' : 'items'}`,
    rupees,
    paise: `.${frac || '00'}`,
    payLabel: due > 0 ? `Pay ${formatPaise(due)}` : 'Pay from wallet',
    cashAllowed: !!quote.codAllowed,
    shortBy: short ? `Add ${formatPaise(gap)} more` : null,
    closesAtMs,
    totalPaise: String(total),
  };
}

/** Two cards that say the same thing. The token is not part of it. */
export const cardSignature = (c) =>
  [c.date, c.when, c.items, c.totalPaise, c.payLabel, c.cashAllowed, c.shortBy, c.closesAtMs].join(
    '|',
  );

/**
 * What to do about the card right now.
 *
 * @param {{
 *   card: any|null,          // buildCard's answer
 *   known: boolean,          // everything needed to decide has loaded (else leave the card alone)
 *   live: any[],             // cards iOS holds now (native list())
 *   saved: any|null,         // what we last put up: { date, sig, popAt }
 *   now: number,
 *   canSchedule: boolean,    // iOS 26+
 *   force?: boolean,         // "Show on Dynamic Island" pressed
 * }} p
 * @returns {'none'|'end'|'start'|'schedule'|'update'}
 */
export function decideIsland({ card, known, live, saved, now, canSchedule, force = false }) {
  if (!known) return 'none';
  if (!card) return live.some((l) => l.step !== 'skipped') ? 'end' : 'none';
  if (force) return 'start';
  const popAt = popAtFor(card.closesAtMs, card.date);
  const mine = live.find((l) => l.date === card.date);
  if (mine) {
    if (mine.step === 'skipped') return 'none';
    if (saved?.date === card.date && saved.sig === cardSignature(card)) return 'none';
    // A card still waiting for its time is replaced whole; one on screen is updated where it is.
    if (mine.state === 'pending') return now >= popAt ? 'start' : 'schedule';
    return 'update';
  }
  // Put up before and gone now: swiped away, or iOS took it down. Asking twice is nagging.
  if (saved?.date === card.date && now >= saved.popAt) return 'none';
  if (now >= popAt) return 'start';
  return canSchedule ? 'schedule' : 'none';
}

/**
 * Is this link from the card we put up? Returns what the card showed, or null.
 * @param {any} saved @param {{ date: string, token?: string }} link
 */
export function cardForLink(saved, { date, token }) {
  if (!saved?.token || !token || saved.date !== date || saved.token !== token) return null;
  return saved;
}

/**
 * The link was genuine. May it act on its own, or must the customer look first?
 * @param {{ action: string, card: any, quote: any, slotOnDay: boolean, ordered: boolean }} p
 * @returns {{ go: boolean, title?: string, message?: string }}
 */
export function mayAct({ action, card, quote, slotOnDay, ordered }) {
  if (ordered) return { go: false, title: 'Already ordered for this day' };
  if (!slotOnDay)
    return {
      go: false,
      title: 'Ordering for that day has closed',
      message: 'Nothing was ordered and nothing was charged.',
    };
  if (!quote) return { go: false, title: 'Check the order, then press the button below' };
  if (String(quote.totalPaise) !== String(card.totalPaise))
    return {
      go: false,
      title: 'The total has changed',
      message: `It is now ${formatPaise(quote.totalPaise)}. Check it, then press the button below.`,
    };
  if (!quote.meetsMinimum) return { go: false, title: 'This order is under the minimum' };
  if (action === 'cod' && !quote.codAllowed)
    return {
      go: false,
      title: 'Cash on delivery is not available',
      message: 'You can still pay online below.',
    };
  return { go: true };
}
