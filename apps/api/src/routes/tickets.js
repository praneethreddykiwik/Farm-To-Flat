/**
 * Support tickets — customer side (signed in) and the team's side (admin).
 *
 *   GET    /support/tickets                 my requests, newest first, with the categories to pick
 *   POST   /support/tickets                 raise one: { category, message, context? }
 *   GET    /support/tickets/:id             one of mine
 *   POST   /support/tickets/:id/messages    add to my thread (reopens a resolved one)
 *
 *   GET    /admin/tickets?status=           every ticket, with counts per status
 *   GET    /admin/tickets/:id               one, with who raised it (number masked)
 *   PATCH  /admin/tickets/:id               { status?, reply? } — the reply reaches the customer
 *   DELETE /admin/tickets/:id               remove (test or spam)
 *
 * The full design is in lib/tickets.js.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateBody } from '../validate.js';
import { getCustomer } from '../customer-store.js';
import { recordAction } from '../lib/audit.js';
import { emitNotification } from '../lib/notify.js';
import { notifyAdmins } from '../lib/staff-notify.js';
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  createTicket,
  customerReply,
  deleteTicket,
  getTicket,
  listTickets,
  teamUpdate,
  ticketCounts,
  ticketCustomer,
} from '../lib/tickets.js';

const unwrap = (r) => {
  if (r.error) throw fail(r.error.status, r.error.code, r.error.message);
  return r;
};
const CATEGORY = z.enum(
  /** @type {[string, ...string[]]} */ (/** @type {unknown} */ (Object.keys(TICKET_CATEGORIES))),
);
const STATUS = z.enum(/** @type {[string, ...string[]]} */ (TICKET_STATUSES));
const text = (max) => z.string().trim().min(3, 'Tell us a little more.').max(max);
const categories = Object.entries(TICKET_CATEGORIES).map(([key, label]) => ({ key, label }));

// ── customer ─────────────────────────────────────────────────────────────────
export const ticketsRouter = Router();

ticketsRouter.get(
  '/',
  asyncHandler(async (req, res) =>
    res.json({
      tickets: listTickets({ customerId: req.customerId }).map(ticketCustomer),
      categories,
    }),
  ),
);

ticketsRouter.post(
  '/',
  validateBody(
    z.object({
      category: CATEGORY,
      message: text(1000),
      context: z
        .object({
          platform: z.enum(['ios', 'android', 'web']).optional(),
          appVersion: z.string().max(40).optional(),
          screen: z.string().max(60).optional(),
        })
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { ticket } = unwrap(await createTicket(req.customerId, req.body));
    notifyAdmins({
      title: `New support request ${ticket.number}`,
      body: `${TICKET_CATEGORIES[ticket.category]} · ${req.body.message.slice(0, 80)}`,
      data: { type: 'SUPPORT_TICKET', ticketId: ticket.id },
    });
    res.status(201).json({ ticket: ticketCustomer(ticket) });
  }),
);

ticketsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const t = getTicket(req.params.id);
    if (!t || t.customerId !== req.customerId) throw fail(404, 'NOT_FOUND', 'Request not found.');
    res.json({ ticket: ticketCustomer(t) });
  }),
);

ticketsRouter.post(
  '/:id/messages',
  validateBody(z.object({ text: text(1000) })),
  asyncHandler(async (req, res) => {
    const { ticket } = unwrap(await customerReply(req.customerId, req.params.id, req.body.text));
    notifyAdmins({
      title: `Reply on ${ticket.number}`,
      body: req.body.text.slice(0, 100),
      data: { type: 'SUPPORT_TICKET', ticketId: ticket.id },
    });
    res.json({ ticket: ticketCustomer(ticket) });
  }),
);

// ── team ─────────────────────────────────────────────────────────────────────
export const adminTicketsRouter = Router();

const maskMobile = (m) => (m ? `${String(m).slice(0, 2)}••••••${String(m).slice(-2)}` : null);
function ticketAdmin(t) {
  const c = getCustomer(t.customerId);
  return {
    ...t,
    categoryLabel: TICKET_CATEGORIES[t.category] || t.category,
    customer: c
      ? { id: c.id, name: c.name || null, mobileMasked: maskMobile(c.mobile) }
      : { id: t.customerId, name: null, mobileMasked: null },
  };
}

adminTicketsRouter.get(
  '/tickets',
  asyncHandler(async (req, res) => {
    const status = TICKET_STATUSES.includes(String(req.query.status))
      ? String(req.query.status)
      : undefined;
    res.json({
      tickets: listTickets({ status }).map(ticketAdmin),
      counts: ticketCounts(),
      categories,
      statuses: TICKET_STATUSES,
    });
  }),
);

adminTicketsRouter.get(
  '/tickets/:id',
  asyncHandler(async (req, res) => {
    const t = getTicket(req.params.id);
    if (!t) throw fail(404, 'NOT_FOUND', 'Ticket not found.');
    res.json({ ticket: ticketAdmin(t) });
  }),
);

adminTicketsRouter.patch(
  '/tickets/:id',
  validateBody(
    z
      .object({ status: STATUS.optional(), reply: z.string().trim().min(1).max(1000).optional() })
      .refine((b) => b.status || b.reply, 'Change the status or write a reply.'),
  ),
  asyncHandler(async (req, res) => {
    const before = getTicket(req.params.id);
    const { ticket } = unwrap(
      await teamUpdate(req.params.id, { ...req.body, actor: req.staff?.email || 'admin' }),
    );
    await recordAction({
      staff: req.staff,
      action: 'TICKET_UPDATED',
      target: ticket.id,
      details: {
        number: ticket.number,
        from: before?.status,
        to: ticket.status,
        replied: !!req.body.reply,
      },
    });
    // The customer hears about a reply, and about the request being closed off.
    const closed = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';
    if (req.body.reply || (closed && before?.status !== ticket.status))
      emitNotification(ticket.customerId, {
        type: 'TICKET_REPLY',
        title: req.body.reply
          ? `Reply to your request ${ticket.number}`
          : `Your request ${ticket.number} is ${ticket.status === 'RESOLVED' ? 'resolved' : 'closed'}`,
        body: req.body.reply ? req.body.reply.slice(0, 160) : 'Open it to see the details.',
        data: { ticketId: ticket.id, ticketNumber: ticket.number },
      });
    res.json({ ticket: ticketAdmin(ticket) });
  }),
);

adminTicketsRouter.delete(
  '/tickets/:id',
  asyncHandler(async (req, res) => {
    const t = getTicket(req.params.id);
    if (!(await deleteTicket(req.params.id))) throw fail(404, 'NOT_FOUND', 'Ticket not found.');
    await recordAction({
      staff: req.staff,
      action: 'TICKET_DELETED',
      target: req.params.id,
      details: { number: t?.number },
    });
    res.json({ ok: true });
  }),
);
