/**
 * The Friday report Rapture7 reads (Developer Tracking Brief, 19 Nov 2026 §05), computed from the
 * order book, the operating records and the event log — for one IST week (Mon–Sun by default).
 *
 * Every metric is defined exactly as the brief defines it, and each says what it is cut by.
 *
 * Privacy (DPDP s.8): the export goes to an outside agency, so it carries NO name, mobile number or
 * flat — households appear as a one-way key (HMAC of the account id) that is stable week to week,
 * so cohorts can be followed without anyone being identifiable from the file.
 */
import { createHmac } from 'node:crypto';
import { listOrders, getCommunity, listProducts } from '../store.js';
import { getOps, listOps, getSettings } from '../ops-store.js';
import { wasPlaced, customerKeyOf } from './customer-history.js';
import { addDaysISO, istInstantMs, todayISO } from './dates.js';
import { communityWindows } from './windows.js';
import { listEvents } from './events.js';
import { expenseShare } from './insights.js';
import { IS_PROD } from './env.js';

const DAY = 864e5;
const LIVE = new Set(['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED']);

const SECRET = (process.env.CUSTOMER_KEY_SECRET || process.env.ADMIN_SESSION_SECRET || '').trim();
const KEY =
  SECRET.length >= 16 ? SECRET : IS_PROD ? 'f2f-report-unset-secret' : 'f2f-dev-report-secret';
/** A household's key in the export: one-way, stable, not reversible without the server secret. */
export const householdKey = (k) =>
  k ? `h_${createHmac('sha256', KEY).update(`report:${k}`).digest('hex').slice(0, 12)}` : null;

const istDate = (iso) => (iso ? todayISO(Date.parse(iso)) : null);
const between = (d, from, to) => !!d && d >= from && d <= to;
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/** Monday-to-Sunday week containing `iso` (or ending yesterday, by default the last full week). */
export function weekOf(query = {}) {
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  const anchor = ok(query.week) ? String(query.week) : addDaysISO(todayISO(), -1);
  const wd = (new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  const from = addDaysISO(anchor, -wd);
  return { from, to: addDaysISO(from, 6) };
}

function book() {
  const placed = listOrders()
    .filter(wasPlaced)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const byHouse = new Map();
  for (const o of placed) {
    const k = customerKeyOf(o);
    if (!k) continue;
    if (!byHouse.has(k)) byHouse.set(k, []);
    byHouse.get(k).push(o);
  }
  return { placed, byHouse };
}

const groupCount = (rows, keyFn) => {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r) || '—';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
};

function onTimeOf(o) {
  const c = getCommunity(o.address?.communityId);
  const def = c ? communityWindows(c).find((w) => w.key === o.window) : null;
  if (!def || !o.deliveredAt || !o.deliveryDate) return null;
  const at = Date.parse(o.deliveredAt);
  return (
    at >= istInstantMs(o.deliveryDate, def.start) && at <= istInstantMs(o.deliveryDate, def.end)
  );
}

