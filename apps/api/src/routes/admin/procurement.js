/**
 * Procurement — the buy list. Aggregates every open order's line items by product so the operator
 * knows exactly how much to procure for a delivery run: ordered quantity, a per-item buffer
 * (spoilage/trim/short-weight headroom, editable), the rounded-up quantity to actually buy, and the
 * cost of buying it. Grouped by category, summarised by farm/source, exportable as a purchase CSV.
 *
 *   GET /admin/procurement?date=&window=&status=CONFIRMED,PACKING
 *   GET /admin/procurement/export.csv?...
 *
 * "Open" = orders that still need buying for. Default CONFIRMED + PACKING; filter to a delivery date
 * to build one run's list. Operator-only (uses cost).
 */
import { Router } from 'express';
import { asyncHandler } from '../../http.js';
import { getProduct, listCategories, listOrders } from '../../store.js';
import { planProcurement } from '../../lib/procure.js';
import { money, formatINR } from '../../lib/money.js';
import { todayISO } from '../../lib/dates.js';

export const adminProcurementRouter = Router();

const DEFAULT_STATUSES = ['CONFIRMED', 'PACKING'];

function collect(query) {
  const statuses = query.status ? String(query.status).split(',') : DEFAULT_STATUSES;
  const orders = listOrders().filter((o) => {
    if (!statuses.includes(o.status)) return false;
    if (query.date && o.deliveryDate !== query.date) return false;
    if (query.window && o.window !== query.window) return false;
    if (query.communityId && o.address?.communityId !== query.communityId) return false;
    return true;
  });

  /** productId -> { qty, orders:Set, name, unit, categoryId } */
  const agg = new Map();
  for (const o of orders) {
    for (const it of o.items) {
      const cur = agg.get(it.productId) || {
        productId: it.productId,
        name: it.name,
        unit: it.unit,
        categoryId: it.categoryId,
        qty: 0,
        orders: new Set(),
      };
      cur.qty += Number(it.quantity);
      cur.orders.add(o.id);
      agg.set(it.productId, cur);
    }
  }
  return { orders, agg, statuses };
}

/** Turn one aggregated product into a full procurement line (buffer, round-up, cost). */
function toLine(a) {
  const product = getProduct(a.productId);
  const bufferPct = product?.bufferPct ?? 10;
  const unitCost = product?.costPaise ?? 0;
  const plan = planProcurement(a.qty, bufferPct, a.unit);
  const procureCost = Math.round(plan.procureQty * unitCost);
  return {
    productId: a.productId,
    name: a.name,
    unit: a.unit,
    categoryId: a.categoryId,
    farm: product?.farm || '—',
    orders: a.orders.size,
    requiredQty: plan.requiredQty.toFixed(3),
    bufferPct,
    bufferQty: plan.bufferQty.toFixed(3),
    procureQty: plan.procureQty.toFixed(3),
    unitCostPaise: money(unitCost),
    procureCostPaise: money(procureCost),
    _procureCost: procureCost,
  };
}

adminProcurementRouter.get(
  '/procurement',
  asyncHandler(async (req, res) => {
    const { orders, agg, statuses } = collect(req.query);
    const categories = listCategories();
    const lines = [...agg.values()].map(toLine);

    // group by category (ordered by the catalog's category order)
    const byCategory = categories
      .map((c) => ({
        categoryId: c.id,
        name: c.name,
        tint: c.tint,
        items: lines
          .filter((l) => l.categoryId === c.id)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.items.length > 0)
      .map((g) => ({
        ...g,
        subtotalPaise: money(g.items.reduce((s, i) => s + i._procureCost, 0)),
      }));

    // summarise spend by farm / source — the purchasing view
    const farmMap = new Map();
    for (const l of lines) {
      const cur = farmMap.get(l.farm) || { farm: l.farm, items: 0, cost: 0 };
      cur.items += 1;
      cur.cost += l._procureCost;
      farmMap.set(l.farm, cur);
    }
    const bySource = [...farmMap.values()]
      .map((f) => ({ farm: f.farm, items: f.items, procureCostPaise: money(f.cost) }))
      .sort((a, b) => Number(b.procureCostPaise) - Number(a.procureCostPaise));

    const totalCost = lines.reduce((s, l) => s + l._procureCost, 0);
    // upcoming delivery dates present in the open set, for quick filter chips
    const dates = [...new Set(orders.map((o) => o.deliveryDate))].sort();

    res.json({
      generatedAt: new Date().toISOString(),
      filters: { statuses, date: req.query.date || null, window: req.query.window || null },
      dates,
      orderCount: orders.length,
      skuCount: lines.length,
      totalProcureCostPaise: money(totalCost),
      byCategory: byCategory.map((g) => ({
        ...g,
        items: g.items.map(({ _procureCost, ...rest }) => rest),
      })),
      bySource,
    });
  }),
);

adminProcurementRouter.get(
  '/procurement/export.csv',
  asyncHandler(async (req, res) => {
    const { agg } = collect(req.query);
    const categories = listCategories();
    const catName = (id) => categories.find((c) => c.id === id)?.name || id;
    const lines = [...agg.values()]
      .map(toLine)
      .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.name.localeCompare(b.name));
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Category',
      'Product',
      'Source',
      'Orders',
      'Required',
      'Unit',
      'Buffer %',
      'To procure',
      'Est. cost',
    ];
    const rows = lines.map((l) => [
      catName(l.categoryId),
      l.name,
      l.farm,
      l.orders,
      l.requiredQty,
      l.unit,
      l.bufferPct,
      l.procureQty,
      formatINR(l.procureCostPaise),
    ]);
    const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="f2f-procurement-${req.query.date || todayISO()}.csv"`,
    );
    res.send(csv);
  }),
);
