/**
 * Admin orders + fulfilment.
 *   GET   /admin/orders?status=&communityId=&date=&window=&q=   filtered list + status counts
 *   GET   /admin/orders/:id                                     one order
 *   PATCH /admin/orders/:id/status   { status }                 advance fulfilment state
 *   GET   /admin/orders/export.csv?type=packing|manifest&...    CSV for the packing bench / driver
 *
 * The CSV is built here (no dependency) so exports work the moment the API runs. Fulfilment is the
 * operator's highest-leverage screen, so status transitions are validated against a state machine.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../../http.js';
import { validateBody } from '../../validate.js';
import { codDuePaise, orderAdmin } from '../../serialize.js';
import {
  createOrder,
  getOrder,
  listOrders,
  listProducts,
  patchOrder,
  updateOrderStatus,
  completeDelivery,
} from '../../store.js';
import { listCommunities } from '../../store.js';
import { getDevices, getCustomer } from '../../customer-store.js';
import { notifyOrderStatus } from '../../lib/push.js';
import { cancelOrder } from '../../lib/order-lifecycle.js';
import { IS_PROD } from '../../lib/env.js';

// Orders snapshot the customer name at order time; show the customer's CURRENT name in the operator
// panel so a profile rename reflects everywhere (falls back to the snapshot for guest/seed orders).
const liveName = (o) => {
  const c = o?.customerId ? getCustomer(o.customerId) : null;
  return c?.name ? { ...o, customerName: c.name } : o;
};
import { todayISO, addDaysISO, weekdayOf } from '../../lib/dates.js';
import { formatINR } from '../../lib/money.js';
import { csvEscape } from '../../lib/csv.js';
import { buildWorkbook, rupees, sendWorkbook } from '../../lib/xlsx.js';

export const adminOrdersRouter = Router();

const STATUSES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PACKING',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'PAYMENT_FAILED',
];

/**
 * Allowed next states — the fulfilment state machine. PAYMENT_FAILED can only be cancelled: its
 * wallet money has already been returned, so "confirming" it from the board would deliver an order
 * nobody paid for and (before the shared cancel path) refunded that money a second time on cancel.
 */
const NEXT = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED', 'PAYMENT_FAILED'],
  CONFIRMED: ['PACKING', 'CANCELLED'],
  PACKING: ['OUT_FOR_DELIVERY', 'CONFIRMED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'PACKING'],
  DELIVERED: [],
  CANCELLED: [],
  PAYMENT_FAILED: ['CANCELLED'],
};

/** Every transition INTO CANCELLED goes through the shared cancel path (refund + coupon release). */
function transition(orderId, status) {
  if (status === 'CANCELLED') return cancelOrder(orderId).order;
  return updateOrderStatus(orderId, status);
}

function applyFilters(orders, q) {
  return orders.filter((o) => {
    if (q.status && o.status !== q.status) return false;
    if (q.communityId && o.address?.communityId !== q.communityId) return false;
    if (q.date && o.deliveryDate !== q.date) return false;
    if (q.window && o.window !== q.window) return false;
    if (q.q) {
      const hay =
        `${o.orderNumber} ${o.customerName} ${o.mobile} ${o.address?.block || ''} ${o.address?.flat || ''}`.toLowerCase();
      if (!hay.includes(String(q.q).toLowerCase())) return false;
    }
    return true;
  });
}

adminOrdersRouter.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const all = listOrders();
    const filtered = applyFilters(all, req.query);
    const counts = {};
    for (const s of STATUSES) counts[s] = 0;
    for (const o of all) counts[o.status] = (counts[o.status] || 0) + 1;
    res.json({
      orders: filtered.map((o) => orderAdmin(liveName(o))),
      total: filtered.length,
      counts,
      statuses: STATUSES,
    });
  }),
);

/**
 * DEV: fabricate a realistic incoming order and drop it on the board as CONFIRMED, so auto-listing
 * can be seen without the customer app wired in. When Adnan's POST /orders transaction lands, real
 * orders flow through the same createOrder() and appear here identically. Not a contract route.
 */
