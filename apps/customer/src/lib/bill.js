/**
 * The lines of a bill between the subtotal and the total: every fee the shop has set, and the tax.
 *
 * The server sends them ready to print — labels as the owner typed them in the console, amounts as
 * they were charged — for a basket being priced and for an order already placed alike. Nothing here
 * works a figure out; it only decides how the rows read.
 */

const pct = (bps) => `${Number((Number(bps) / 100).toFixed(2))}%`;

/**
 * The tax row's label, saying what the figure is a percentage of:
 * "GST 18%", "GST 18% on fees", "GST 5% on items, 18% on fees".
 * @param {string} [label]
 * @param {{goodsBps?:number, feeBps?:number, goodsPaise?:string|number, feesPaise?:string|number}|null} [rates]
 */
export function taxRowLabel(label, rates) {
  const name = label || 'GST';
  if (!rates) return name;
  const goods = Number(rates.goodsPaise) > 0;
  const fees = Number(rates.feesPaise) > 0;
  if (goods && fees)
    return Number(rates.goodsBps) === Number(rates.feeBps)
      ? `${name} ${pct(rates.goodsBps)}`
      : `${name} ${pct(rates.goodsBps)} on items, ${pct(rates.feeBps)} on fees`;
  if (goods) return `${name} ${pct(rates.goodsBps)} on items`;
  if (fees) return `${name} ${pct(rates.feeBps)} on fees`;
  return name;
}

/**
 * A placed order's fee and tax rows, in the order to print them. Delivery, when it was charged, is
 * one of the fee lines.
 * @param {any} order
 * @returns {{ key: string, label: string, paise: string|number }[]}
 */
export function orderBillRows(order) {
  if (!order) return [];
  let lines = order.chargeLines;
  // An order from a server that does not send the lines yet: delivery is the one fee it does name.
  if (!Array.isArray(lines))
    lines =
      Number(order.deliveryChargePaise) > 0
        ? [{ id: 'delivery', label: 'Delivery fee', amountPaise: order.deliveryChargePaise }]
        : [];
  const rows = lines
    .filter((l) => Number(l?.amountPaise) > 0)
    .map((l, i) => ({ key: String(l.id || `l${i}`), label: l.label, paise: l.amountPaise }));
  if (Number(order.taxPaise) > 0)
    rows.push({
      key: 'tax',
      label: taxRowLabel(order.taxLabel, order.taxRates),
      paise: order.taxPaise,
    });
  return rows;
}
