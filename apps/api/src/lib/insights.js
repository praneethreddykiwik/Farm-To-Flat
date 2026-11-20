/**
 * The numbers the business reviews every Friday (17 Nov 2026 review), worked out from the order book
 * and the operating records on each request — nothing here is stored, so nothing can drift.
 *
 *   1. Where do first orders come from?      acquisition()
 *   2. Do people come back?                   repeat()
 *   3. Does the routine work?                 routine()   reminders → orders, orders per tower vs capacity
 *   4. Do we keep our promise?                promise()   on time at the door, refunds on time
 *   5. Does the offer pay back?               offers()
 * plus the money the review said was missing:
 *   products()  winners and losers, item by item
 *   buffer()    the extra we buy on every order: what it cost, how much was used, how much thrown
 *   finance()   revenue → gross profit → net profit before and after tax, with every cost in it
 *
 * Dates are IST business dates (YYYY-MM-DD). `from`/`to` are inclusive.
 */
import {
  listOrders,
  listProducts,
  listCategories,
  listCommunities,
  getCommunity,
  listCoupons,
} from '../store.js';
import { listOps, getOps, getSettings } from '../ops-store.js';
import { getWallet, paymentForOrder } from '../customer-store.js';
import { wasPlaced, customerKeyOf } from './customer-history.js';
import { addDaysISO, istInstantMs, todayISO } from './dates.js';
import { communityWindows } from './windows.js';
import { planProcurement } from './procure.js';
import { heardFromLabels } from './growth.js';

const DAY = 864e5;
const IN_HAND = new Set(['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED']);

/** IST business date of an ISO instant. */
export const istDate = (iso) => (iso ? todayISO(Date.parse(iso)) : null);

const between = (d, from, to) => !!d && d >= from && d <= to;
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const round3 = (n) => Math.round(n * 1000) / 1000;
const str = (n) => String(Math.round(Number(n) || 0));

/** A sane range: defaults to the last 30 days; never longer than ~2 years. */
export function rangeOf(query = {}) {
  const today = todayISO();
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  let to = ok(query.to) ? String(query.to) : today;
  let from = ok(query.from) ? String(query.from) : addDaysISO(to, -29);
  if (from > to) [from, to] = [to, from];
  if (from < addDaysISO(to, -800)) from = addDaysISO(to, -800);
  return { from, to };
}

/** Every placed order (not abandoned checkouts), oldest first, keyed per customer. */
function placedBook() {
  const placed = listOrders()
    .filter(wasPlaced)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const byCustomer = new Map();
  for (const o of placed) {
    const k = customerKeyOf(o);
    if (!k) continue;
    if (!byCustomer.has(k)) byCustomer.set(k, []);
    byCustomer.get(k).push(o);
  }
  return { placed, byCustomer };
}

// ── 1. acquisition ──────────────────────────────────────────────────────────

