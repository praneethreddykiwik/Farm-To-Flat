/**
 * All money is integer paise. The API serialises paise as strings; this module is the only
 * place that turns them into rupees for display. No component formats currency itself.
 */

/** @param {string|number|bigint|null|undefined} value @returns {number} */
export function toPaise(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Math.round(value);
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Indian digit grouping: 12,34,567 */
function groupIndian(intString) {
  if (intString.length <= 3) return intString;
  const last3 = intString.slice(-3);
  let rest = intString.slice(0, -3);
  const parts = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return `${parts.join(',')},${last3}`;
}

/**
 * @param {string|number|bigint|null|undefined} paise
 * @param {{ compact?: boolean, sign?: boolean, symbol?: boolean }} [opts]
 *   compact: drop ".00" when there are no paise
 */
export function formatPaise(paise, opts = {}) {
  const { compact = true, sign = false, symbol = true } = opts;
  const p = toPaise(paise);
  const neg = p < 0;
  const abs = Math.abs(p);
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;
  const whole = groupIndian(String(rupees));
  const frac = compact && rem === 0 ? '' : `.${String(rem).padStart(2, '0')}`;
  const prefix = neg ? '−' : sign ? '+' : '';
  return `${prefix}${symbol ? '₹' : ''}${whole}${frac}`;
}

/** Split for the animated Money component: ["₹", "1,250", ".50"] */
export function splitPaise(paise) {
  const p = Math.abs(toPaise(paise));
  const rupees = Math.floor(p / 100);
  const rem = p % 100;
  return {
    symbol: '₹',
    whole: groupIndian(String(rupees)),
    frac: rem === 0 ? '' : `.${String(rem).padStart(2, '0')}`,
  };
}

/** @param {number} paise @param {number} bp basis points (500 = 5%) */
export function applyBasisPoints(paise, bp) {
  return Math.round((toPaise(paise) * bp) / 10000);
}
