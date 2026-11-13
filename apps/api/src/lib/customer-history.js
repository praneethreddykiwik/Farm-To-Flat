/**
 * Whose order is this, and which of theirs — first, second, twelfth?
 *
 * The order book already knows; nothing new is stored. This module only reads it, so there is no
 * second copy of anyone's history to keep in step, to leak, or to forget to erase.
 *
 * Three decisions live here, on purpose, in one place:
 *
 * WHAT COUNTS AS AN ORDER. One that was actually placed — confirmed, or paid for, or on a cash
 * basis accepted. A checkout that was abandoned at the payment screen, or whose payment failed, was
 * never an order and takes no number. A placed order that was LATER cancelled keeps its number: it
 * happened, and "their first order was cancelled" is exactly the thing an operator needs to see.
 *
 * WHO A CUSTOMER IS. The account, when the order has one. Orders with no account (the demo seed,
 * anything created by hand) are grouped by mobile number, but the number itself never becomes the
 * handle: the key that travels in URLs and into the audit log is a one-way digest of it.
 *
 * WHAT IS SHOWN OF A DELETED ACCOUNT. Its orders are kept, because tax law says they must be; the
 * person is not. No name, no number — and deliberately NOT recovered from the delivery snapshot on
 * an old order, which still carries both. Erasure that a report can undo is not erasure.
 */
import { createHash } from 'node:crypto';

/** Statuses an order is in, or has passed through, only if it was really placed. */
const PLACED = new Set(['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED']);
const IN_HAND = new Set(['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY']);

/**
 * Was this ever a real order? Its current status says so directly, except for a cancelled one —
 * that could be a placed order called off, or a checkout that was abandoned before paying. The
 * timeline tells them apart.
 * @param {{ status: string, timeline?: Array<{ status: string }> }} o
 */
export function wasPlaced(o) {
  if (PLACED.has(o.status)) return true;
  if (o.status !== 'CANCELLED') return false;
  return (o.timeline || []).some((t) => PLACED.has(t.status));
}

/**
 * The handle for "this customer" — an account id, or for an order with no account a digest of its
 * mobile number. Null when an order has neither: it belongs to nobody we can name.
 * @param {{ customerId?: string|null, mobile?: string|null }} o
 */
export function customerKeyOf(o) {
  if (o.customerId) return o.customerId;
  if (!o.mobile) return null;
  return `g_${createHash('sha256').update(`f2f-guest:${o.mobile}`).digest('hex').slice(0, 20)}`;
}

/** "1st", "2nd", "3rd", "11th", "22nd", "113th". */
export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

/** Oldest first; ties broken by order number so the sequence is the same on every read. */
const byPlacement = (a, b) =>
  String(a.createdAt).localeCompare(String(b.createdAt)) ||
  String(a.orderNumber).localeCompare(String(b.orderNumber), 'en', { numeric: true });

/**
 * Every placed order, grouped by customer and put in the order it was placed.
 * @param {any[]} orders
 * @returns {Map<string, any[]>}
 */
export function ordersByCustomer(orders) {
  /** @type {Map<string, any[]>} */
  const groups = new Map();
  for (const o of orders) {
    if (!wasPlaced(o)) continue;
    const key = customerKeyOf(o);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(o);
    else groups.set(key, [o]);
  }
  for (const list of groups.values()) list.sort(byPlacement);
  return groups;
}

/**
 * For every placed order: which of its customer's orders it is, and how many they have in all.
 * An order that was never placed is simply absent.
 * @param {any[]} orders
 * @returns {Map<string, { n: number, of: number }>}  keyed by order id
 */
export function orderNumbers(orders) {
  /** @type {Map<string, { n: number, of: number }>} */
  const out = new Map();
  for (const list of ordersByCustomer(orders).values())
    list.forEach((o, i) => out.set(o.id, { n: i + 1, of: list.length }));
  return out;
}

/** "9848012345" → "••••••2345". Enough to tell two customers apart on the phone; not enough to dial. */
export function maskMobile(mobile) {
  const d = String(mobile || '').replace(/\D/g, '');
  return d.length >= 4 ? `••••••${d.slice(-4)}` : null;
}

