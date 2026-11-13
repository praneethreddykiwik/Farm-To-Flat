/**
 * What a basket actually costs, line by line.
 *
 * Until now an order was `subtotal - coupon + deliveryCharge` and that was the whole bill. Every
 * other cost of running the service — the platform fee, the rider, tax — was either invisible or
 * folded into the product price, which means it could not be changed without repricing the
 * catalogue.
 *
 * This computes an itemised bill the customer can read and an operator can change, and it is the
 * ONLY place that arithmetic lives: the cart preview and the committed order both call it, so the
 * figure quoted on the checkout screen and the figure charged cannot drift apart.
 *
 * ── On tax, which is the part worth getting right ──────────────────────────────────────────────
 *
 * There are two rates here, not one, and that is deliberate.
 *
 * Fresh, unbranded vegetables, fruit and meat are NIL-RATED under Indian GST — 0%, not 18%.
 * Applying a flat 18% to a basket of tomatoes would overcharge the customer and leave us
 * collecting tax we have no business collecting. A platform fee and a delivery fee are services,
 * and those are 18%.
 *
 * So: `goodsRateBps` defaults to 0 and `feeRateBps` to 1800, and both are operator-editable
 * because the correct answer depends on what ends up in the catalogue. The day pre-packaged
 * branded goods appear (5% or 12%), this needs a per-product rate rather than one number — the
 * shape here leaves room for that without changing the callers.
 *
 * Nothing in this file is a substitute for an accountant. It is a faithful implementation of
 * whatever rates the operator sets, and it shows its working.
 *
 * Everything is integer paise. No floats touch money.
 */

/** Basis points → an amount, rounded once. 1800 bps = 18%. */
const applyBps = (amountPaise, bps) => Math.round((amountPaise * bps) / 10000);

/** @typedef {{ id:string, label:string, kind:'FLAT'|'PERCENT', valuePaise?:number, valueBps?:number, taxable?:boolean, enabled?:boolean, note?:string|null }} ChargeRule */

/**
 * @param {object} input
 * @param {number} input.subtotalPaise      goods, before any discount
 * @param {number} [input.discountPaise]    coupon discount already validated
 * @param {number} [input.deliveryChargePaise] the existing delivery setting, shown as its own line
 * @param {ChargeRule[]} [input.charges]    operator-defined extra lines, in display order
 * @param {{enabled?:boolean,label?:string,goodsRateBps?:number,feeRateBps?:number}} [input.tax]
 */
export function priceBreakdown({
  subtotalPaise,
  discountPaise = 0,
  deliveryChargePaise = 0,
  charges = [],
  tax = {},
}) {
  const subtotal = Math.max(0, Math.round(Number(subtotalPaise) || 0));
  // A coupon cannot discount more than the goods are worth, and it must never make the basket
  // negative and start paying people to order.
  const discount = Math.min(subtotal, Math.max(0, Math.round(Number(discountPaise) || 0)));
  const goodsNet = subtotal - discount;

  /** @type {{id:string,label:string,amountPaise:number,taxable:boolean}[]} */
  const lines = [];

  const delivery = Math.max(0, Math.round(Number(deliveryChargePaise) || 0));
  if (delivery > 0) {
    lines.push({ id: 'delivery', label: 'Delivery fee', amountPaise: delivery, taxable: true });
  }

  for (const rule of charges) {
    if (rule?.enabled === false) continue;
    const taxable = rule?.taxable !== false;
    let amount = 0;
    if (rule?.kind === 'PERCENT') {
      // A percentage is of the goods AFTER discount. Charging a platform fee on a value the
      // customer is not paying reads as a bug to anyone who checks the arithmetic.
      amount = applyBps(goodsNet, Math.max(0, Math.round(Number(rule.valueBps) || 0)));
    } else {
      amount = Math.max(0, Math.round(Number(rule.valuePaise) || 0));
    }
    if (amount <= 0) continue;
    lines.push({
      id: String(rule.id || rule.label),
      label: String(rule.label || 'Fee'),
      amountPaise: amount,
      taxable,
    });
  }

  const feesTotal = lines.reduce((s, l) => s + l.amountPaise, 0);
  const taxableFees = lines.reduce((s, l) => s + (l.taxable ? l.amountPaise : 0), 0);

  const taxOn = tax?.enabled !== false;
  const goodsRateBps = Math.max(0, Math.round(Number(tax?.goodsRateBps) || 0));
  const feeRateBps = Math.max(0, Math.round(Number(tax?.feeRateBps ?? 1800)));

  // Rounded per group rather than per line: two roundings, not N, so the printed total always
  // equals the printed parts added up. A bill that does not add up destroys trust faster than a
  // fee nobody likes.
  const taxOnGoods = taxOn ? applyBps(goodsNet, goodsRateBps) : 0;
  const taxOnFees = taxOn ? applyBps(taxableFees, feeRateBps) : 0;
  const taxTotal = taxOnGoods + taxOnFees;

  const total = goodsNet + feesTotal + taxTotal;

  return {
    subtotalPaise: subtotal,
    discountPaise: discount,
    deliveryChargePaise: delivery,
    /** Every fee line in display order, delivery first. */
    chargeLines: lines,
    chargesTotalPaise: feesTotal,
    taxLabel: String(tax?.label || 'GST'),
    taxPaise: taxTotal,
    taxBreakdown: { goodsPaise: taxOnGoods, feesPaise: taxOnFees, goodsRateBps, feeRateBps },
    totalPaise: total,
  };
}

