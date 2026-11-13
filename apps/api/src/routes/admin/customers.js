/**
 * Customers — every customer's orders in the order they were placed: first, second, and on.
 *
 *   GET  /admin/customers                 everyone who has ordered, with where they stand
 *   GET  /admin/customers/:key            one customer's orders, numbered
 *   POST /admin/customers/:key/contact    their mobile number — asked for, with a reason, and recorded
 *
 * This is personal data about people who gave it to us to be fed, not to be studied, so the routes
 * are built to the Digital Personal Data Protection Act's duties rather than to convenience:
 *
 *   PURPOSE (s.4, s.5)   Serving and supporting the customer, and knowing how many come back. Not a
 *                        contact list: there is no export here and none should be added. Messaging
 *                        customers for marketing needs its own consent, which nobody has given.
 *   NO MORE THAN NEEDED  The list carries a masked number and a community — never the full number,
 *   (s.6, s.8)           never a flat. One customer's history carries what was ordered and what
 *                        became of it; the address and the phone stay on the order, for the people
 *                        delivering it.
 *   SAFEGUARDS (s.8(5))  Admin and Super admin only. Opening a person's history is written to the
 *                        audit trail; so is every number revealed, with the reason given. If the
 *                        trail cannot be written, the data is not shown.
 *   ERASURE (s.8(7),     An account that was deleted still has orders — the tax law requires the
 *   s.12)                record — but it has no name and no number here, and neither is recovered
 *                        from an old order's delivery details.
 *
 * Nothing is stored for any of this. The order book is read and counted on each request.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../../http.js';
import { validateBody } from '../../validate.js';
import { listOrders } from '../../store.js';
import { getCustomer } from '../../customer-store.js';
import { recordAction } from '../../lib/audit.js';
import {
  customerBook,
  historyLine,
  isErased,
  ordersByCustomer,
  summarise,
} from '../../lib/customer-history.js';

export const adminCustomersRouter = Router();

/** Why a number may be asked for. A closed list: each is a reason to RING someone about an order. */
export const CONTACT_REASONS = {
  DELIVERY: 'A delivery or an order in hand',
  COMPLAINT: 'A complaint or a refund',
  PAYMENT: 'A payment query',
};

const digitsOf = (s) => String(s || '').replace(/\D/g, '');

adminCustomersRouter.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const orders = listOrders();
    const book = customerBook(orders, getCustomer);
    const stage = String(req.query.stage || '').toUpperCase();
    const q = String(req.query.q || '')
      .trim()
      .toLowerCase();
    let customers = book.customers;
    if (['FIRST', 'SECOND', 'REGULAR'].includes(stage))
      customers = customers.filter((c) => c.stage === stage);
    if (q) {
      // A name, an order number, or a mobile number. The number is matched here, against the real
      // one, so an operator holding a customer on the phone can find them — but what comes back is
      // still the masked form. Fewer than four digits would be a way to page through everyone.
      const digits = digitsOf(q);
      const byKey = ordersByCustomer(orders);
      customers = customers.filter((c) => {
        if (c.name && c.name.toLowerCase().includes(q)) return true;
        const list = byKey.get(c.key) || [];
        if (list.some((o) => String(o.orderNumber).toLowerCase().includes(q))) return true;
        if (c.erased || digits.length < 4) return false;
        const account = list[0].customerId ? getCustomer(list[0].customerId) : null;
        const mobile = digitsOf(account?.mobile || list[list.length - 1].mobile);
        return digits.length === 10 ? mobile.endsWith(digits) : mobile.includes(digits);
      });
    }
    res.json({ totals: book.totals, customers, reasons: CONTACT_REASONS });
  }),
);

/** The customer behind a key, or a 404 — never a hint about whether a key was merely malformed. */
function find(key) {
  const list = ordersByCustomer(listOrders()).get(key);
  if (!list) throw fail(404, 'NOT_FOUND', 'No customer with orders matches that.');
  return list;
}

adminCustomersRouter.get(
  '/customers/:key',
  asyncHandler(async (req, res) => {
    const list = find(req.params.key);
    // Recorded BEFORE anything is returned, and awaited: recordAction throws when the trail cannot
    // be written, and a history nobody can be shown to have opened is not one we hand over.
    await recordAction({
      staff: req.staff,
      action: 'CUSTOMER_HISTORY_VIEWED',
      target: req.params.key,
      details: { orders: list.length },
    });
    res.json({
      customer: summarise(req.params.key, list, getCustomer),
      // Newest first to read; each keeps the number it had in the order they were placed.
      orders: list.map((o, i) => historyLine(o, i + 1)).reverse(),
    });
  }),
);

const ContactBody = z.object({
  reason: z.enum(/** @type {[string, ...string[]]} */ (Object.keys(CONTACT_REASONS))),
});

adminCustomersRouter.post(
  '/customers/:key/contact',
  validateBody(ContactBody),
  asyncHandler(async (req, res) => {
    const list = find(req.params.key);
    const last = list[list.length - 1];
    const account = last.customerId ? getCustomer(last.customerId) : null;
    if (last.customerId && (!account || isErased(account)))
      throw fail(
        410,
        'ERASED',
        'This customer deleted their account. There is no number on record for them.',
      );
    const mobile = account?.mobile || last.mobile;
    if (!mobile) throw fail(404, 'NOT_FOUND', 'No number on record for this customer.');
    await recordAction({
      staff: req.staff,
      action: 'CUSTOMER_CONTACT_REVEALED',
      target: req.params.key,
      // The reason, never the number: the trail must not become a second place the number lives.
      details: { reason: req.body.reason },
    });
    res.json({
      mobile,
      name: account?.name || (last.customerId ? null : last.customerName) || null,
    });
  }),
);
