/**
 * Order invoice (PDF), generated from the order's own stored snapshot so a bill printed next year
 * shows exactly what was charged. Everything the invoice needs about the buyer and the bill already
 * lives on the order (items, per-line prices, the charge/tax breakdown snapshot, the delivery
 * address, the mobile, the payment method and timestamps). The only thing that comes from
 * configuration is the SELLER's own identity, read from the environment and rendered only where set
 * — so nothing placeholder is ever printed.
 *
 * Amounts are written "Rs." rather than the ₹ glyph on purpose: the built-in Helvetica font has no
 * rupee sign, and "Rs." renders correctly everywhere without embedding a Unicode font.
 */
import PDFDocument from 'pdfkit';

/** Seller identity for the invoice header. Fill these as env vars on the API (owner action). */
export function sellerDetails() {
  const pick = (v) => (v && String(v).trim() ? String(v).trim() : null);
  return {
    legalName: pick(process.env.SELLER_LEGAL_NAME) || 'Fooducia',
    address: pick(process.env.SELLER_ADDRESS),
    gstin: pick(process.env.SELLER_GSTIN),
    fssai: pick(process.env.SELLER_FSSAI),
    email: pick(process.env.SELLER_EMAIL) || pick(process.env.SUPPORT_EMAIL),
    phone: pick(process.env.SELLER_PHONE),
  };
}