/** An account that has been erased keeps its row, under a tombstone in place of the number. */
export const isErased = (customer) => String(customer?.mobile || '').startsWith('deleted_');

/**
 * Where a customer stands, by how many orders they have placed.
 * @param {number} count
 * @returns {'FIRST'|'SECOND'|'REGULAR'}
 */
export const stageOf = (count) => (count <= 1 ? 'FIRST' : count === 2 ? 'SECOND' : 'REGULAR');

/**
 * One customer as the console lists them. No full mobile number, no address — see the module note.
 * @param {string} key
 * @param {any[]} list     this customer's placed orders, oldest first
 * @param {(id: string) => any} getCustomer
 */
export function summarise(key, list, getCustomer) {
  const first = list[0];
  const last = list[list.length - 1];
  const account = first.customerId ? getCustomer(first.customerId) : null;
  const erased = !!first.customerId && (!account || isErased(account));
  const delivered = list.filter((o) => o.status === 'DELIVERED');
  return {
    key,
    hasAccount: !!first.customerId,
    erased,
    // The name on the account today; for an order with no account, the name it was placed under.
    name: erased ? null : account?.name || (first.customerId ? null : last.customerName) || null,
    mobileMasked: erased ? null : maskMobile(account?.mobile || last.mobile),
    community: last.address?.communityName || null,
    orders: list.length,
    stage: stageOf(list.length),
    delivered: delivered.length,
    cancelled: list.filter((o) => o.status === 'CANCELLED').length,
    inHand: list.filter((o) => IN_HAND.has(o.status)).length,
    firstOrderAt: first.createdAt,
    lastOrderAt: last.createdAt,
    lastOrderNumber: last.orderNumber,
    lastStatus: last.status,
    // What they have actually paid for and received. An order still on its way is not "spent" yet,
    // and a cancelled one was refunded.
    spentPaise: delivered.reduce((s, o) => s + Number(o.totalPaise || 0), 0),
  };
}

/**
 * One order in a customer's history. Deliberately thin: which one it was, when, what became of it
 * and what it was worth. The flat it went to and the number that was rung are on the order itself,
 * for the people who have to deliver it — a history does not need them.
 * @param {any} o
 * @param {number} n  1-based position in this customer's orders
 */
export function historyLine(o, n) {
  const names = (o.items || []).map((i) => i.name).filter(Boolean);
  return {
    n,
    label: `${ordinal(n)} order`,
    id: o.id,
    orderNumber: o.orderNumber,
    placedAt: o.createdAt,
    deliveryDate: o.deliveryDate || null,
    window: o.window || null,
    status: o.status,
    totalPaise: Number(o.totalPaise || 0),
    itemCount: (o.items || []).length,
    items: names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4} more` : ''),
    community: o.address?.communityName || null,
    paymentMethod: o.paymentMethod || 'PREPAID',
    couponCode: o.couponCode || null,
  };
}

/**
 * The whole picture, for the list screen.
 * @param {any[]} orders
 * @param {(id: string) => any} getCustomer
 */
export function customerBook(orders, getCustomer) {
  const customers = [];
  for (const [key, list] of ordersByCustomer(orders))
    customers.push(summarise(key, list, getCustomer));
  // Most recent custom first: the people an operator is most likely to be asked about today.
  customers.sort((a, b) => String(b.lastOrderAt).localeCompare(String(a.lastOrderAt)));
  const count = (stage) => customers.filter((c) => c.stage === stage).length;
  const cameBack = customers.filter((c) => c.orders >= 2).length;
  return {
    customers,
    totals: {
      customers: customers.length,
      first: count('FIRST'),
      second: count('SECOND'),
      regular: count('REGULAR'),
      // Of everyone who has ordered, the share who ordered again. Null, not 0, with nobody to count.
      cameBackPct: customers.length ? Math.round((cameBack / customers.length) * 100) : null,
      erased: customers.filter((c) => c.erased).length,
    },
  };
}