/** The whole report for one week. */
export function weeklyReport(range) {
  const { from, to } = range;
  const { placed, byHouse } = book();
  const live = placed.filter((o) => o.status !== 'CANCELLED');
  const inWeek = live.filter((o) => between(istDate(o.createdAt), from, to));
  const now = Date.now();
  const products = new Map(listProducts().map((p) => [p.id, p]));
  const attrOf = (o) => getOps('orderAttr', o.id) || {};
  const sourceOf = (k, first) => {
    const a = first?.customerId ? getOps('attribution', first.customerId) : null;
    return a?.acquisitionSource || a?.heardFrom || 'not recorded';
  };

  // 1. Weekly ordering households (north star) — by community and tower.
  const houses = new Map();
  for (const o of inWeek) houses.set(customerKeyOf(o), o);
  const northStar = {
    households: houses.size,
    byCommunity: groupCount([...houses.values()], (o) => o.address?.communityName),
    byTower: groupCount(
      [...houses.values()],
      (o) => `${o.address?.communityName || '—'} · ${o.address?.block || '—'}`,
    ),
  };

  // 2. Assisted first orders per counter session.
  const sessions = listOps('counterSession').filter((s) => between(s.date, from, to));
  const firstOrders = [...byHouse.values()]
    .map((l) => l[0])
    .filter((o) => o.status !== 'CANCELLED');
  const sessionRows = sessions.map((s) => {
    const start = istInstantMs(s.date, s.start);
    const end = istInstantMs(s.date, s.end);
    const assisted = firstOrders.filter((o) => {
      const t = Date.parse(o.createdAt);
      const a = attrOf(o);
      const at = o.customerId ? getOps('attribution', o.customerId) : null;
      const inSession = t >= start && t <= end && o.address?.communityId === s.communityId;
      const promoterTagged =
        a.promoterCode &&
        (s.promoterCodes || []).includes(a.promoterCode) &&
        t >= start &&
        t <= end;
      return inSession || promoterTagged || (inSession && at?.heardFrom === 'COUNTER');
    });
    return {
      id: s.id,
      date: s.date,
      start: s.start,
      end: s.end,
      community: getCommunity(s.communityId)?.name || s.communityId,
      promoters: (s.promoterCodes || []).join(', '),
      assistedFirstOrders: assisted.length,
      // QR / link scans that day for this session's promoters (anonymous counts from /go).
      scans: listOps('linkClick')
        .filter((k) => k.day === s.date && k.p && (s.promoterCodes || []).includes(k.p))
        .reduce((n, k) => n + (k.n || 0), 0),
    };
  });
  const assisted = {
    sessions: sessionRows.length,
    assistedFirstOrders: sessionRows.reduce((n, r) => n + r.assistedFirstOrders, 0),
    perSession: sessionRows.length
      ? Math.round(
          (sessionRows.reduce((n, r) => n + r.assistedFirstOrders, 0) / sessionRows.length) * 10,
        ) / 10
      : null,
    rows: sessionRows,
    // Every tagged-link scan in the week, by source (counter, whatsapp, referral, …).
    linkScans: Object.entries(
      listOps('linkClick')
        .filter((k) => between(k.day, from, to))
        .reduce(
          (m, k) => ({ ...m, [k.src || 'untagged']: (m[k.src || 'untagged'] || 0) + (k.n || 0) }),
          {},
        ),
    ).map(([key, n]) => ({ key, n })),
  };

  // 3. Second order within 7 and 30 days of the FIRST DELIVERY — by weekly cohort (week of first
  //    delivery), community and source. Judged only once the 7 (30) days have passed.
  const cohorts = new Map();
  const second = { eligible7: 0, hit7: 0, eligible30: 0, hit30: 0 };
  const bySource = new Map();
  const byCommunity2 = new Map();
  for (const [k, list] of byHouse) {
    const firstDelivered = list.find((o) => o.status === 'DELIVERED' && o.deliveredAt);
    if (!firstDelivered) continue;
    const d1 = Date.parse(firstDelivered.deliveredAt);
    const idx = list.indexOf(firstDelivered);
    const next = list.slice(idx + 1).find((o) => o.status !== 'CANCELLED');
    const gap = next ? (Date.parse(next.createdAt) - d1) / DAY : null;
    const wk = weekOf({ week: istDate(firstDelivered.deliveredAt) }).from;
    const c = cohorts.get(wk) || {
      cohortWeek: wk,
      households: 0,
      eligible7: 0,
      hit7: 0,
      eligible30: 0,
      hit30: 0,
    };
    c.households += 1;
    const src = sourceOf(k, list[0]);
    const com = firstDelivered.address?.communityName || '—';
    for (const [m, keyName] of [
      [bySource, src],
      [byCommunity2, com],
    ]) {
      const e = m.get(keyName) || { key: keyName, eligible7: 0, hit7: 0, eligible30: 0, hit30: 0 };
      if (now - d1 >= 7 * DAY) {
        e.eligible7 += 1;
        if (gap != null && gap <= 7) e.hit7 += 1;
      }
      if (now - d1 >= 30 * DAY) {
        e.eligible30 += 1;
        if (gap != null && gap <= 30) e.hit30 += 1;
      }
      m.set(keyName, e);
    }
    if (now - d1 >= 7 * DAY) {
      c.eligible7 += 1;
      second.eligible7 += 1;
      if (gap != null && gap <= 7) {
        c.hit7 += 1;
        second.hit7 += 1;
      }
    }
    if (now - d1 >= 30 * DAY) {
      c.eligible30 += 1;
      second.eligible30 += 1;
      if (gap != null && gap <= 30) {
        c.hit30 += 1;
        second.hit30 += 1;
      }
    }
    cohorts.set(wk, c);
  }
  const rate = (e) => ({
    ...e,
    within7Pct: pct(e.hit7, e.eligible7),
    within30Pct: pct(e.hit30, e.eligible30),
  });
  const secondOrder = {
    within7Pct: pct(second.hit7, second.eligible7),
    within30Pct: pct(second.hit30, second.eligible30),
    ...second,
    cohorts: [...cohorts.values()].sort((a, b) => (a.cohortWeek < b.cohortWeek ? -1 : 1)).map(rate),
    bySource: [...bySource.values()].map(rate),
    byCommunity: [...byCommunity2.values()].map(rate),
  };

  // 4. Ordering three weeks running — at least one order in each of the 3 weeks ending this week.
  const weeks = [0, 1, 2].map((i) => ({
    from: addDaysISO(from, -7 * i),
    to: addDaysISO(to, -7 * i),
  }));
  const streakers = [...byHouse.values()].filter((list) =>
    weeks.every((w) =>
      list.some((o) => o.status !== 'CANCELLED' && between(istDate(o.createdAt), w.from, w.to)),
    ),
  );
  const threeWeeks = {
    households: streakers.length,
    byCommunity: groupCount(
      streakers.map((l) => l[l.length - 1]),
      (o) => o.address?.communityName,
    ),
  };

  // 5. Orders and kg per morning against capacity — delivered orders by delivery date.
  const capacityKg = Number(getSettings('report').capacityKgPerMorning) || 100;
  const deliveredWeek = live.filter(
    (o) => o.status === 'DELIVERED' && between(o.deliveryDate, from, to),
  );
  const mornings = new Map();
  for (const o of deliveredWeek) {
    const kg = (o.items || []).reduce(
      (n, it) =>
        n + ((products.get(it.productId)?.unit || it.unit) === 'KG' ? Number(it.quantity) || 0 : 0),
      0,
    );
    const k = `${o.deliveryDate}|${o.address?.communityName || '—'}|${o.address?.block || '—'}`;
    const r = mornings.get(k) || {
      date: o.deliveryDate,
      community: o.address?.communityName || '—',
      tower: o.address?.block || '—',
      orders: 0,
      kg: 0,
    };
    r.orders += 1;
    r.kg += kg;
    mornings.set(k, r);
  }
  const perDay = new Map();
  for (const r of mornings.values()) {
    const d = perDay.get(r.date) || { date: r.date, orders: 0, kg: 0 };
    d.orders += r.orders;
    d.kg += r.kg;
    perDay.set(r.date, d);
  }
  const capacity = {
    capacityKg,
    days: [...perDay.values()]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((d) => ({ ...d, kg: Math.round(d.kg * 10) / 10, capacityPct: pct(d.kg, capacityKg) })),
    rows: [...mornings.values()].map((r) => ({ ...r, kg: Math.round(r.kg * 10) / 10 })),
  };

  // 6. Average basket value before discount — by order number (1st, 2nd, later).
  const nthOf = new Map();
  for (const list of byHouse.values()) list.forEach((o, i) => nthOf.set(o.id, i + 1));
  const basket = { first: [], second: [], later: [] };
  for (const o of inWeek) {
    const n = nthOf.get(o.id) || 1;
    (n === 1 ? basket.first : n === 2 ? basket.second : basket.later).push(Number(o.subtotalPaise));
  }
  const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  const basketValue = {
    allPaise: avg([...basket.first, ...basket.second, ...basket.later]),
    firstPaise: avg(basket.first),
    secondPaise: avg(basket.second),
    laterPaise: avg(basket.later),
    counts: {
      first: basket.first.length,
      second: basket.second.length,
      later: basket.later.length,
    },
  };

  // 7. Discount cost and margin left — by discount type; margin after discount, packaging, delivery.
  const byType = new Map();
  for (const o of inWeek) {
    const d = Number(o.couponDiscountPaise || 0);
    if (d <= 0) continue;
    const t = attrOf(o).discountType || (o.couponCode ? 'COUPON' : 'OTHER');
    byType.set(t, (byType.get(t) || 0) + d);
  }
  const referralPaid = listOps('referral')
    .filter((r) => r.status === 'REWARDED' && between(istDate(r.settledAt), from, to))
    .reduce((n, r) => n + Number(r.paidPaise || 0) + Number(r.welcomePaise || 0), 0);
  if (referralPaid) byType.set('REFERRAL_CREDIT', referralPaid);
  const revenue = inWeek.reduce((n, o) => n + Number(o.subtotalPaise), 0);
  const cogs = inWeek.reduce((n, o) => n + Number(o.costPaise || 0), 0);
  const discountTotal = [...byType.values()].reduce((a, b) => a + b, 0);
  const opsCost = listOps('expense')
    .filter((e) => ['PACKAGING', 'DELIVERY_STAFF', 'TRANSPORT', 'FUEL'].includes(e.category))
    .reduce((n, e) => n + expenseShare(e, { from, to }), 0);
  const marginLeft = revenue - cogs - discountTotal - opsCost;
  const discounts = {
    byType: [...byType].map(([type, paise]) => ({ type, paise })),
    totalPaise: discountTotal,
    packagingAndDeliveryPaise: opsCost,
    revenuePaise: revenue,
    marginLeftPaise: marginLeft,
    marginLeftPct: pct(marginLeft, revenue),
  };

  // 8. On-time delivery — delivered inside the window (06:00–10:00) ÷ delivered; by community, day.
  const ot = deliveredWeek.map((o) => ({ o, on: onTimeOf(o) }));
  const judged = ot.filter((x) => x.on !== null);
  const onTimeGroup = (keyFn) => {
    const m = new Map();
    for (const x of judged) {
      const k = keyFn(x.o);
      const e = m.get(k) || { key: k, delivered: 0, onTime: 0 };
      e.delivered += 1;
      if (x.on) e.onTime += 1;
      m.set(k, e);
    }
    return [...m.values()].map((e) => ({ ...e, onTimePct: pct(e.onTime, e.delivered) }));
  };
  const onTime = {
    delivered: judged.length,
    onTime: judged.filter((x) => x.on).length,
    onTimePct: pct(judged.filter((x) => x.on).length, judged.length),
    byCommunity: onTimeGroup((o) => o.address?.communityName || '—'),
    byDay: onTimeGroup((o) => o.deliveryDate),
  };

  // 9. Refund rate — orders refunded or replaced ÷ orders delivered; by reason.
  const fromMs = istInstantMs(from, '00:00');
  const toMs = istInstantMs(addDaysISO(to, 1), '00:00') - 1;
  const refundEvents = listEvents({ fromMs, toMs, name: 'order_refunded' });
  const refunds = {
    refundedOrReplaced: new Set(refundEvents.map((e) => e.props.order_id)).size,
    delivered: deliveredWeek.length,
    ratePct: pct(new Set(refundEvents.map((e) => e.props.order_id)).size, deliveredWeek.length),
    byReason: groupCount(refundEvents, (e) => e.props.reason),
  };

  // 10. Referral share — first orders with a referrer ÷ all first orders; by community.
  const firstsInWeek = firstOrders.filter((o) => between(istDate(o.createdAt), from, to));
  const referred = firstsInWeek.filter((o) => attrOf(o).referrerKey);
  const referral = {
    firstOrders: firstsInWeek.length,
    withReferrer: referred.length,
    sharePct: pct(referred.length, firstsInWeek.length),
    byCommunity: groupCount(referred, (o) => o.address?.communityName),
  };

  // 11. Waitlist votes — by community or area.
  const votes = listEvents({ fromMs, toMs, name: 'waitlist_vote' });
  const waitlist = {
    votes: votes.length,
    byArea: groupCount(votes, (e) => e.props.community || e.props.area || e.props.pincode),
  };

  return {
    week: range,
    generatedAt: new Date().toISOString(),
    northStar,
    assisted,
    secondOrder,
    threeWeeks,
    capacity,
    basketValue,
    discounts,
    onTime,
    refunds,
    referral,
    waitlist,
  };
}