export function acquisition({ from, to }) {
  const { byCustomer } = placedBook();
  const promoters = new Map(listOps('promoter').map((p) => [p.id, p]));
  const firsts = [];
  for (const [key, list] of byCustomer) {
    const first = list[0];
    if (!between(istDate(first.createdAt), from, to)) continue;
    const attr = first.customerId ? getOps('attribution', first.customerId) : null;
    firsts.push({ key, order: first, attr });
  }
  const channelOf = ({ attr }) =>
    attr?.promoterCode
      ? 'STALL'
      : attr?.referrerId
        ? 'INVITE'
        : attr?.heardFrom
          ? 'APP'
          : 'UNKNOWN';
  const CHANNEL_LABEL = {
    STALL: 'Stall / promoter code',
    INVITE: 'Neighbour’s invite code',
    APP: 'Straight from the app',
    UNKNOWN: 'Not recorded (before tracking)',
  };
  const count = (arr, f) => {
    const m = new Map();
    for (const x of arr) m.set(f(x), (m.get(f(x)) || 0) + 1);
    return m;
  };
  const byChannel = [...count(firsts, channelOf)].map(([k, n]) => ({
    key: k,
    label: CHANNEL_LABEL[k],
    firstOrders: n,
    sharePct: pct(n, firsts.length),
  }));
  const byHeard = [
    ...count(
      firsts.filter((f) => f.attr?.heardFrom),
      (f) => f.attr.heardFrom,
    ),
  ].map(([k, n]) => ({
    key: k,
    label: heardFromLabels()[k] || k,
    firstOrders: n,
    sharePct: pct(n, firsts.length),
  }));

  // Every order (not only first ones) credited to a promoter in the range.
  const credited = listOps('orderAttr').filter((a) => {
    const o = listOrders().find((x) => x.id === a.orderId);
    return o && wasPlaced(o) && between(istDate(o.createdAt), from, to);
  });
  const orderById = new Map(listOrders().map((o) => [o.id, o]));
  const byPromoter = [...promoters.values()].map((p) => {
    const mine = credited.filter((a) => a.promoterCode === p.id);
    const orders = mine.map((a) => orderById.get(a.orderId)).filter(Boolean);
    return {
      code: p.id,
      name: p.name,
      stall: p.stall || null,
      communityId: p.communityId || null,
      active: p.active !== false,
      orders: orders.length,
      firstOrders: firsts.filter((f) => f.attr?.promoterCode === p.id).length,
      revenuePaise: str(
        sum(
          orders.filter((o) => o.status !== 'CANCELLED'),
          (o) => o.subtotalPaise,
        ),
      ),
    };
  });
  const stalls = new Map();
  for (const p of byPromoter) {
    const k = p.stall || 'No stall named';
    const s = stalls.get(k) || {
      stall: k,
      orders: 0,
      firstOrders: 0,
      revenuePaise: 0,
      promoters: 0,
    };
    s.orders += p.orders;
    s.firstOrders += p.firstOrders;
    s.revenuePaise += Number(p.revenuePaise);
    s.promoters += 1;
    stalls.set(k, s);
  }
  return {
    firstOrders: firsts.length,
    byChannel: byChannel.sort((a, b) => b.firstOrders - a.firstOrders),
    byHeardFrom: byHeard.sort((a, b) => b.firstOrders - a.firstOrders),
    byPromoter: byPromoter.sort((a, b) => b.orders - a.orders),
    byStall: [...stalls.values()].map((s) => ({ ...s, revenuePaise: str(s.revenuePaise) })),
  };
}

// ── 2. repeat ───────────────────────────────────────────────────────────────

export function repeat({ from, to }) {
  const { byCustomer } = placedBook();
  const cohort = [];
  for (const [key, list] of byCustomer) {
    const first = list[0];
    if (!between(istDate(first.createdAt), from, to)) continue;
    const second = list[1] || null;
    const gapDays = second
      ? Math.round(((Date.parse(second.createdAt) - Date.parse(first.createdAt)) / DAY) * 10) / 10
      : null;
    cohort.push({ key, first, second, gapDays, orders: list.length });
  }
  const now = Date.now();
  // Only customers who have HAD 7 (or 30) days since their first order can be judged on it —
  // otherwise last night's new customer would count as "did not come back within a week".
  const judged7 = cohort.filter(
    (c) => now - Date.parse(c.first.createdAt) >= 7 * DAY || c.gapDays != null,
  );
  const judged30 = cohort.filter(
    (c) => now - Date.parse(c.first.createdAt) >= 30 * DAY || c.gapDays != null,
  );
  const in7 = cohort.filter((c) => c.gapDays != null && c.gapDays <= 7).length;
  const in30 = cohort.filter((c) => c.gapDays != null && c.gapDays <= 30).length;
  const gaps = cohort
    .map((c) => c.gapDays)
    .filter((g) => g != null)
    .sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;

  // Week-by-week cohorts so the trend is visible.
  const weeks = new Map();
  for (const c of cohort) {
    const d = istDate(c.first.createdAt);
    const wk = weekStart(d);
    const w = weeks.get(wk) || { weekOf: wk, newCustomers: 0, second7: 0, second30: 0 };
    w.newCustomers += 1;
    if (c.gapDays != null && c.gapDays <= 7) w.second7 += 1;
    if (c.gapDays != null && c.gapDays <= 30) w.second30 += 1;
    weeks.set(wk, w);
  }
  return {
    newCustomers: cohort.length,
    secondOrderWithin7: in7,
    secondOrderWithin7Pct: pct(in7, judged7.length),
    secondOrderWithin30: in30,
    secondOrderWithin30Pct: pct(in30, judged30.length),
    stillTooNewFor7: cohort.length - judged7.length,
    medianDaysToSecond: median,
    cameBack: gaps.length,
    weekly: [...weeks.values()].sort((a, b) => (a.weekOf < b.weekOf ? -1 : 1)),
  };
}

