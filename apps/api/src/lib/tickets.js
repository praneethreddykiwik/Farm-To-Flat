/**
 * Support tickets — problems or complaints about using the app (or the website) that are not about
 * one order. A wrong delivery has its own path (the order's "Report a problem", lib/order-issues);
 * this is for "the app will not let me pay", "I cannot change my address", "the screen is blank".
 *
 * A ticket is a short thread: the customer's first message, then replies both ways. The team moves
 * it OPEN → IN_PROGRESS → RESOLVED (or CLOSED when there is nothing to do), and every reply from the
 * team reaches the customer's notification centre and phone.
 *
 * Stored in OpsRecord (kind 'ticket'). Deleting an account deletes its tickets (privacy policy §9).
 */
import { getOps, listOps, putOps, removeOps } from '../ops-store.js';
import { id as newId } from './ids.js';

export const TICKET_CATEGORIES = {
  APP_PROBLEM: 'The app is not working properly',
  PAYMENT: 'Payment or refund',
  ACCOUNT: 'Sign-in or my account',
  DELIVERY: 'Delivery or my community',
  SUGGESTION: 'An idea or suggestion',
  OTHER: 'Something else',
};
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
export const MAX_OPEN_PER_CUSTOMER = 5;
export const MAX_NEW_PER_DAY = 10;

const now = () => new Date().toISOString();

/** "TKT-1001", "TKT-1002", … — something a customer can read out on the phone. */
function nextNumber() {
  let max = 1000;
  for (const t of listOps('ticket')) {
    const n = Number(String(t.number || '').replace(/^TKT-/, ''));
    if (n > max) max = n;
  }
  return `TKT-${max + 1}`;
}

/** @param {{ status?: string, customerId?: string }} [filter] */
export const listTickets = ({ status, customerId } = {}) =>
  listOps('ticket')
    .filter((t) => (!status || t.status === status) && (!customerId || t.customerId === customerId))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

export const getTicket = (ticketId) => getOps('ticket', ticketId);

export function ticketCounts() {
  const c = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0]));
  for (const t of listOps('ticket')) c[t.status] = (c[t.status] || 0) + 1;
  return c;
}

/**
 * A customer raises a ticket. Refused (429) when they already have several open, or have raised
 * many today — a stuck screen can make someone press Send ten times.
 */
/**
 * @param {string} customerId
 * @param {{ category: string, message: string, context?: { platform?: string, appVersion?: string, screen?: string } }} input
 */
export async function createTicket(customerId, { category, message, context = {} }) {
  const mine = listTickets({ customerId });
  const open = mine.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS');
  if (open.length >= MAX_OPEN_PER_CUSTOMER)
    return {
      error: {
        status: 429,
        code: 'TOO_MANY_OPEN',
        message: `You already have ${open.length} open requests. We will reply to those first — add to one of them instead.`,
      },
    };
  const dayAgo = Date.now() - 864e5;
  if (mine.filter((t) => Date.parse(t.createdAt) > dayAgo).length >= MAX_NEW_PER_DAY)
    return {
      error: {
        status: 429,
        code: 'TOO_MANY_TODAY',
        message: 'You have raised a lot of requests today. Please wait for our reply.',
      },
    };
  const at = now();
  const ticket = {
    number: nextNumber(),
    customerId,
    category,
    status: 'OPEN',
    messages: [{ id: newId('msg', 8), from: 'CUSTOMER', text: message, at }],
    context: {
      platform: context.platform || null,
      appVersion: context.appVersion || null,
      screen: context.screen || null,
    },
    createdAt: at,
    updatedAt: at,
    resolvedAt: null,
  };
  return { ticket: await putOps('ticket', newId('tkt', 10), ticket) };
}

/** The customer adds to their own thread. A closed ticket is reopened by a new message. */
export async function customerReply(customerId, ticketId, text) {
  const t = getTicket(ticketId);
  if (!t || t.customerId !== customerId)
    return { error: { status: 404, code: 'NOT_FOUND', message: 'Request not found.' } };
  const at = now();
  t.messages.push({ id: newId('msg', 8), from: 'CUSTOMER', text, at });
  if (t.status === 'RESOLVED' || t.status === 'CLOSED') {
    t.status = 'OPEN';
    t.resolvedAt = null;
  }
  t.updatedAt = at;
  return { ticket: await putOps('ticket', t.id, t) };
}

/** The team replies and/or changes the status. */
export async function teamUpdate(ticketId, { status, reply, actor }) {
  const t = getTicket(ticketId);
  if (!t) return { error: { status: 404, code: 'NOT_FOUND', message: 'Ticket not found.' } };
  const at = now();
  if (reply) t.messages.push({ id: newId('msg', 8), from: 'TEAM', text: reply, at, actor });
  if (status && status !== t.status) {
    t.status = status;
    t.resolvedAt = status === 'RESOLVED' || status === 'CLOSED' ? at : null;
  } else if (reply && t.status === 'OPEN') {
    t.status = 'IN_PROGRESS'; // someone is on it
  }
  t.updatedAt = at;
  return { ticket: await putOps('ticket', t.id, t) };
}

export async function deleteTicket(ticketId) {
  if (!getTicket(ticketId)) return false;
  await removeOps('ticket', ticketId);
  return true;
}

/** Account erasure: every ticket the customer raised goes with the account. */
export async function deleteTicketsOf(customerId) {
  for (const t of listTickets({ customerId })) await removeOps('ticket', t.id);
}

/** What the customer sees: no internal actor emails. */
export const ticketCustomer = (t) => ({
  id: t.id,
  number: t.number,
  category: t.category,
  categoryLabel: TICKET_CATEGORIES[t.category] || t.category,
  status: t.status,
  messages: t.messages.map(({ id, from, text, at }) => ({ id, from, text, at })),
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  resolvedAt: t.resolvedAt,
});
