/**
 * Turning a planned day into an order: what to buy, and which delivery window. Shared by the
 * "Confirm tomorrow" screen and the Dynamic Island card, so both ask about the same order.
 */
import { orderQuantityFor } from './nutrition';

/**
 * @param {any[]|undefined} meals  a planned day's meals
 * @param {Record<string, any>} productsById
 * @returns {{ shopping: { productId: string, grams: number }[],
 *   lines: { p: any, qty: number, paise: number }[] }}
 */
export function orderForMeals(meals, productsById) {
  /** @type {Record<string, number>} */
  const grams = {};
  for (const m of meals || [])
    for (const it of m.items || []) grams[it.productId] = (grams[it.productId] || 0) + it.grams;
  const shopping = Object.entries(grams).map(([productId, g]) => ({ productId, grams: g }));
  const lines = shopping
    .map((s) => {
      const p = productsById[s.productId];
      if (!p) return null;
      const qty = orderQuantityFor(p, s.productId, s.grams);
      return { p, qty, paise: Math.round(Number(p.pricePaise) * qty) };
    })
    .filter(Boolean);
  return { shopping, lines };
}

/** The lines as POST /cart/quote wants them. @param {{ p: any, qty: number }[]} lines */
export const quoteLines = (lines) =>
  lines
    .filter((l) => l.qty > 0)
    .map((l) => ({ productId: l.p.id, quantity: String(Number(l.qty.toFixed(3))) }));

/** The first open window on exactly this day. @param {any[]|undefined} windows @param {string} dateISO */
export const openWindowOn = (windows, dateISO) =>
  (windows || []).find((w) => w.isOpen && w.date === dateISO) || null;