/** Monday of the IST week a date falls in. */
export function weekStart(iso) {
  const wd = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 Sun
  return addDaysISO(iso, -((wd + 6) % 7));
}

// ── 3. routine ──────────────────────────────────────────────────────────────

export const REMINDER_WINDOW_H = 2;

export function routine({ from, to }) {
  const { placed } = placedBook();
  const reminders = listOps('reminder')
    .filter((r) => between(istDate(r.at), from, to))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .map((r) => {
      const t = Date.parse(r.at);
      const w = REMINDER_WINDOW_H * 3600e3;
      const scoped = placed.filter(
        (o) => !r.communityId || o.address?.communityId === r.communityId,
      );
      const before = scoped.filter((o) => {
        const x = Date.parse(o.createdAt);
        return x >= t - w && x < t;
      }).length;
      const after = scoped.filter((o) => {
        const x = Date.parse(o.createdAt);
        return x >= t && x < t + w;
      }).length;
      return { ...r, ordersBefore: before, ordersAfter: after, lift: after - before };
    });

  // Orders per tower per delivery morning, and each community against what it can take.
  const live = placed.filter((o) => o.status !== 'CANCELLED' && between(o.deliveryDate, from, to));
  const towers = new Map();
  const perCommunityDay = new Map();
  for (const o of live) {
    const cid = o.address?.communityId || '—';
    const tower = o.address?.block || '—';
    const tk = `${cid}|${tower}`;
    const t = towers.get(tk) || {
      communityId: cid,
      communityName: o.address?.communityName || cid,
      tower,
      orders: 0,
      days: new Set(),
    };
    t.orders += 1;
    t.days.add(o.deliveryDate);
    towers.set(tk, t);
    const dk = `${cid}|${o.deliveryDate}`;
    perCommunityDay.set(dk, (perCommunityDay.get(dk) || 0) + 1);
  }
  const deliveryDays = new Set(live.map((o) => o.deliveryDate)).size || 1;
  const communities = listCommunities().map((c) => {
    const capacity = Number(getOps('communityMeta', c.id)?.capacity) || null;
    const days = [...perCommunityDay].filter(([k]) => k.startsWith(`${c.id}|`)).map(([, n]) => n);
    const avg = days.length ? Math.round((sum(days, (n) => n) / days.length) * 10) / 10 : 0;
    const peak = days.length ? Math.max(...days) : 0;
    return {
      id: c.id,
      name: c.name,
      capacity,
      avgPerMorning: avg,
      peakMorning: peak,
      utilisationPct: capacity ? pct(avg, capacity) : null,
      mornings: days.length,
    };
  });
  return {
    reminderWindowHours: REMINDER_WINDOW_H,
    reminders,
    towers: [...towers.values()]
      .map((t) => ({
        communityId: t.communityId,
        communityName: t.communityName,
        tower: t.tower,
        orders: t.orders,
        avgPerMorning: Math.round((t.orders / Math.max(1, t.days.size)) * 10) / 10,
        perMorningAcrossRange: Math.round((t.orders / deliveryDays) * 100) / 100,
      }))
      .sort((a, b) => b.orders - a.orders),
    communities,
  };
}

// ── 4. promise ──────────────────────────────────────────────────────────────

/** When this order's delivery window ends, as an instant. Null when it cannot be known. */
export function windowEndMs(o) {
  const c = getCommunity(o.address?.communityId);
  const defs = c ? communityWindows(c) : [];
  const def = defs.find((w) => w.key === o.window);
  if (!def || !o.deliveryDate) return null;
  return istInstantMs(o.deliveryDate, def.end);
}

