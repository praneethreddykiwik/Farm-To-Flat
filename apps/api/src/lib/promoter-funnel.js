/**
 * A promoter's path from QR to order, joined up (strategy discussion, 22 Nov 2026: "is this code
 * tracking the installation, or if they have actually placed the order?" — now both).
 *
 *   scans         times the QR page was opened (anonymous daily counts; one person can scan twice)
 *   signUps       people who installed from this promoter's QR and signed in. Android only: Google
 *                 Play passes the tag through the install, Apple's App Store does not.
 *   firstOrders   first orders credited to the promoter, by QR or by typing the code (both phones)
 *   typed         of those, the ones with no QR install behind them — how iPhones are counted
 *   orders/sales  every order credited
 *
 * Because iPhone installs cannot be seen, scans → sign-ups understates and is labelled so. Nothing
 * here is stored; it is worked out from the records on each request, so it is always current.
 */
import { getOps, listOps } from '../ops-store.js';
import { acquisition, istDate } from './insights.js';
import { normaliseCode } from './growth.js';
import { addDaysISO } from './dates.js';

const inRange = (d, from, to) => !!d && d >= from && d <= to;

export function promoterFunnel({ from, to }) {
  const stats = new Map(acquisition({ from, to }).byPromoter.map((p) => [p.code, p]));
  const clicks = listOps('linkClick').filter((k) => k.p);
  const installs = listOps('installSource').filter((i) => i.p);
  const firsts = listOps('attribution').filter(
    (a) => a.promoterCode && inRange(istDate(a.at), from, to),
  );
  const out = new Map();
  for (const code of listOps('promoter').map((p) => p.id)) {
    const mine = clicks.filter((k) => normaliseCode(k.p) === code);
    const scansOn = (d) => mine.filter((k) => k.day === d).reduce((n, k) => n + (k.n || 0), 0);
    const ranged = mine.filter((k) => inRange(k.day, from, to));
    const signUps = installs.filter(
      (i) => normaliseCode(i.p) === code && inRange(istDate(i.at), from, to),
    );
    const credited = firsts.filter((a) => a.promoterCode === code);
    const s = stats.get(code);
    const scans = ranged.reduce((n, k) => n + (k.n || 0), 0);
    out.set(code, {
      scans,
      signUps: signUps.length,
      typed: credited.filter((a) => normaliseCode(getOps('installSource', a.id)?.p) !== code)
        .length,
      firstOrders: s?.firstOrders || 0,
      orders: s?.orders || 0,
      revenuePaise: s?.revenuePaise || '0',
      lastScanDay: mine.reduce((d, k) => (k.day > d ? k.day : d), '') || null,
      // The last seven days of the range, oldest first, for the small chart.
      week: Array.from({ length: 7 }, (_, i) => {
        const day = addDaysISO(to, i - 6);
        return { day, scans: scansOn(day) };
      }),
    });
  }
  return out;
}

/** Totals for the top of the page. */
export function funnelTotals(map) {
  const sum = (k) => [...map.values()].reduce((n, f) => n + Number(f[k]), 0);
  return {
    scans: sum('scans'),
    signUps: sum('signUps'),
    firstOrders: sum('firstOrders'),
    orders: sum('orders'),
    revenuePaise: String(sum('revenuePaise')),
  };
}