/** The shape stored on an order, so a bill printed next year shows what was actually charged. */
export const breakdownSnapshot = (b) => ({
  lines: b.chargeLines.map((l) => ({ label: l.label, amountPaise: l.amountPaise })),
  taxLabel: b.taxLabel,
  taxPaise: b.taxPaise,
  taxBreakdown: b.taxBreakdown,
});

const whole = (v) => Math.max(0, Math.round(Number(v) || 0));

/**
 * The rates a tax figure was worked out at, in the shape the apps print beside it ("GST 18% on
 * fees"). Null when no tax was charged, or when the order did not record how it split.
 */
export const taxRatesOf = (taxPaise, tb) =>
  Number(taxPaise) > 0 && tb
    ? {
        goodsBps: whole(tb.goodsRateBps),
        feeBps: whole(tb.feeRateBps),
        goodsPaise: String(whole(tb.goodsPaise)),
        feesPaise: String(whole(tb.feesPaise)),
      }
    : null;

/**
 * The bill of an order that already exists, as every screen and document should print it: the
 * app's order page, the invoice, the console. One function, so they cannot disagree.
 *
 * The lines come from the order's own snapshot — never from today's settings. Delivery, when it was
 * charged, is the first of them.
 *
 * An order can lack a snapshot: it predates fees, or it was placed while the snapshot was computed
 * but never written to the database (which is how bills came to show a total ₹100 above the
 * subtotal with nothing in between). Whatever part of the total the known lines do not account for
 * is then printed as ONE line rather than left out. A bill that does not add up is worse than a
 * bill that admits it cannot split a figure.
 */
export function orderBill(order) {
  const subtotal = whole(order?.subtotalPaise);
  const discount = Math.min(subtotal, whole(order?.couponDiscountPaise));
  const total = whole(order?.totalPaise);
  const snap =
    order?.chargeBreakdown && Array.isArray(order.chargeBreakdown.lines)
      ? order.chargeBreakdown
      : null;

  /** @type {{label:string, amountPaise:number, unitemised?:boolean}[]} */
  let lines = [];
  let taxPaise = 0;
  if (snap) {
    lines = snap.lines
      .map((l) => ({ label: String(l?.label || 'Fee'), amountPaise: whole(l?.amountPaise) }))
      .filter((l) => l.amountPaise > 0);
    taxPaise = whole(snap.taxPaise ?? order.taxPaise);
  } else {
    const delivery = whole(order?.deliveryChargePaise);
    if (delivery > 0) lines = [{ label: 'Delivery fee', amountPaise: delivery }];
    taxPaise = whole(order?.taxPaise);
  }

  const explained = subtotal - discount + lines.reduce((s, l) => s + l.amountPaise, 0) + taxPaise;
  const rest = total - explained;
  if (rest > 0) lines.push({ label: 'Fees and taxes', amountPaise: rest, unitemised: true });

  const tb = snap?.taxBreakdown || null;
  return {
    lines,
    taxLabel: String(snap?.taxLabel || 'GST'),
    taxPaise,
    /** How the tax splits between the goods and the fees, when the order recorded it. */
    taxBreakdown: tb
      ? {
          goodsPaise: whole(tb.goodsPaise),
          feesPaise: whole(tb.feesPaise),
          goodsRateBps: whole(tb.goodsRateBps),
          feeRateBps: whole(tb.feeRateBps),
        }
      : null,
    itemised: rest <= 0,
  };
}

/**
 * Recover the snapshot of an order that was saved without one.
 *
 * Only when it can be shown to be right: the saved fee and tax settings, applied to this order's
 * own subtotal, coupon and delivery charge, must give this order's own total to the paisa. Then the
 * lines are the ones the customer was quoted. If the settings have changed since, the totals differ,
 * nothing is recovered, and the order keeps its single "Fees and taxes" line.
 *
 * Marked `reconstructed` so a recovered bill can always be told from one written at the time.
 */
export function reconstructSnapshot(order, { charges = [], tax = {} } = {}) {
  if (order?.chargeBreakdown) return null;
  const total = whole(order?.totalPaise);
  const b = priceBreakdown({
    subtotalPaise: order?.subtotalPaise,
    discountPaise: order?.couponDiscountPaise,
    deliveryChargePaise: order?.deliveryChargePaise,
    charges,
    tax,
  });
  if (b.totalPaise !== total) return null;
  // Nothing beyond the goods and the delivery charge: the bill already adds up without a snapshot.
  if (b.chargesTotalPaise - b.deliveryChargePaise + b.taxPaise <= 0) return null;
  return { ...breakdownSnapshot(b), reconstructed: true };
}