export function promise({ from, to }) {
  const { placed } = placedBook();
  const due = placed.filter((o) => between(o.deliveryDate, from, to) && o.status !== 'CANCELLED');
  const delivered = due.filter((o) => o.status === 'DELIVERED');
  const now = Date.now();
  const rows = due.map((o) => {
    const end = windowEndMs(o);
    const at = o.deliveredAt ? Date.parse(o.deliveredAt) : null;
    let state;
    if (o.status === 'DELIVERED')
      state = end != null && at != null && at > end ? 'LATE' : 'ON_TIME';
    else state = end != null && now > end ? 'OVERDUE' : 'OPEN';
    const lateMin = end != null && at != null && at > end ? Math.round((at - end) / 60000) : null;
    return { o, state, lateMin };
  });
  const late = rows.filter((r) => r.state === 'LATE' || r.state === 'OVERDUE');
  const onTime = rows.filter((r) => r.state === 'ON_TIME').length;

  // Refunds: every cancelled order that had money in it, and whether the money went back.
  const cancelled = placed.filter(
    (o) => o.status === 'CANCELLED' && between(o.deliveryDate, from, to),
  );
  const refunds = cancelled
    .map((o) => {
      const pay = paymentForOrder(o.id);
      const paidGateway =
        pay && ['CAPTURED', 'REFUNDED'].includes(pay.status) ? Number(pay.amountPaise) : 0;
      const paidWallet = Number(o.walletAppliedPaise || 0);
      if (paidGateway + paidWallet <= 0) return null;
      const cancelAt = Date.parse(
        (o.timeline || []).filter((t) => t.status === 'CANCELLED').pop()?.at || o.createdAt,
      );
      const ledger = o.customerId ? getWallet(o.customerId).ledger || [] : [];
      const walletBack = ledger.find(
        (e) => e.source === 'REFUND' && e.reference === o.orderNumber && e.direction === 'CREDIT',
      );
      const gatewayBack = pay ? Number(pay.refundedPaise || 0) : 0;
      const done =
        (paidWallet === 0 || !!walletBack) && (paidGateway === 0 || gatewayBack >= paidGateway);
      const hours = walletBack
        ? Math.round(((Date.parse(walletBack.createdAt) - cancelAt) / 3600e3) * 10) / 10
        : null;
      return {
        orderNumber: o.orderNumber,
        paidPaise: str(paidGateway + paidWallet),
        done,
        failed: !!pay?.refundFailed,
        hoursToWalletRefund: hours,
      };
    })
    .filter(Boolean);
  return {
    deliveries: due.length,
    delivered: delivered.length,
    onTime,
    onTimePct: pct(onTime, delivered.length),
    late: late.map(({ o, state, lateMin }) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      communityName: o.address?.communityName || null,
      deliveryDate: o.deliveryDate,
      window: o.window,
      state,
      minutesLate: lateMin,
      deliveredAt: o.deliveredAt || null,
      reason: getOps('delay', o.id)?.reason || null,
      reasonNote: getOps('delay', o.id)?.note || null,
    })),
    refunds: {
      due: refunds.length,
      done: refunds.filter((r) => r.done).length,
      failed: refunds.filter((r) => r.failed).length,
      list: refunds,
    },
  };
}

export const DELAY_REASONS = {
  VEHICLE: 'Vehicle / breakdown',
  TRAFFIC: 'Traffic or route',
  PROCUREMENT: 'Produce reached the hub late',
  PACKING: 'Packing ran late',
  STAFF: 'Short of delivery staff',
  CUSTOMER: 'Customer not reachable / gate held us',
  WEATHER: 'Weather',
  OTHER: 'Other',
};

// ── 5. offers ───────────────────────────────────────────────────────────────

