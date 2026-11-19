/**
 * Launch offer rules from Rapture7's brief (19 Nov 2026) — PENDING Fooducia's approval (inputs
 * row 8), so they ship SWITCHED OFF and every number is editable in the admin (Growth → Settings):
 *
 *   First order:   5% off.
 *   Second order:  placed within 7 days of the FIRST DELIVERY → 10% off a basket of ₹400 or more
 *                  (capped at ₹50), 5% off below ₹400.
 *   Window:        orders placed from 5 Dec 2026 to 17 Jan 2027 (IST dates, inclusive).
 *
 * One discount per order: a coupon the customer applied wins and the offer stands aside, so a
 * basket is never discounted twice. The discount travels in the order's existing discount field
 * (the bill, the invoice and every refund already handle it); its TYPE is recorded alongside so the
 * Friday report can split discount cost by type.
 */
import { listOrdersForCustomer } from '../store.js';
import { getSettings } from '../ops-store.js';
import { todayISO } from './dates.js';

const PLACED = new Set(['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED']);

/**
 * The offer this customer would get on a basket of `subtotalPaise` right now, or null.
 * @returns {{ type: 'LAUNCH_FIRST'|'LAUNCH_SECOND', label: string, pct: number, discountPaise: number } | null}
 */
export function launchOfferFor(customerId, subtotalPaise, now = Date.now()) {
  const s = getSettings('launchOffer');
  if (!s.enabled || !customerId || !(subtotalPaise > 0)) return null;
  const today = todayISO(now);
  if (today < s.startDate || today > s.endDate) return null;
  const placed = listOrdersForCustomer(customerId).filter((o) => PLACED.has(o.status));

  if (placed.length === 0) {
    const pct = Number(s.firstOrderPct) || 0;
    if (pct <= 0) return null;
    return {
      type: 'LAUNCH_FIRST',
      label: `Launch offer · ${pct}% off your first order`,
      pct,
      discountPaise: Math.round((subtotalPaise * pct) / 100),
    };
  }
  if (placed.length === 1 && placed[0].status === 'DELIVERED' && placed[0].deliveredAt) {
    const days = (now - Date.parse(placed[0].deliveredAt)) / 864e5;
    if (days > Number(s.secondOrderWithinDays)) return null;
    const big = subtotalPaise >= Number(s.secondOrderThresholdPaise);
    const pct = Number(big ? s.secondOrderPct : s.secondOrderLowPct) || 0;
    if (pct <= 0) return null;
    let d = Math.round((subtotalPaise * pct) / 100);
    if (big && Number(s.secondOrderCapPaise) > 0) d = Math.min(d, Number(s.secondOrderCapPaise));
    return {
      type: 'LAUNCH_SECOND',
      label: `Launch offer · ${pct}% off your second order`,
      pct,
      discountPaise: d,
    };
  }
  return null;
}
