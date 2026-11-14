/**
 * A farm or source as a shopper reads it: "Shamshabad belt" → "Shamshabad", "Ooty sourcing" →
 * "Ooty", "Market sourcing" → "Market". The catalogue keeps the operator's full wording; this only
 * trims the trailing word that told the operator what kind of source it was, so the card's one
 * line — "jama · Shamshabad" — fits instead of ending in an ellipsis.
 * @param {string|null|undefined} farm
 */
export function farmShort(farm) {
  const s = String(farm || '').trim();
  if (!s) return '';
  const short = s.replace(/\s+(belt|sourcing|farms?|region|area)$/i, '').trim();
  return short || s;
}
