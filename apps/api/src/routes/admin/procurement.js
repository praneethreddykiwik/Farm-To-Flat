/**
 * Procurement — the buy list. Aggregates every open order's line items by product so the operator
 * knows exactly how much to procure for a delivery run: ordered quantity, a per-item buffer
 * (spoilage/trim/short-weight headroom, editable), the rounded-up quantity to actually buy, and the
 * cost of buying it. Grouped by category, summarised by farm/source, exportable as a purchase CSV.
 *
 *   GET  /admin/procurement?date=&window=&status=&bufferPct=   buy list (bufferPct overrides for the run)
 *   GET  /admin/procurement/export.csv?...                     purchase CSV
 *   POST /admin/procurement/mark  { productId, date?, procured } mark a line bought (shared checklist)
 *
 * "Open" = orders that still need buying for. Default CONFIRMED + PACKING; filter to a delivery date
 * to build one run's list. Operator-only (uses cost).
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http.js';
import { validateBody } from '../../validate.js';
import { getProduct, listCategories, listOrders } from '../../store.js';
import { planProcurement } from '../../lib/procure.js';
import { money, formatINR } from '../../lib/money.js';
import { todayISO } from '../../lib/dates.js';
import { CSV_HEADERS, LANGS, YES, categoryName, productName, unitLabel } from '../../lib/i18n.js';

export const adminProcurementRouter = Router();

const DEFAULT_STATUSES = ['CONFIRMED', 'PACKING'];

/** shared "already bought" checklist: `${dateKey}|${productId}` -> true. Resets on restart. */
const procured = new Map();
const dateKeyOf = (query) => query.date || 'all';

function collect(query) {
  const statuses = query.status ? String(query.status).split(',') : DEFAULT_STATUSES;
  const orders = listOrders().filter((o) => {
    if (!statuses.includes(o.status)) return false;
    if (query.date && o.deliveryDate !== query.date) return false;
    if (query.window && o.window !== query.window) return false;
    if (query.communityId && o.address?.communityId !== query.communityId) return false;
    return true;
  });

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

/** Turn one aggregated product into a full procurement line (buffer, round-up, cost, checked state). */
function toLine(a, { override, dateKey }) {
  const product = getProduct(a.productId);
  const bufferPct = override != null ? override : (product?.bufferPct ?? 10);
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
    procured: procured.get(`${dateKey}|${a.productId}`) === true,
    _procureCost: procureCost,
  };
}

/** run-level buffer override, 0..100, or null */
function overrideOf(query) {
  if (query.bufferPct == null || query.bufferPct === '') return null;
  const n = Number(query.bufferPct);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

adminProcurementRouter.get(
  '/procurement',
  asyncHandler(async (req, res) => {
    const { orders, agg, statuses } = collect(req.query);
    const categories = listCategories();
    const dateKey = dateKeyOf(req.query);
    const override = overrideOf(req.query);
    const lines = [...agg.values()].map((a) => toLine(a, { override, dateKey }));

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
    const dates = [...new Set(orders.map((o) => o.deliveryDate))].sort();

    res.json({
      generatedAt: new Date().toISOString(),
      filters: {
        statuses,
        date: req.query.date || null,
        window: req.query.window || null,
        bufferOverride: override,
      },
      dates,
      orderCount: orders.length,
      skuCount: lines.length,
      procuredCount: lines.filter((l) => l.procured).length,
      totalProcureCostPaise: money(totalCost),
      byCategory: byCategory.map((g) => ({
        ...g,
        items: g.items.map(({ _procureCost, ...rest }) => rest),
      })),
      bySource,
    });
  }),
);

adminProcurementRouter.post(
  '/procurement/mark',
  validateBody(
    z.object({ productId: z.string().min(1), date: z.string().optional(), procured: z.boolean() }),
  ),
  asyncHandler(async (req, res) => {
    const key = `${req.body.date || 'all'}|${req.body.productId}`;
    if (req.body.procured) procured.set(key, true);
    else procured.delete(key);
    res.json({ ok: true, productId: req.body.productId, procured: req.body.procured });
  }),
);

adminProcurementRouter.get(
  '/procurement/export.csv',
  asyncHandler(async (req, res) => {
    const lang = LANGS.includes(String(req.query.lang)) ? String(req.query.lang) : 'en';
    const { agg } = collect(req.query);
    const categories = listCategories();
    const catEnglish = (id) => categories.find((c) => c.id === id)?.name || id;
    const dateKey = dateKeyOf(req.query);
    const override = overrideOf(req.query);
    const lines = [...agg.values()]
      .map((a) => toLine(a, { override, dateKey }))
      .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.name.localeCompare(b.name));
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = lines.map((l) => {
      const product = getProduct(l.productId);
      return [
        categoryName(l.categoryId, catEnglish(l.categoryId), lang),
        product ? productName(product, lang) : l.name,
        l.farm,
        l.orders,
        l.requiredQty,
        unitLabel(l.unit, lang),
        l.bufferPct,
        l.procureQty,
        formatINR(l.procureCostPaise),
        l.procured ? YES[lang] : '',
      ];
    });
    // UTF-8 BOM so Excel opens Devanagari / Telugu correctly
    const csv = '﻿' + [CSV_HEADERS[lang], ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="f2f-procurement-${lang}-${req.query.date || todayISO()}.csv"`,
    );
    res.send(csv);
  }),
);
