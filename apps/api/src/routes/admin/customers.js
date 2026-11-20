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
import {
  flushWallet,
  getCustomer,
  getCustomerIdByMobile,
  getWallet,
  ledgerPush,
  updateCustomer,
} from '../../customer-store.js';
import { getOps, listOps, removeOps } from '../../ops-store.js';
import {
  ordersBlockingDeletion,
  requestDeletion,
  scheduledDeletion,
} from '../../lib/account-deletion.js';
import { recordAction } from '../../lib/audit.js';
import {
  customerBook,
  historyLine,
  isErased,
  maskMobile,
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
    // Date range, like a bank statement: customers who ordered between `from` and `to` (IST dates),
    // each with how many of their orders fell inside it. "Came back within N days" narrows further.
    const okDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
    const from = okDate(req.query.from) ? String(req.query.from) : null;
    const to = okDate(req.query.to) ? String(req.query.to) : null;
    if (from || to) {
      const byKey = ordersByCustomer(orders);
      const istDay = (iso) => new Date(Date.parse(iso) + 330 * 60e3).toISOString().slice(0, 10);
      customers = customers
        .map((c) => {
          const n = (byKey.get(c.key) || []).filter((o) => {
            const d = istDay(o.createdAt);
            return (!from || d >= from) && (!to || d <= to);
          }).length;
          return { ...c, ordersInRange: n };
        })
        .filter((c) => c.ordersInRange > 0);
    }
    const within = Number(req.query.secondWithin);
    if (within === 7 || within === 30)
      customers = customers.filter((c) => c.daysToSecond != null && c.daysToSecond <= within);
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
    res.json({ totals: book.totals, customers, reasons: CONTACT_REASONS, range: { from, to } });
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

// ── managing an account: profile, wallet, deletion (20 Nov 2026) ───────────────
// Keyed like the rest of this section: the key is the customer id (guest keys have no account to
// manage). An account with no orders yet is found by its exact mobile number, which is logged.

function accountOr404(key) {
  const c = getCustomer(key);
  if (!c)
    throw fail(
      404,
      'NOT_FOUND',
      'No account with that id. Guest orders have no account to manage.',
    );
  if (isErased(c)) throw fail(410, 'ERASED', 'This account has been deleted.');
  return c;
}

const accountView = (c) => {
  const w = getWallet(c.id);
  const del = scheduledDeletion(c.id);
  return {
    key: c.id,
    name: c.name || null,
    mobileMasked: maskMobile(c.mobile),
    createdAt: c.createdAt || null,
    walletBalancePaise: String(w.balancePaise),
    deletion: del || null,
  };
};

adminCustomersRouter.get(
  '/customer-lookup',
  asyncHandler(async (req, res) => {
    const mobile = String(req.query.mobile || '')
      .replace(/\D/g, '')
      .slice(-10);
    if (!/^[6-9]\d{9}$/.test(mobile))
      throw fail(422, 'VALIDATION', 'Enter a 10-digit mobile number.');
    const cid = getCustomerIdByMobile(mobile);
    await recordAction({
      staff: req.staff,
      action: 'CUSTOMER_LOOKUP',
      target: maskMobile(mobile),
      details: { found: !!cid },
    });
    if (!cid) throw fail(404, 'NOT_FOUND', 'No account uses that number.');
    res.json({ account: accountView(accountOr404(cid)) });
  }),
);

adminCustomersRouter.get(
  '/customers/:key/account',
  asyncHandler(async (req, res) => {
    const c = accountOr404(req.params.key);
    res.json({ account: accountView(c), ledger: getWallet(c.id).ledger.slice(0, 100) });
  }),
);

adminCustomersRouter.patch(
  '/customers/:key/account',
  validateBody(z.object({ name: z.string().trim().min(1).max(80) })),
  asyncHandler(async (req, res) => {
    const c = accountOr404(req.params.key);
    updateCustomer(c.id, { name: req.body.name });
    await recordAction({ staff: req.staff, action: 'CUSTOMER_NAME_CHANGED', target: c.id });
    res.json({ account: accountView(getCustomer(c.id)) });
  }),
);

// Goodwill credit or a correction, with a reason the customer can read in their wallet history.
const WalletBody = z.object({
  direction: z.enum(['CREDIT', 'DEBIT']),
  amountPaise: z.number().int().min(100).max(500000),
  reason: z.string().trim().min(3).max(140),
});

adminCustomersRouter.post(
  '/customers/:key/wallet',
  validateBody(WalletBody),
  asyncHandler(async (req, res) => {
    const c = accountOr404(req.params.key);
    const { direction, amountPaise, reason } = req.body;
    if (direction === 'DEBIT' && amountPaise > getWallet(c.id).balancePaise)
      throw fail(422, 'INSUFFICIENT', 'That is more than the wallet holds.');
    const entry = ledgerPush(
      c.id,
      direction,
      amountPaise,
      'ADJUSTMENT',
      `adj_${Date.now().toString(36)}`,
      reason,
      {
        actor: req.staff?.email || req.staff?.name || 'admin',
      },
    );
    await flushWallet(c.id);
    await recordAction({
      staff: req.staff,
      action: direction === 'CREDIT' ? 'WALLET_CREDITED' : 'WALLET_DEBITED',
      target: c.id,
      details: { amountPaise, reason, entry: entry.id },
    });
    res.status(201).json({ account: accountView(getCustomer(c.id)) });
  }),
);

// Delete on the customer's request (phone, email): same 60-day grace and the same blocks as in the
// app. Cancelling restores the account at once.
adminCustomersRouter.post(
  '/customers/:key/deletion',
  validateBody(z.object({ reason: z.string().trim().min(3).max(140) })),
  asyncHandler(async (req, res) => {
    const c = accountOr404(req.params.key);
    const blocking = ordersBlockingDeletion(c.id);
    if (blocking.length)
      throw fail(
        409,
        'ORDERS_IN_PROGRESS',
        `${blocking.length} order(s) are still in progress. Finish or cancel them first.`,
      );
    const r = await requestDeletion(c.id, { walletBalancePaise: getWallet(c.id).balancePaise });
    await recordAction({
      staff: req.staff,
      action: 'CUSTOMER_DELETION_SCHEDULED',
      target: c.id,
      details: { reason: req.body.reason },
    });
    res.json(r);
  }),
);

adminCustomersRouter.delete(
  '/customers/:key/deletion',
  asyncHandler(async (req, res) => {
    const c = accountOr404(req.params.key);
    if (!getOps('deletion', c.id))
      throw fail(404, 'NOT_FOUND', 'No deletion is scheduled for this account.');
    await removeOps('deletion', c.id);
    await recordAction({ staff: req.staff, action: 'CUSTOMER_DELETION_CANCELLED', target: c.id });
    res.json({ account: accountView(getCustomer(c.id)) });
  }),
);

// Every scheduled deletion, soonest first.
adminCustomersRouter.get(
  '/deletions',
  asyncHandler(async (_req, res) => {
    const rows = listOps('deletion')
      .map((d) => {
        const c = getCustomer(d.id);
        return {
          key: d.id,
          name: c?.name || null,
          mobileMasked: c ? maskMobile(c.mobile) : null,
          requestedAt: d.requestedAt,
          deleteAfter: d.deleteAfter,
        };
      })
      .sort((a, b) => (a.deleteAfter < b.deleteAfter ? -1 : 1));
    res.json({ deletions: rows });
  }),
);