export function offers({ from, to }) {
  const { placed, byCustomer } = placedBook();
  const inRange = placed.filter(
    (o) => o.status !== 'CANCELLED' && between(istDate(o.createdAt), from, to),
  );
  const plain = inRange.filter((o) => !o.couponCode);
  const aovPlain = plain.length ? sum(plain, (o) => o.subtotalPaise) / plain.length : 0;
  const marginOf = (arr) =>
    sum(
      arr,
      (o) =>
        Number(o.subtotalPaise) - Number(o.costPaise || 0) - Number(o.couponDiscountPaise || 0),
    );
  const codes = new Map(listCoupons().map((c) => [c.code, c]));
  for (const o of inRange)
    if (o.couponCode && !codes.has(o.couponCode)) codes.set(o.couponCode, { code: o.couponCode });
  const coupons = [...codes.values()].map((c) => {
    const used = inRange.filter((o) => o.couponCode === c.code);
    const newCust = used.filter((o) => {
      const list = byCustomer.get(customerKeyOf(o)) || [];
      return list[0]?.id === o.id;
    });
    const cameBack = newCust.filter(
      (o) => (byCustomer.get(customerKeyOf(o)) || []).length > 1,
    ).length;
    const revenue = sum(used, (o) => o.subtotalPaise);
    const discount = sum(used, (o) => o.couponDiscountPaise);
    const aov = used.length ? revenue / used.length : 0;
    return {
      code: c.code,
      active: c.isActive !== false,
      orders: used.length,
      newCustomers: newCust.length,
      newCustomersCameBack: cameBack,
      revenuePaise: str(revenue),
      discountPaise: str(discount),
      aovPaise: used.length ? str(aov) : null,
      aovVsNoCouponPaise: used.length ? str(aov - aovPlain) : null,
      marginAfterDiscountPaise: str(marginOf(used)),
      marginAfterDiscountPct: pct(marginOf(used), revenue),
      // Discount spent per new customer — what the offer "bought".
      costPerNewCustomerPaise: newCust.length ? str(discount / newCust.length) : null,
    };
  });
  return {
    orders: inRange.length,
    withCoupon: inRange.length - plain.length,
    aovNoCouponPaise: str(aovPlain),
    marginNoCouponPct: pct(
      marginOf(plain),
      sum(plain, (o) => o.subtotalPaise),
    ),
    coupons: coupons.filter((c) => c.orders > 0 || c.active).sort((a, b) => b.orders - a.orders),
  };
}

// ── products: winners and losers ─────────────────────────────────────────────

export function products({ from, to }) {
  const { placed } = placedBook();
  const live = placed.filter((o) => o.status !== 'CANCELLED' && between(o.deliveryDate, from, to));
  const cats = new Map(listCategories().map((c) => [c.id, c.name]));
  const rows = new Map(
    listProducts().map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        categoryId: p.category,
        category: cats.get(p.category) || p.category,
        unit: p.unit,
        isActive: p.isActive !== false,
        availability: p.availability || 'AVAILABLE',
        orders: 0,
        units: 0,
        revenue: 0,
        cost: 0,
      },
    ]),
  );
  for (const o of live)
    for (const it of o.items || []) {
      const r = rows.get(it.productId);
      if (!r) continue;
      r.orders += 1;
      r.units += Number(it.quantity) || 0;
      r.revenue += Number(it.lineTotalPaise) || 0;
      r.cost += Number(it.lineCostPaise) || 0;
    }
  const totalRevenue = sum([...rows.values()], (r) => r.revenue);
  const list = [...rows.values()].map((r) => ({
    ...r,
    units: round3(r.units),
    revenuePaise: str(r.revenue),
    costPaise: str(r.cost),
    profitPaise: str(r.revenue - r.cost),
    marginPct: pct(r.revenue - r.cost, r.revenue),
    revenueSharePct: pct(r.revenue, totalRevenue),
  }));
  for (const r of list) {
    delete r.revenue;
    delete r.cost;
  }
  const byProfit = [...list]
    .filter((r) => r.orders > 0)
    .sort((a, b) => Number(b.profitPaise) - Number(a.profitPaise));
  const losers = [...list]
    .filter((r) => r.isActive)
    .sort((a, b) => a.orders - b.orders || Number(a.profitPaise) - Number(b.profitPaise))
    .slice(0, 10);
  return {
    orders: live.length,
    winners: byProfit.slice(0, 10),
    losers,
    neverOrdered: list.filter((r) => r.isActive && r.orders === 0).length,
    products: list.sort((a, b) => Number(b.profitPaise) - Number(a.profitPaise)),
    categories: listCategories().map((c) => ({ id: c.id, name: c.name })),
  };
}

// ── buffer & wastage ─────────────────────────────────────────────────────────

