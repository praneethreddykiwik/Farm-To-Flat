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
import { getOrder, listOrders, updateOrderStatus } from '../../store.js';
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
