/**
 * Procurement maths. Given the ordered quantity of an item and its buffer %, work out how much to
 * actually BUY — buffer covers trim loss, spoilage and short weight, then we round UP to a sensible
 * purchase unit (you can't buy 1.31 kg of tomatoes at the mandi; you buy 1.5).
 */

/** How coarsely each unit is purchased. KG is bought in half-kilos; everything else whole. */
export function purchaseStep(unit) {
  return unit === 'KG' ? 0.5 : 1;
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * @param {number} requiredQty  summed ordered quantity
 * @param {number} bufferPct    whole-number percent (e.g. 15)
 * @param {string} unit
 * @returns {{ requiredQty:number, bufferQty:number, rawQty:number, procureQty:number, step:number }}
 */
export function planProcurement(requiredQty, bufferPct, unit) {
  const req = round3(requiredQty);
  const bufferQty = round3(req * (Number(bufferPct) / 100));
  const raw = req + bufferQty;
  const step = purchaseStep(unit);
  const procureQty = round3(Math.ceil((raw - 1e-9) / step) * step);
  return { requiredQty: req, bufferQty, rawQty: round3(raw), procureQty, step };
}