const rs = (paise) =>
  `Rs. ${(Number(paise || 0) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const dateStr = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** A stable, human invoice number derived from the order number. */
export const invoiceNumberOf = (order) => `INV-${order?.orderNumber || ''}`;

/**
 * Render the order to a PDF and resolve a Buffer. Pure in-memory; no file is written on the server.
 * @param {any} order the RAW order (from store.getOrder), which carries the full snapshot.
 * @returns {Promise<Buffer>}
 */
export function buildInvoicePdf(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const seller = sellerDetails();
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const ink = '#16261b';
    const mut = '#6b7a70';
    const line = '#e2e7df';

    // ── header ────────────────────────────────────────────────────────────────
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(22).text(seller.legalName, left, 48);
    doc.font('Helvetica').fontSize(9.5).fillColor(mut);
    const sellerLines = [
      seller.address,
      seller.gstin ? `GSTIN: ${seller.gstin}` : null,
      seller.fssai ? `FSSAI: ${seller.fssai}` : null,
      [seller.email, seller.phone].filter(Boolean).join('  ·  ') || null,
    ].filter(Boolean);
    if (sellerLines.length) doc.text(sellerLines.join('\n'), left, 76, { width: width * 0.6 });

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor(ink)
      .text('TAX INVOICE', left, 50, { width, align: 'right' });
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(mut)
      .text(
        `Invoice no: ${invoiceNumberOf(order)}\nDate: ${dateStr(order.createdAt)}\nStatus: ${String(
          order.status || '',
        ).replace(/_/g, ' ')}`,
        left,
        74,
        { width, align: 'right' },
      );

    let y = 150;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(line).lineWidth(1).stroke();
    y += 16;

    // ── bill to ─────────────────────────────────────────────────────────────
    const a = order.address || {};
    const addrLine = [a.block, a.flat].filter(Boolean).join(' · ');
    const buyerLines = [
      order.customerName || 'Customer',
      order.mobile ? `+91 ${order.mobile}` : null,
      [addrLine, a.communityName, a.area].filter(Boolean).join(', ') || null,
      a.landmark || null,
    ].filter(Boolean);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(mut).text('BILL TO', left, y);
    doc
      .font('Helvetica')
      .fontSize(10.5)
      .fillColor(ink)
      .text(buyerLines.join('\n'), left, y + 15, { width: width * 0.55 });

    // order meta on the right
    doc.font('Helvetica-Bold').fontSize(10).fillColor(mut).text('ORDER', left, y, {
      width,
      align: 'right',
    });
    doc
      .font('Helvetica')
      .fontSize(10.5)
      .fillColor(ink)
      .text(
        `${order.orderNumber}\nPayment: ${order.paymentMethod || 'PREPAID'}\nDelivery: ${dateStr(
          order.deliveryDate,
        )}`,
        left,
        y + 15,
        { width, align: 'right' },
      );

    y += 15 + Math.max(buyerLines.length, 3) * 14 + 18;

    // ── items table ───────────────────────────────────────────────────────────
    const cols = {
      idx: left,
      name: left + 26,
      qty: left + width * 0.55,
      rate: left + width * 0.72,
      amt: right,
    };
    doc.font('Helvetica-Bold').fontSize(9).fillColor(mut);
    doc.text('#', cols.idx, y);
    doc.text('ITEM', cols.name, y);
    doc.text('QTY', cols.qty, y, { width: 60 });
    doc.text('RATE', cols.rate, y, { width: 70 });
    doc.text('AMOUNT', cols.rate, y, { width: cols.amt - cols.rate, align: 'right' });
    y += 14;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(line).stroke();
    y += 8;

    const items = Array.isArray(order.items) ? order.items : [];
    doc.font('Helvetica').fontSize(10).fillColor(ink);
    items.forEach((it, i) => {
      if (y > doc.page.height - 160) {
        doc.addPage();
        y = 60;
      }
      const q = Number(it.quantity);
      const qty = Number.isFinite(q)
        ? q % 1 === 0
          ? String(q)
          : q.toFixed(3).replace(/0+$/, '')
        : '';
      const unit = it.unit ? ` ${it.unit}` : '';
      doc.fillColor(mut).text(String(i + 1), cols.idx, y);
      doc.fillColor(ink).text(it.name || 'Item', cols.name, y, { width: cols.qty - cols.name - 8 });
      const rowH = doc.heightOfString(it.name || 'Item', { width: cols.qty - cols.name - 8 });
      doc.text(`${qty}${unit}`, cols.qty, y, { width: 70 });
      doc.text(rs(it.unitPricePaise), cols.rate, y, { width: 70 });
      doc.text(rs(it.lineTotalPaise), cols.rate, y, {
        width: cols.amt - cols.rate,
        align: 'right',
      });
      y += Math.max(16, rowH + 6);
    });

    doc.moveTo(left, y).lineTo(right, y).strokeColor(line).stroke();
    y += 12;

    // ── summary ────────────────────────────────────────────────────────────────
    const sumX = left + width * 0.5;
    const sumRow = (label, value, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10.5);
      doc.fillColor(bold ? ink : mut).text(label, sumX, y, { width: (right - sumX) * 0.55 });
      doc.fillColor(ink).text(value, sumX, y, { width: right - sumX, align: 'right' });
      y += bold ? 20 : 16;
    };
    sumRow('Subtotal', rs(order.subtotalPaise));
    if (Number(order.couponDiscountPaise) > 0)
      sumRow(
        `Discount${order.couponCode ? ` (${order.couponCode})` : ''}`,
        `- ${rs(order.couponDiscountPaise)}`,
      );
    if (Number(order.deliveryChargePaise) > 0)
      sumRow('Delivery fee', rs(order.deliveryChargePaise));
    for (const l of order.chargeBreakdown?.lines || []) sumRow(l.label, rs(l.amountPaise));
    if (Number(order.taxPaise) > 0)
      sumRow(order.chargeBreakdown?.taxLabel || 'GST', rs(order.taxPaise));
    doc.moveTo(sumX, y).lineTo(right, y).strokeColor(line).stroke();
    y += 8;
    sumRow('Total', rs(order.totalPaise), true);

    // payment split
    if (Number(order.walletAppliedPaise) > 0)
      sumRow('Paid via wallet', rs(order.walletAppliedPaise));
    if (order.paymentMethod === 'COD')
      sumRow('Payable at door', rs(order.codDuePaise ?? order.totalPaise));
    else if (Number(order.gatewayAmountPaise) > 0)
      sumRow('Paid online', rs(order.gatewayAmountPaise));

    // ── footer ──────────────────────────────────────────────────────────────────
    const footY = doc.page.height - 90;
    doc.moveTo(left, footY).lineTo(right, footY).strokeColor(line).stroke();
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(mut)
      .text(
        'This is a computer-generated invoice and does not require a signature. ' +
          'For any query about this order, contact us at ' +
          (seller.email || 'support@fooducia.health') +
          '. Weighed items are billed on packed weight.',
        left,
        footY + 10,
        { width, align: 'center' },
      );

    doc.end();
  });
}