/** Per product, per delivery day: what was ordered, what the buffer added, and what became of it. */
export function buffer({ from, to }) {
  const { placed } = placedBook();
  const live = placed.filter((o) => o.status !== 'CANCELLED' && between(o.deliveryDate, from, to));
  const prod = new Map(listProducts().map((p) => [p.id, p]));
  const agg = new Map();
  for (const o of live)
    for (const it of o.items || []) {
      const k = `${o.deliveryDate}:${it.productId}`;
      const a = agg.get(k) || {
        date: o.deliveryDate,
        productId: it.productId,
        qty: 0,
        unitCost: 0,
        costSum: 0,
      };
      a.qty += Number(it.quantity) || 0;
      a.costSum += Number(it.lineCostPaise) || 0;
      agg.set(k, a);
    }
  const days = [...agg.values()].map((a) => {
    const p = prod.get(a.productId);
    const unit = p?.unit || 'KG';
    const plan = planProcurement(a.qty, p?.bufferPct ?? 10, unit);
    const extra = round3(plan.procureQty - plan.requiredQty);
    const unitCost = a.qty > 0 ? a.costSum / a.qty : Number(p?.costPaise || 0);
    const w = getOps('wastage', `${a.date}:${a.productId}`);
    const used = w ? Number(w.usedQty) || 0 : null;
    const wasted = w ? Number(w.wastedQty) || 0 : null;
    return {
      date: a.date,
      productId: a.productId,
      name: p?.name || a.productId,
      unit,
      bufferPct: p?.bufferPct ?? 10,
      orderedQty: round3(a.qty),
      procureQty: plan.procureQty,
      extraQty: extra,
      extraCostPaise: str(extra * unitCost),
      usedQty: used,
      wastedQty: wasted,
      usedCostPaise: used == null ? null : str(used * unitCost),
      wastedCostPaise: wasted == null ? null : str(wasted * unitCost),
      recorded: !!w,
      note: w?.note || null,
    };
  });
  // Per product: a suggested buffer from what was actually used, once there is enough to go on.
  const byProduct = new Map();
  for (const d of days) {
    const b = byProduct.get(d.productId) || {
      productId: d.productId,
      name: d.name,
      unit: d.unit,
      bufferPct: d.bufferPct,
      days: 0,
      recordedDays: 0,
      orderedQty: 0,
      extraQty: 0,
      usedQty: 0,
      wastedQty: 0,
      extraCost: 0,
      wastedCost: 0,
      maxUsedRatio: 0,
    };
    b.days += 1;
    b.orderedQty += d.orderedQty;
    b.extraQty += d.extraQty;
    b.extraCost += Number(d.extraCostPaise);
    if (d.recorded) {
      b.recordedDays += 1;
      b.usedQty += d.usedQty;
      b.wastedQty += d.wastedQty;
      b.wastedCost += Number(d.wastedCostPaise);
      if (d.orderedQty > 0) b.maxUsedRatio = Math.max(b.maxUsedRatio, d.usedQty / d.orderedQty);
    }
    byProduct.set(d.productId, b);
  }
  const MIN_DAYS = 5;
  const perProduct = [...byProduct.values()].map((b) => ({
    productId: b.productId,
    name: b.name,
    unit: b.unit,
    bufferPct: b.bufferPct,
    days: b.days,
    recordedDays: b.recordedDays,
    orderedQty: round3(b.orderedQty),
    extraQty: round3(b.extraQty),
    usedQty: round3(b.usedQty),
    wastedQty: round3(b.wastedQty),
    extraCostPaise: str(b.extraCost),
    wastedCostPaise: str(b.wastedCost),
    usedPctOfExtra: pct(b.usedQty, b.extraQty),
    // The worst day's real need, plus 2 points of headroom — only once there are enough days.
    suggestedBufferPct:
      b.recordedDays >= MIN_DAYS
        ? Math.min(30, Math.max(0, Math.ceil(b.maxUsedRatio * 100) + 2))
        : null,
  }));
  const recorded = days.filter((d) => d.recorded);
  return {
    minDaysForSuggestion: MIN_DAYS,
    totals: {
      extraCostPaise: str(sum(days, (d) => d.extraCostPaise)),
      usedCostPaise: str(sum(recorded, (d) => d.usedCostPaise)),
      wastedCostPaise: str(sum(recorded, (d) => d.wastedCostPaise)),
      lines: days.length,
      recordedLines: recorded.length,
      wastedPctOfExtra: pct(
        sum(recorded, (d) => d.wastedQty),
        sum(recorded, (d) => d.extraQty),
      ),
    },
    perProduct: perProduct.sort((a, b) => Number(b.extraCostPaise) - Number(a.extraCostPaise)),
    days: days.sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name),
    ),
  };
}

// ── finance ─────────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = {
  TRANSPORT: 'Transport & logistics',
  FUEL: 'Fuel',
  DELIVERY_STAFF: 'Delivery staff',
  SALARIES: 'Salaries',
  RENT: 'Rent & hub',
  PACKAGING: 'Packaging',
  HOSTING: 'Hosting & software',
  MARKETING: 'Marketing & advertising',
  COUNTERS: 'Community stalls / counters',
  UTILITIES: 'Utilities',
  OTHER: 'Other',
};

