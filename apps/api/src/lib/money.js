/**
 * Money is ALWAYS integer paise inside the service, and crosses the wire as a paise STRING.
 * No floats, ever. These helpers are the only place rupees and paise meet.
 */

/** Integer paise -> wire string. `money(3600)` -> `"3600"`. */
export const money = (n) => String(Math.round(Number(n)));

/** Rupees (number) -> integer paise. `rupeesToPaise(56)` -> `5600`. */
export const rupeesToPaise = (r) => Math.round(Number(r) * 100);

/** Integer paise -> rupees number, for display maths only (never for storage). */
export const paiseToRupees = (p) => Math.round(Number(p)) / 100;

/** "₹560" style label from paise, for CSV / logs. */
export const formatINR = (p) =>
  `₹${(Math.round(Number(p)) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
