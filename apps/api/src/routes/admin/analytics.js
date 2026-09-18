/**
 * Analytics — a full comparison of the serviceable communities on the numbers that matter:
 * revenue, cost (COGS captured per line at order time), profit, margin, orders, AOV, units, and
 * category mix, plus a per-community daily revenue series. Operator-only (exposes cost/margin).
 *
 * Revenue counts orders that represent real demand: CONFIRMED / PACKING / OUT_FOR_DELIVERY /
 * DELIVERED. Cancelled + payment-failed are excluded from money, but reported as a count.
 */
import { Router } from 'express';
import { asyncHandler } from '../../http.js';
import { listCategories, listCommunities, listOrders } from '../../store.js';
import { addDaysISO, todayISO } from '../../lib/dates.js';
import { money } from '../../lib/money.js';

export const adminAnalyticsRouter = Router();

const REVENUE_STATUSES = ['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED'];

adminAnalyticsRouter.get(
  '/analytics',
  asyncHandler(async (_req, res) => {
    const orders = listOrders();
    const communities = listCommunities();
    const categories = listCategories();
    const today = todayISO();

    const blank = () => ({
      orders: 0,
      cancelled: 0,
      revenue: 0,
      cost: 0,
      units: 0,
      items: 0,
      byCategory: {},
      byDay: {},
    });
    const acc = new Map(communities.map((c) => [c.id, blank()]));

    for (const o of orders) {
      const cid = o.address?.communityId;
      const a = acc.get(cid);
      if (!a) continue;
      if (!REVENUE_STATUSES.includes(o.status)) {
        if (['CANCELLED', 'PAYMENT_FAILED'].includes(o.status)) a.cancelled += 1;
        continue;
      }
      a.orders += 1;
      a.revenue += Number(o.subtotalPaise);
      a.cost += Number(o.costPaise || 0);
      a.byDay[o.deliveryDate] = (a.byDay[o.deliveryDate] || 0) + Number(o.subtotalPaise);
      for (const it of o.items) {
        a.items += 1;
        a.units += Number(it.quantity);
        a.byCategory[it.categoryId] =
          (a.byCategory[it.categoryId] || 0) + Number(it.lineTotalPaise);
      }
    }

    const catName = (id) => categories.find((c) => c.id === id)?.name || id;

    const perCommunity = communities.map((c) => {
      const a = acc.get(c.id);
      const profit = a.revenue - a.cost;
      const marginPct = a.revenue > 0 ? Math.round((profit / a.revenue) * 1000) / 10 : 0;
      const aov = a.orders > 0 ? Math.round(a.revenue / a.orders) : 0;
      const categoryMix = Object.entries(a.byCategory)
        .map(([id, v]) => ({ categoryId: id, name: catName(id), revenuePaise: money(v) }))
        .sort((x, y) => Number(y.revenuePaise) - Number(x.revenuePaise));
      return {
        id: c.id,
        name: c.name,
        area: c.area,
        blocks: c.blocks.length,
        isActive: c.isActive !== false,
        orders: a.orders,
        cancelled: a.cancelled,
        revenuePaise: money(a.revenue),
        costPaise: money(a.cost),
        profitPaise: money(profit),
        marginPct,
        aovPaise: money(aov),
        units: Math.round(a.units * 1000) / 1000,
        items: a.items,
        categoryMix,
      };
    });

    // per-community daily revenue series (last 14 days)
    const days = [];
    for (let i = 13; i >= 0; i -= 1) days.push(addDaysISO(today, -i));
    const revenueByDay = days.map((date) => {
      const row = { date };
      for (const c of communities) row[c.id] = Math.round((acc.get(c.id).byDay[date] || 0) / 100);
      return row;
    });

    // totals + a leader per headline metric
    const sum = (k) => perCommunity.reduce((s, c) => s + Number(c[k]), 0);
    const totals = {
      revenuePaise: money(sum('revenuePaise')),
      costPaise: money(sum('costPaise')),
      profitPaise: money(sum('profitPaise')),
      orders: perCommunity.reduce((s, c) => s + c.orders, 0),
    };
    const leaderBy = (k) =>
      perCommunity.reduce((best, c) => (Number(c[k]) > Number(best?.[k] ?? -1) ? c : best), null)
        ?.name;

    res.json({
      generatedAt: new Date().toISOString(),
      communities: perCommunity,
      revenueByDay,
      totals,
      leaders: {
        revenue: leaderBy('revenuePaise'),
        profit: leaderBy('profitPaise'),
        margin: leaderBy('marginPct'),
        aov: leaderBy('aovPaise'),
      },
      categories: categories.map((c) => ({ id: c.id, name: c.name, tint: c.tint })),
    });
  }),
);
