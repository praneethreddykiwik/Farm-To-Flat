/** How the fee and tax rows of a bill read. */
import { describe, expect, it } from 'vitest';
import { orderBillRows, taxRowLabel } from '../lib/bill';

describe('the tax row', () => {
  it('says the rate when items and fees are taxed alike', () => {
    expect(
      taxRowLabel('GST', { goodsBps: 1800, feeBps: 1800, goodsPaise: '9000', feesPaise: '198' }),
    ).toBe('GST 18%');
  });

  it('says what the rate is on when only the fees are taxed', () => {
    expect(
      taxRowLabel('GST', { goodsBps: 0, feeBps: 1800, goodsPaise: '0', feesPaise: '198' }),
    ).toBe('GST 18% on fees');
  });

  it('gives both when they differ', () => {
    expect(
      taxRowLabel('GST', { goodsBps: 500, feeBps: 1800, goodsPaise: '2500', feesPaise: '198' }),
    ).toBe('GST 5% on items, 18% on fees');
  });

  it('is just the name when the rates are not known', () => {
    expect(taxRowLabel('GST', null)).toBe('GST');
    expect(taxRowLabel(undefined, null)).toBe('GST');
  });

  it('keeps a fractional rate readable', () => {
    expect(taxRowLabel('GST', { goodsBps: 0, feeBps: 250, goodsPaise: '0', feesPaise: '10' })).toBe(
      'GST 2.5% on fees',
    );
  });
});

describe('the rows of a placed order', () => {
  it('are every fee by its own name, then the tax', () => {
    const rows = orderBillRows({
      chargeLines: [
        { id: 'l0', label: 'Delivery fee', amountPaise: '3900' },
        { id: 'l1', label: 'Platform Fees', amountPaise: '1101' },
      ],
      taxLabel: 'GST',
      taxPaise: '9198',
      taxRates: { goodsBps: 1800, feeBps: 1800, goodsPaise: '9000', feesPaise: '198' },
    });
    expect(rows.map((r) => r.label)).toEqual(['Delivery fee', 'Platform Fees', 'GST 18%']);
    expect(rows.map((r) => r.paise)).toEqual(['3900', '1101', '9198']);
  });

  it('are none for an order that was only goods', () => {
    expect(orderBillRows({ chargeLines: [], taxPaise: '0' })).toEqual([]);
  });

  it('still show delivery for an order from a server that sends no lines', () => {
    expect(orderBillRows({ deliveryChargePaise: '3900' }).map((r) => r.label)).toEqual([
      'Delivery fee',
    ]);
    expect(orderBillRows({ deliveryChargePaise: '0' })).toEqual([]);
    expect(orderBillRows(null)).toEqual([]);
  });
});
