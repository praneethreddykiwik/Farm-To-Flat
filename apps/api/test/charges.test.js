import { describe, expect, it } from 'vitest';
import { priceBreakdown } from '../src/lib/charges.js';

const P = (rupees) => Math.round(rupees * 100);

describe('the bill', () => {
  it('is just the goods when nothing else is configured', () => {
    const b = priceBreakdown({ subtotalPaise: P(290) });
    expect(b.totalPaise).toBe(P(290));
    expect(b.chargeLines).toEqual([]);
    expect(b.taxPaise).toBe(0);
  });

  it('adds up: the printed total equals the printed parts', () => {
    const b = priceBreakdown({
      subtotalPaise: P(290),
      deliveryChargePaise: P(39),
      charges: [{ id: 'platform', label: 'Platform fee', kind: 'FLAT', valuePaise: P(14.99) }],
      tax: { enabled: true, goodsRateBps: 0, feeRateBps: 1800 },
    });
    const parts = b.subtotalPaise - b.discountPaise + b.chargesTotalPaise + b.taxPaise;
    expect(b.totalPaise).toBe(parts);
  });

  it('does not tax fresh produce, and does tax the fees', () => {
    // The whole reason there are two rates. 18% on a basket of vegetables would overcharge the
    // customer and collect tax we have no business collecting.
    const b = priceBreakdown({
      subtotalPaise: P(1000),
      deliveryChargePaise: P(100),
      tax: { goodsRateBps: 0, feeRateBps: 1800 },
    });
    expect(b.taxBreakdown.goodsPaise).toBe(0);
    expect(b.taxBreakdown.feesPaise).toBe(P(18));
    expect(b.totalPaise).toBe(P(1000) + P(100) + P(18));
  });

  it('taxes goods too once the operator sets a goods rate', () => {
    const b = priceBreakdown({ subtotalPaise: P(1000), tax: { goodsRateBps: 500 } });
    expect(b.taxBreakdown.goodsPaise).toBe(P(50));
  });

  it('rounds per group, not per line, so the total never drifts', () => {
    // Three lines that each round badly on their own.
    const b = priceBreakdown({
      subtotalPaise: 0,
      charges: [
        { id: 'a', label: 'A', kind: 'FLAT', valuePaise: 333 },
        { id: 'b', label: 'B', kind: 'FLAT', valuePaise: 333 },
        { id: 'c', label: 'C', kind: 'FLAT', valuePaise: 333 },
      ],
      tax: { feeRateBps: 1800 },
    });
    expect(b.taxPaise).toBe(Math.round((999 * 1800) / 10000)); // 180, not 60+60+60
    expect(b.totalPaise).toBe(999 + b.taxPaise);
  });

  it('charges a percentage fee on what the customer actually pays, not the pre-discount value', () => {
    const b = priceBreakdown({
      subtotalPaise: P(1000),
      discountPaise: P(200),
      charges: [{ id: 'plat', label: 'Platform fee', kind: 'PERCENT', valueBps: 500 }],
      tax: { enabled: false },
    });
    expect(b.chargesTotalPaise).toBe(P(40)); // 5% of 800, not of 1000
  });

  it('never lets a coupon make the basket negative', () => {
    const b = priceBreakdown({ subtotalPaise: P(100), discountPaise: P(500) });
    expect(b.discountPaise).toBe(P(100));
    expect(b.totalPaise).toBe(0);
  });

  it('skips a disabled charge entirely', () => {
    const b = priceBreakdown({
      subtotalPaise: P(100),
      charges: [{ id: 'x', label: 'X', kind: 'FLAT', valuePaise: P(50), enabled: false }],
    });
    expect(b.chargeLines).toEqual([]);
    expect(b.totalPaise).toBe(P(100));
  });

  it('honours a fee marked not taxable', () => {
    const b = priceBreakdown({
      subtotalPaise: 0,
      charges: [{ id: 'x', label: 'X', kind: 'FLAT', valuePaise: P(100), taxable: false }],
      tax: { feeRateBps: 1800 },
    });
    expect(b.taxPaise).toBe(0);
    expect(b.totalPaise).toBe(P(100));
  });

  it('drops a zero-value fee rather than printing a ₹0 line', () => {
    const b = priceBreakdown({
      subtotalPaise: P(100),
      charges: [{ id: 'x', label: 'X', kind: 'FLAT', valuePaise: 0 }],
    });
    expect(b.chargeLines).toEqual([]);
  });

  it('turns all tax off when the operator disables it', () => {
    const b = priceBreakdown({
      subtotalPaise: P(100),
      deliveryChargePaise: P(50),
      tax: { enabled: false, goodsRateBps: 500, feeRateBps: 1800 },
    });
    expect(b.taxPaise).toBe(0);
  });

  it('keeps delivery as the first line, so the bill reads in a fixed order', () => {
    const b = priceBreakdown({
      subtotalPaise: P(100),
      deliveryChargePaise: P(39),
      charges: [{ id: 'plat', label: 'Platform fee', kind: 'FLAT', valuePaise: P(15) }],
    });
    expect(b.chargeLines.map((l) => l.id)).toEqual(['delivery', 'plat']);
  });

  it('produces only integer paise — no float ever reaches a total', () => {
    const b = priceBreakdown({
      subtotalPaise: 29033,
      discountPaise: 1777,
      deliveryChargePaise: 3999,
      charges: [{ id: 'p', label: 'P', kind: 'PERCENT', valueBps: 237 }],
      tax: { goodsRateBps: 500, feeRateBps: 1800 },
    });
    for (const v of [
      b.subtotalPaise,
      b.discountPaise,
      b.chargesTotalPaise,
      b.taxPaise,
      b.totalPaise,
    ])
      expect(Number.isInteger(v)).toBe(true);
    for (const l of b.chargeLines) expect(Number.isInteger(l.amountPaise)).toBe(true);
  });
});
