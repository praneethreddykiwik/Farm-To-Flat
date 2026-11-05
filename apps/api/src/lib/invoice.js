/**
 * Order invoice (PDF), generated from the order's own stored snapshot so a bill printed next year
 * shows exactly what was charged. Everything the invoice needs about the buyer and the bill already
 * lives on the order (items, per-line prices, the charge/tax breakdown snapshot, the delivery
 * address, the mobile, the payment method and timestamps). The only thing that comes from
 * configuration is the SELLER's own identity, read from the environment and rendered only where set
 * — so nothing placeholder is ever printed.
 *
 * Design: a modern, Blinkit-style receipt — the Fooducia logo, info cards, a zebra item table, a
 * highlighted total band and a "you saved" callout, in the brand green. Amounts are written "Rs."
 * rather than the ₹ glyph on purpose: pdfkit's built-in Helvetica has no rupee sign, and "Rs."
 * renders everywhere without embedding a Unicode font.
 */
import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Brand palette (matches the app / landing).
const BRAND = '#1E7A4C';
const BRAND_DEEP = '#135A37';
const BRAND_SOFT = '#E8F4ED';
const INK = '#15261c';
const MUT = '#6b7a70';
const LINE = '#e6ebe4';
const ZEBRA = '#f6f8f5';
const GREEN_TEXT = '#1a8a4f';

// Load the logo once; fall back to a text wordmark if it is missing so the invoice never fails.
let LOGO = null;
try {
  LOGO = readFileSync(fileURLToPath(new URL('../assets/fooducia-logo.png', import.meta.url)));
} catch {
  LOGO = null;
}

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