const NAMES = [
  'Sneha Reddy',
  'Arjun Mehta',
  'Fatima Begum',
  'Ravi Teja',
  'Lakshmi Prasad',
  'Deepak Rao',
  'Imran Khan',
  'Kavya Nair',
  'Rahul Verma',
  'Ananya Rao',
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
adminOrdersRouter.post(
  '/orders/simulate',
  asyncHandler(async (_req, res) => {
    // Demo-only: fabricates an order with a random mobile. In production it would persist fake
    // orders into the real table, so it does not exist there.
    if (IS_PROD) throw fail(404, 'NOT_FOUND', 'Not available in production.');
    const community = pick(listCommunities().filter((c) => c.isActive !== false));
    const products = listProducts().filter((p) => p.isActive !== false);
    const n = 3 + Math.floor(Math.random() * 4);
    const chosen = [...products].sort(() => Math.random() - 0.5).slice(0, n);
    const lines = chosen.map((p) => [
      p.id,
      Number(p.increment) * (1 + Math.floor(Math.random() * 3)),
    ]);
    // next serviceable day for this community
    let deliveryDate = todayISO();
    for (let i = 1; i <= 14; i += 1) {
      const d = addDaysISO(todayISO(), i);
      if (community.deliveryDays.includes(weekdayOf(d))) {
        deliveryDate = d;
        break;
      }
    }
    const order = createOrder({
      customerName: pick(NAMES),
      mobile: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
      communityId: community.id,
      block: pick(community.blocks),
      flat: `${1 + Math.floor(Math.random() * 15)}0${1 + Math.floor(Math.random() * 8)}`,
      window: pick(['MORNING', 'EVENING']),
      deliveryDate,
      status: 'CONFIRMED',
      lines,
    });
    res.status(201).json({ order: orderAdmin(order) });
  }),
);

/**
 * Packing sheet and driver manifest as a real spreadsheet. The packing sheet is one row per LINE
 * (what to put in the bag); the manifest is one row per ORDER (what the driver carries and, once
 * cash on delivery is on, what to collect at the door).
 */
adminOrdersRouter.get(
  '/orders/export.xlsx',
  asyncHandler(async (req, res) => {
    const type = req.query.type === 'manifest' ? 'manifest' : 'packing';
    const orders = applyFilters(listOrders(), req.query)
      .filter((o) => !['CANCELLED', 'PAYMENT_FAILED'].includes(o.status))
      .map(liveName);

    const sheet =
      type === 'manifest'
        ? {
            name: 'Manifest',
            columns: [
              { header: 'Order', key: 'order', width: 14 },
              { header: 'Customer', key: 'customer', width: 20 },
              { header: 'Mobile', key: 'mobile', width: 15 },
              { header: 'Community', key: 'community', width: 22 },
              { header: 'Block', key: 'block', width: 12 },
              { header: 'Flat', key: 'flat', width: 10 },
              { header: 'Window', key: 'window', width: 12 },
              { header: 'Items', key: 'items', width: 8 },
              { header: 'Total', key: 'total', width: 14, money: true },
              { header: 'Pay', key: 'method', width: 10 },
              { header: 'COLLECT', key: 'collect', width: 14, money: true },
              { header: 'Status', key: 'status', width: 18 },
              // What the customer asked for. On the driver's sheet because they are the one who
              // has to act on it — "leave with the guard", a gate code, "call on arrival".
              { header: 'Instructions', key: 'note', width: 34 },
            ],
            rows: orders.map((o) => ({
              order: o.orderNumber,
              customer: o.customerName,
              mobile: o.mobile,
              community: o.address?.communityName,
              block: o.address?.block,
              flat: o.address?.flat,
              window: o.window,
              items: o.items.length,
              total: rupees(o.totalPaise),
              method: o.paymentMethod === 'COD' ? 'CASH' : 'Paid',
              // The figure the person at the door actually asks for: blank on a prepaid order so
              // nobody collects twice, and blank again once a cash order has been settled.
              collect: rupees(codDuePaise(o)),
              status: o.status,
              note: o.deliveryNote || '',
            })),
          }
        : {
            name: 'Packing',
            columns: [
              { header: 'Order', key: 'order', width: 14 },
              { header: 'Customer', key: 'customer', width: 20 },
              { header: 'Community', key: 'community', width: 22 },
              { header: 'Block', key: 'block', width: 12 },
              { header: 'Flat', key: 'flat', width: 10 },
              { header: 'Window', key: 'window', width: 12 },
              { header: 'Product', key: 'product', width: 26 },
              { header: 'Qty', key: 'qty', width: 10, qty: true },
              { header: 'Unit', key: 'unit', width: 10 },
              { header: 'Note', key: 'note', width: 28 },
            ],
            rows: orders.flatMap((o) =>
              o.items.map((it) => ({
                order: o.orderNumber,
                customer: o.customerName,
                community: o.address?.communityName,
                block: o.address?.block,
                flat: o.address?.flat,
                window: o.window,
                product: it.name,
                qty: Number(it.quantity),
                unit: it.unit,
                note: it.note || '',
              })),
            ),
          };

    const buf = await buildWorkbook([sheet], { title: `Farm to Flat ${type}` });
    sendWorkbook(res, buf, `f2f-${type}-${req.query.date || todayISO()}.xlsx`);
  }),
);

adminOrdersRouter.get(
  '/orders/export.csv',
  asyncHandler(async (req, res) => {
    const type = req.query.type === 'manifest' ? 'manifest' : 'packing';
    const orders = applyFilters(listOrders(), req.query)
      .filter((o) => !['CANCELLED', 'PAYMENT_FAILED'].includes(o.status))
      .map(liveName);
    const csv = type === 'manifest' ? manifestCsv(orders) : packingCsv(orders);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="f2f-${type}-${Date.now()}.csv"`);
    res.send(csv);
  }),
);

adminOrdersRouter.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const o = getOrder(req.params.id);
    if (!o) throw fail(404, 'NOT_FOUND', 'Order not found');
    res.json({ order: orderAdmin(liveName(o)) });
  }),
);

/**
 * Hand-over at the door.
 *
 * DELIVERED is deliberately NOT reachable through the plain status PATCH any more when a code or
 * cash is outstanding: marking an order delivered from the board would skip the proof entirely.
 */
adminOrdersRouter.post(
  '/orders/:id/deliver',
  validateBody(
    z.object({
      otp: z.string().trim().min(1).max(10).optional(),
      collectedPaise: z.number().int().min(0).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const r = completeDelivery(req.params.id, req.body);
    if (r.error) throw fail(r.error.status, r.error.code, r.error.message, r.error.details);
    notifyOrderStatus(r.order, getDevices);
    res.json({ order: orderAdmin(r.order) });
  }),
);

const StatusBody = z.object({ status: z.enum(STATUSES) });
adminOrdersRouter.patch(
  '/orders/:id/status',
  validateBody(StatusBody),
  asyncHandler(async (req, res) => {
    const o = getOrder(req.params.id);
    if (!o) throw fail(404, 'NOT_FOUND', 'Order not found');
    // A cash order, or one with a code waiting to be read out, must go through /deliver so the
    // proof is actually taken. Without this the board could mark it delivered and the money would
    // never be recorded against it.
    if (req.body.status === 'DELIVERED') {
      const needsCash =
        o.paymentMethod === 'COD' && Number(o.codCollectedPaise || 0) < Number(o.totalPaise);
      if (needsCash || o.deliveryOtp)
        throw fail(
          409,
          'DELIVERY_PROOF_REQUIRED',
          needsCash
            ? 'Collect the cash and the customer’s code to complete this delivery.'
            : 'Enter the customer’s code to complete this delivery.',
        );
    }
    const allowed = NEXT[o.status] || [];
    if (o.status !== req.body.status && !allowed.includes(req.body.status)) {
      throw fail(409, 'INVALID_TRANSITION', `Cannot move ${o.status} → ${req.body.status}.`, {
        allowed,
      });
    }
    const updated = transition(req.params.id, req.body.status);
    notifyOrderStatus(updated, getDevices); // push the customer their new status
    res.json({ order: orderAdmin(updated) });
  }),
);

/**
 * Batch-advance many orders to the same status in one action — used by the fulfilment board to ship
 * a whole community together (all its orders move at once). Skips orders where the transition is
 * illegal. This is the single point a customer push-notification batch would fire from (the push
 * service is Adnan's; the status/tracking update is real here and the app reflects it on read).
 */
const AdvanceBody = z.object({
  orderIds: z.array(z.string()).min(1).max(500),
  status: z.enum(STATUSES),
});
adminOrdersRouter.post(
  '/orders/advance',
  validateBody(AdvanceBody),
  asyncHandler(async (req, res) => {
    const { orderIds, status } = req.body;
    const updated = [];
    const skipped = [];
    for (const id of orderIds) {
      const o = getOrder(id);
      if (!o) {
        skipped.push({ id, reason: 'NOT_FOUND' });
        continue;
      }
      if (o.status !== status && !(NEXT[o.status] || []).includes(status)) {
        skipped.push({ id, reason: 'INVALID_TRANSITION' });
        continue;
      }
      // Delivery is settled one door at a time. An order still owing cash, or still waiting on the
      // customer's code, cannot be swept to DELIVERED with the rest of the van — the whole point of
      // the proof is that someone stood there and took it.
      if (
        status === 'DELIVERED' &&
        (o.deliveryOtp ||
          (o.paymentMethod === 'COD' && Number(o.codCollectedPaise || 0) < Number(o.totalPaise)))
      ) {
        skipped.push({ id, reason: 'DELIVERY_PROOF_REQUIRED', orderNumber: o.orderNumber });
        continue;
      }
      const row = transition(id, status);
      notifyOrderStatus(row, getDevices); // push each customer their new status
      updated.push(orderAdmin(row));
    }
    res.json({ updated, count: updated.length, skipped, notified: updated.length });
  }),
);

/**
 * Resolve a customer's cancellation request from the Fulfilment board.
 *   APPROVE  → order CANCELLED, wallet money refunded, coupon released.
 *   DECLINE  → request cleared, the order stays in its current stage.
 */
const CancelDecisionBody = z.object({ decision: z.enum(['APPROVE', 'DECLINE']) });
adminOrdersRouter.post(
  '/orders/:id/cancel-decision',
  validateBody(CancelDecisionBody),
  asyncHandler(async (req, res) => {
    const o = getOrder(req.params.id);
    if (!o) throw fail(404, 'NOT_FOUND', 'Order not found');
    if (!o.cancelRequested) throw fail(409, 'NO_REQUEST', 'No cancellation request on this order.');
    // A request left over on an order that has since been delivered (or already cancelled) is
    // settled, not pending. Approving it would refund goods the customer is holding.
    if (o.status === 'DELIVERED')
      throw fail(
        409,
        'CANNOT_CANCEL',
        'This order has already been delivered, so the cancellation can no longer be approved.',
      );
    if (o.status === 'CANCELLED') throw fail(409, 'CANNOT_CANCEL', 'Already cancelled.');

    if (req.body.decision === 'APPROVE') {
      const { order: updated } = cancelOrder(req.params.id);
      notifyOrderStatus(updated, getDevices);
      return res.json({ order: orderAdmin(updated) });
    }

    const updated = patchOrder(req.params.id, (ord) => {
      ord.cancelRequested = false;
      ord.cancelReason = null;
      ord.timeline.push({ status: 'CANCEL_DECLINED', at: new Date().toISOString() });
    });
    res.json({ order: orderAdmin(updated) });
  }),
);

// ── CSV builders ────────────────────────────────────────────────────────────
// csvEscape lives in lib/csv.js (formula-injection safe) and is shared with the procurement export.
function toCsv(rows, header) {
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

/** One row per line item — the packing bench view, grouped by order. */
function packingCsv(orders) {
  const header = [
    'Order',
    'Customer',
    'Community',
    'Block',
    'Flat',
    'Window',
    'Product',
    'Qty',
    'Unit',
    'Note',
  ];
  const rows = [];
  for (const o of orders) {
    for (const it of o.items) {
      rows.push([
        o.orderNumber,
        o.customerName,
        o.address?.communityName,
        o.address?.block,
        o.address?.flat,
        o.window,
        it.name,
        it.quantity,
        it.unit,
        it.note || '',
      ]);
    }
  }
  return toCsv(rows, header);
}

/** One row per order — the driver manifest. */
function manifestCsv(orders) {
  const header = [
    'Order',
    'Customer',
    'Mobile',
    'Community',
    'Block',
    'Flat',
    'Window',
    'Items',
    'Total',
    'Status',
  ];
  const rows = orders.map((o) => [
    o.orderNumber,
    o.customerName,
    o.mobile,
    o.address?.communityName,
    o.address?.block,
    o.address?.flat,
    o.window,
    o.items.length,
    formatINR(o.totalPaise),
    o.status,
  ]);
  return toCsv(rows, header);
}
