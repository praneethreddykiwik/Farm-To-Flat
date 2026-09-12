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
import { orderAdmin } from '../../serialize.js';
import {
  createOrder,
  getOrder,
  listOrders,
  listProducts,
  patchOrder,
  updateOrderStatus,
} from '../../store.js';
import { listCommunities } from '../../store.js';
import { ledgerPush, releaseCoupon, getDevices } from '../../customer-store.js';
import { notifyOrderStatus } from '../../lib/push.js';
import { todayISO, addDaysISO, weekdayOf } from '../../lib/dates.js';
import { formatINR } from '../../lib/money.js';

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

/** allowed next states — the fulfilment state machine */
const NEXT = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED', 'PAYMENT_FAILED'],
  CONFIRMED: ['PACKING', 'CANCELLED'],
  PACKING: ['OUT_FOR_DELIVERY', 'CONFIRMED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'PACKING'],
  DELIVERED: [],
  CANCELLED: [],
  PAYMENT_FAILED: ['CONFIRMED', 'CANCELLED'],
};

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
      orders: filtered.map(orderAdmin),
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

adminOrdersRouter.get(
  '/orders/export.csv',
  asyncHandler(async (req, res) => {
    const type = req.query.type === 'manifest' ? 'manifest' : 'packing';
    const orders = applyFilters(listOrders(), req.query).filter(
      (o) => !['CANCELLED', 'PAYMENT_FAILED'].includes(o.status),
    );
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
    res.json({ order: orderAdmin(o) });
  }),
);

const StatusBody = z.object({ status: z.enum(STATUSES) });
adminOrdersRouter.patch(
  '/orders/:id/status',
  validateBody(StatusBody),
  asyncHandler(async (req, res) => {
    const o = getOrder(req.params.id);
    if (!o) throw fail(404, 'NOT_FOUND', 'Order not found');
    const allowed = NEXT[o.status] || [];
    if (o.status !== req.body.status && !allowed.includes(req.body.status)) {
      throw fail(409, 'INVALID_TRANSITION', `Cannot move ${o.status} → ${req.body.status}.`, {
        allowed,
      });
    }
    const updated = updateOrderStatus(req.params.id, req.body.status);
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
      const row = updateOrderStatus(id, status);
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

    if (req.body.decision === 'APPROVE') {
      const updated = patchOrder(req.params.id, (ord) => {
        ord.status = 'CANCELLED';
        ord.cancelRequested = false;
        ord.timeline.push({ status: 'CANCELLED', at: new Date().toISOString() });
      });
      notifyOrderStatus(updated, getDevices);
      if (o.customerId && o.walletAppliedPaise > 0)
        ledgerPush(
          o.customerId,
          'CREDIT',
          o.walletAppliedPaise,
          'REFUND',
          o.orderNumber,
          `Refund for ${o.orderNumber}`,
        );
      if (o.customerId && o.couponCode) releaseCoupon(o.customerId, o.couponCode);
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
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
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