/** The rows of the weekly export — pseudonymous, no names, numbers or flats. */
export function weeklyExportRows(range) {
  const { from, to } = range;
  const { placed, byHouse } = book();
  const nthOf = new Map();
  for (const list of byHouse.values()) list.forEach((o, i) => nthOf.set(o.id, i + 1));
  const orders = placed
    .filter((o) => between(istDate(o.createdAt), from, to) || between(o.deliveryDate, from, to))
    .map((o) => {
      const a = getOps('orderAttr', o.id) || {};
      return {
        order_number: o.orderNumber,
        household: householdKey(customerKeyOf(o)),
        order_nth: nthOf.get(o.id) || 1,
        community: o.address?.communityName || null,
        tower: o.address?.block || null,
        placed_at: o.createdAt,
        delivery_date: o.deliveryDate,
        status: o.status,
        order_value: Number(o.subtotalPaise) / 100,
        discount_type: a.discountType || (o.couponCode ? 'COUPON' : null),
        discount_value: Number(o.couponDiscountPaise || 0) / 100,
        total: Number(o.totalPaise) / 100,
        payment_method: o.paymentMethod,
        items_count: (o.items || []).length,
        source_tag: a.sourceTag || null,
        promoter_id: a.promoterCode || null,
        referred: a.referrerKey ? 'yes' : 'no',
        delivered_at: o.deliveredAt || null,
        on_time: o.status === 'DELIVERED' ? onTimeOf(o) : null,
      };
    });
  const customers = [...byHouse].map(([k, list]) => {
    const first = list[0];
    const att = first.customerId ? getOps('attribution', first.customerId) : null;
    const delivered = list.filter((o) => o.status === 'DELIVERED');
    return {
      household: householdKey(k),
      community: list[list.length - 1].address?.communityName || null,
      tower: list[list.length - 1].address?.block || null,
      acquisition_source: att?.acquisitionSource || att?.heardFrom || null,
      promoter_id: att?.promoterCode || null,
      referrer_id: att?.referrerId ? householdKey(att.referrerId) : null,
      first_order_date: istDate(first.createdAt),
      order_count: delivered.length,
      last_order_date: istDate(list[list.length - 1].createdAt),
    };
  });
  const fromMs = istInstantMs(from, '00:00');
  const toMs = istInstantMs(addDaysISO(to, 1), '00:00') - 1;
  const events = listEvents({ fromMs, toMs })
    .reverse()
    .map((e) => ({
      event: e.name,
      at: e.at,
      household: e.customerId ? householdKey(e.customerId) : null,
      properties: JSON.stringify(
        Object.fromEntries(
          Object.entries(e.props || {}).map(([k, v]) => [
            k,
            k === 'referrer_id' && v ? householdKey(v) : v,
          ]),
        ),
      ),
    }));
  return { orders, customers, events };
}