const qtyStr = (q, unit) => {
  const n = Number(q);
  const num = Number.isFinite(n) ? (n % 1 === 0 ? String(n) : n.toFixed(3).replace(/0+$/, '')) : '';
  return `${num}${unit ? ` ${unit}` : ''}`;
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
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const seller = sellerDetails();
    const L = doc.page.margins.left;
    const R = doc.page.width - doc.page.margins.right;
    const W = R - L;

    // ── header: logo (left) + Tax Invoice (right) ─────────────────────────────
    if (LOGO) {
      try {
        doc.image(LOGO, L, 40, { height: 50 });
      } catch {
        doc.font('Helvetica-Bold').fontSize(24).fillColor(BRAND).text('Fooducia', L, 48);
      }
    } else {
      doc.font('Helvetica-Bold').fontSize(24).fillColor(BRAND).text('Fooducia', L, 48);
    }

    doc.font('Helvetica-Bold').fontSize(18).fillColor(BRAND_DEEP).text('TAX INVOICE', L, 44, {
      width: W,
      align: 'right',
    });
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(MUT)
      .text(
        `Invoice No   ${invoiceNumberOf(order)}\nInvoice Date   ${dateStr(order.createdAt)}`,
        L,
        70,
        { width: W, align: 'right', lineGap: 2 },
      );

    // seller identity just under the logo
    const sellerLines = [
      seller.legalName && seller.legalName !== 'Fooducia' ? `Sold by ${seller.legalName}` : null,
      seller.address,
      [
        seller.gstin ? `GSTIN: ${seller.gstin}` : null,
        seller.fssai ? `FSSAI: ${seller.fssai}` : null,
      ]
        .filter(Boolean)
        .join('    '),
    ].filter(Boolean);
    if (sellerLines.length) {
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(MUT)
        .text(sellerLines.join('\n'), L, 98, { width: W * 0.62, lineGap: 1.5 });
    }

    let y = 100 + Math.max(sellerLines.length, 1) * 12 + 12;
    doc.rect(L, y, W, 2).fill(BRAND);
    y += 18;

    // ── info cards: billed to + order ─────────────────────────────────────────
    const a = order.address || {};
    const addrLine = [a.block, a.flat].filter(Boolean).join(' · ');
    const buyer = [
      order.customerName || 'Customer',
      order.mobile ? `+91 ${order.mobile}` : null,
      [addrLine, a.communityName, a.area].filter(Boolean).join(', ') || null,
      a.landmark || null,
    ].filter(Boolean);
    const orderRows = [
      ['Order No', order.orderNumber || ''],
      [
        'Payment',
        (order.paymentMethod || 'PREPAID') === 'COD' ? 'Cash on delivery' : 'Paid online',
      ],
      ['Order date', dateStr(order.createdAt)],
      ['Delivery', dateStr(order.deliveryDate)],
      ['Status', String(order.status || '').replace(/_/g, ' ')],
    ];
    const gap = 14;
    const cw = (W - gap) / 2;
    const cardH = 24 + Math.max(buyer.length, orderRows.length) * 15 + 12;

    const card = (x, title, render) => {
      doc.roundedRect(x, y, cw, cardH, 10).fillAndStroke('#fbfdfb', LINE);
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(BRAND)
        .text(title, x + 14, y + 12, { characterSpacing: 0.6 });
      render(x + 14, y + 28);
    };
    card(L, 'BILLED TO', (tx, ty) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(10.5)
        .fillColor(INK)
        .text(buyer[0], tx, ty, {
          width: cw - 28,
        });
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(MUT)
        .text(buyer.slice(1).join('\n'), tx, ty + 15, { width: cw - 28, lineGap: 2 });
    });
    card(L + cw + gap, 'ORDER DETAILS', (tx, ty) => {
      doc.font('Helvetica').fontSize(9.5);
      let ry = ty;
      for (const [k, v] of orderRows) {
        doc.fillColor(MUT).text(k, tx, ry, { width: cw * 0.4, lineBreak: false });
        // Right edge sits 14pt inside the card border — matching the 14pt left padding — so the
        // values line up in a clean column instead of butting against the card edge.
        doc
          .fillColor(INK)
          .text(v, tx + cw * 0.4, ry, { width: cw * 0.6 - 28, align: 'right', lineBreak: false });
        ry += 15;
      }
    });
    y += cardH + 22;

    // ── items table ───────────────────────────────────────────────────────────
    const colIdx = L + 12;
    const colName = L + 34;
    const colQty = L + W * 0.52;
    const colRate = L + W * 0.68;
    const colAmtR = R - 12;
    const headH = 22;
    doc.roundedRect(L, y, W, headH, 6).fill(BRAND_SOFT);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND_DEEP);
    const hy = y + 7;
    doc.text('#', colIdx, hy);
    doc.text('ITEM', colName, hy);
    doc.text('QTY', colQty, hy, { width: W * 0.14 });
    doc.text('RATE', colRate, hy, { width: colAmtR - colRate - 60, align: 'left' });
    doc.text('AMOUNT', colRate, hy, { width: colAmtR - colRate, align: 'right' });
    y += headH + 2;

    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach((it, i) => {
      if (y > doc.page.height - 220) {
        doc.addPage();
        y = 50;
      }
      const name = it.name || 'Item';
      const nameW = colQty - colName - 10;
      const rowH = Math.max(20, doc.heightOfString(name, { width: nameW, fontSize: 10 }) + 10);
      if (i % 2 === 1) doc.rect(L, y, W, rowH).fill(ZEBRA);
      const ty = y + (rowH - 11) / 2;
      doc.font('Helvetica').fontSize(10);
      doc.fillColor(MUT).text(String(i + 1), colIdx, ty);
      doc.fillColor(INK).text(name, colName, ty, { width: nameW });
      doc.fillColor(MUT).text(qtyStr(it.quantity, it.unit), colQty, ty, { width: W * 0.14 });
      doc.fillColor(MUT).text(rs(it.unitPricePaise), colRate, ty, {
        width: colAmtR - colRate - 60,
      });
      doc.fillColor(INK).text(rs(it.lineTotalPaise), colRate, ty, {
        width: colAmtR - colRate,
        align: 'right',
      });
      y += rowH;
    });
    doc.moveTo(L, y).lineTo(R, y).strokeColor(LINE).lineWidth(1).stroke();
    y += 16;

    // ── summary (right-aligned block) ─────────────────────────────────────────
    const sumX = L + W * 0.5;
    const sumRow = (label, value, color = MUT, valColor = INK) => {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(color)
        .text(label, sumX, y, {
          width: (R - sumX) * 0.55,
        });
      doc.fillColor(valColor).text(value, sumX, y, { width: R - sumX, align: 'right' });
      y += 17;
    };
    sumRow('Item subtotal', rs(order.subtotalPaise));
    const saved = Number(order.couponDiscountPaise) || 0;
    if (saved > 0)
      sumRow(
        `Discount${order.couponCode ? ` (${order.couponCode})` : ''}`,
        `- ${rs(saved)}`,
        GREEN_TEXT,
        GREEN_TEXT,
      );
    if (Number(order.deliveryChargePaise) > 0)
      sumRow('Delivery fee', rs(order.deliveryChargePaise));
    for (const l of order.chargeBreakdown?.lines || []) sumRow(l.label, rs(l.amountPaise));
    if (Number(order.taxPaise) > 0)
      sumRow(order.chargeBreakdown?.taxLabel || 'GST', rs(order.taxPaise));

    // total band
    y += 4;
    const bandH = 34;
    doc.roundedRect(sumX, y, R - sumX, bandH, 8).fill(BRAND);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#ffffff')
      .text('Total', sumX + 14, y + 11, { width: (R - sumX) * 0.5 });
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#ffffff')
      .text(rs(order.totalPaise), sumX, y + 10, { width: R - sumX - 14, align: 'right' });
    y += bandH + 10;

    // payment split
    if (Number(order.walletAppliedPaise) > 0)
      sumRow('Paid via wallet', rs(order.walletAppliedPaise));
    if (order.paymentMethod === 'COD')
      sumRow('Payable at door', rs(order.codDuePaise ?? order.totalPaise), INK, INK);
    else if (Number(order.gatewayAmountPaise) > 0)
      sumRow('Paid online', rs(order.gatewayAmountPaise), INK, INK);

    // ── "you saved" callout (left side, Blinkit-style) ────────────────────────
    if (saved > 0) {
      const pillY = y - 2;
      const pillW = W * 0.46;
      doc.roundedRect(L, pillY, pillW, 30, 8).fill('#eafaf0');
      doc
        .font('Helvetica-Bold')
        .fontSize(10.5)
        .fillColor(GREEN_TEXT)
        .text(`You saved ${rs(saved)} on this order`, L + 14, pillY + 10, { width: pillW - 28 });
    }

    // ── footer ────────────────────────────────────────────────────────────────
    const footY = doc.page.height - 104;
    doc.moveTo(L, footY).lineTo(R, footY).strokeColor(LINE).lineWidth(1).stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(BRAND_DEEP)
      .text('Thank you for shopping fresh with Fooducia.', L, footY + 14, {
        width: W,
        align: 'center',
      });
    const contact = [seller.email || 'support@fooducia.health', seller.phone]
      .filter(Boolean)
      .join('  ·  ');
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUT)
      .text('Computer-generated invoice — no signature required.', L, footY + 32, {
        width: W,
        align: 'center',
      });
    doc.text(`Weighed items are billed on packed weight.   Questions? ${contact}`, L, footY + 44, {
      width: W,
      align: 'center',
    });

    doc.end();
  });
}