const daysIn = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;

/** An expense's share of a date range. One-off: whole amount if its date is in range. Monthly: per day. */
export function expenseShare(e, { from, to }) {
  const amt = Number(e.amountPaise) || 0;
  if (e.recurring === 'MONTHLY') {
    const start = e.date > from ? e.date : from;
    const end = e.endDate && e.endDate < to ? e.endDate : to;
    if (start > end) return 0;
    return Math.round((amt * 12 * daysIn(start, end)) / 365);
  }
  return between(e.date, from, to) ? amt : 0;
}

export function finance({ from, to }) {
  const { placed } = placedBook();
  const live = placed.filter((o) => IN_HAND.has(o.status) && between(o.deliveryDate, from, to));
  const revenue = sum(live, (o) => o.subtotalPaise);
  const discounts = sum(live, (o) => o.couponDiscountPaise);
  const delivery = sum(live, (o) => o.deliveryChargePaise);
  const fees = sum(live, (o) => sum(o.chargeBreakdown?.lines || [], (l) => l.amountPaise));
  const gst = sum(live, (o) => o.taxPaise);
  const cogs = sum(live, (o) => o.costPaise);
  const buf = buffer({ from, to });
  const bufferCost = Number(buf.totals.extraCostPaise);
  const referralsPaid = sum(
    listOps('referral').filter(
      (r) => r.status === 'REWARDED' && between(istDate(r.settledAt), from, to),
    ),
    (r) => Number(r.paidPaise || 0) + Number(r.welcomePaise || 0),
  );
  const netSales = revenue - discounts + delivery + fees;
  const grossProfit = netSales - cogs - bufferCost;
  const expenses = listOps('expense')
    .map((e) => ({ ...e, sharePaise: expenseShare(e, { from, to }) }))
    .filter((e) => e.sharePaise > 0);
  const byCat = new Map();
  for (const e of expenses) {
    const k = e.category || 'OTHER';
    const c = byCat.get(k) || {
      category: k,
      label: EXPENSE_CATEGORIES[k] || k,
      fixedPaise: 0,
      variablePaise: 0,
    };
    if (e.kind === 'FIXED') c.fixedPaise += e.sharePaise;
    else c.variablePaise += e.sharePaise;
    byCat.set(k, c);
  }
  const opex = sum(expenses, (e) => e.sharePaise) + referralsPaid;
  const netBeforeTax = grossProfit - opex;
  const taxPct = Number(getSettings('finance').incomeTaxPct) || 0;
  const tax = netBeforeTax > 0 ? Math.round((netBeforeTax * taxPct) / 100) : 0;
  return {
    range: { from, to, days: daysIn(from, to) },
    orders: live.length,
    lines: {
      revenuePaise: str(revenue),
      discountsPaise: str(discounts),
      deliveryFeesPaise: str(delivery),
      otherFeesPaise: str(fees),
      netSalesPaise: str(netSales),
      gstCollectedPaise: str(gst),
      produceCostPaise: str(cogs),
      bufferCostPaise: str(bufferCost),
      grossProfitPaise: str(grossProfit),
      grossMarginPct: pct(grossProfit, netSales),
      operatingExpensesPaise: str(opex),
      referralRewardsPaise: str(referralsPaid),
      netProfitBeforeTaxPaise: str(netBeforeTax),
      incomeTaxPct: taxPct,
      estimatedTaxPaise: str(tax),
      netProfitAfterTaxPaise: str(netBeforeTax - tax),
      netMarginPct: pct(netBeforeTax - tax, netSales),
    },
    wastage: buf.totals,
    expensesByCategory: [...byCat.values()].map((c) => ({
      ...c,
      fixedPaise: str(c.fixedPaise),
      variablePaise: str(c.variablePaise),
      totalPaise: str(c.fixedPaise + c.variablePaise),
    })),
    fixedPaise: str(
      sum(
        expenses.filter((e) => e.kind === 'FIXED'),
        (e) => e.sharePaise,
      ),
    ),
    variablePaise: str(
      sum(
        expenses.filter((e) => e.kind !== 'FIXED'),
        (e) => e.sharePaise,
      ) + referralsPaid,
    ),
  };
}
