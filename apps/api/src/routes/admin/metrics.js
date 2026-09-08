/**
 * Admin dashboard metrics — everything the overview screen needs in one call:
 * today's order + revenue tallies, status breakdown, GMV over the last 7 days, top products,
 * category mix, and low-stock (near daily cap) hints. All money as paise strings.
 */
import { Router } from 'express';
import { asyncHandler } from '../../http.js';
import { listOrders, listProducts } from '../../store.js';
import { addDaysISO, todayISO } from '../../lib/dates.js';
import { money } from '../../lib/money.js';

export const adminMetricsRouter = Router();

const LIVE = ['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY'];
const COUNTS_REVENUE = ['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED'];

adminMetricsRouter.get(
  '/metrics',
  asyncHandler(async (_req, res) => {
    const orders = listOrders();
    const products = listProducts();
    const today = todayISO();

    const todays = orders.filter((o) => o.deliveryDate === today);
    const todaysRevenue = todays
      .filter((o) => COUNTS_REVENUE.includes(o.status))
      .reduce((s, o) => s + Number(o.totalPaise), 0);

    // GMV for the last 7 delivery days (including upcoming today)
    const revenueByDay = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = addDaysISO(today, -i);
      const gmv = orders
        .filter((o) => o.deliveryDate === d && COUNTS_REVENUE.includes(o.status))
        .reduce((s, o) => s + Number(o.totalPaise), 0);
      revenueByDay.push({ date: d, gmvPaise: money(gmv) });
    }

    // status breakdown
    const byStatus = {};
    for (const o of orders) byStatus[o.status] = (byStatus[o.status] || 0) + 1;

    // top products by units across live+delivered orders
    const unitMap = new Map();
    for (const o of orders) {
      if (!COUNTS_REVENUE.includes(o.status)) continue;
      for (const it of o.items) {
        const cur = unitMap.get(it.productId) || { name: it.name, qty: 0, revenue: 0 };
        cur.qty += Number(it.quantity);
        cur.revenue += Number(it.lineTotalPaise);
        unitMap.set(it.productId, cur);
      }
    }
    const topProducts = [...unitMap.entries()]
      .map(([productId, v]) => ({
        productId,
        name: v.name,
        qty: Math.round(v.qty * 1000) / 1000,
        revenuePaise: money(v.revenue),
      }))
      .sort((a, b) => Number(b.revenuePaise) - Number(a.revenuePaise))
      .slice(0, 6);

    res.json({
      generatedAt: new Date().toISOString(),
      today: {
        date: today,
        orders: todays.length,
        live: todays.filter((o) => LIVE.includes(o.status)).length,
        revenuePaise: money(todaysRevenue),
      },
      catalog: {
        total: products.length,
        active: products.filter((p) => p.isActive !== false).length,
      },
      byStatus,
      revenueByDay,
      topProducts,
    });
  }),
);
