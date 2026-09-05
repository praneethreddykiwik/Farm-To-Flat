import { describe, expect, it } from 'vitest';
import { applyBasisPoints, formatPaise, splitPaise, toPaise } from '../lib/money';

describe('money: integer paise in, rupees out', () => {
  it('parses the API string form and never floats', () => {
    expect(toPaise('123456')).toBe(123456);
    expect(toPaise(123456n)).toBe(123456);
    expect(toPaise(null)).toBe(0);
    expect(toPaise('abc')).toBe(0);
  });
  it('formats with Indian grouping and compact paise', () => {
    expect(formatPaise('50000')).toBe('₹500');
    expect(formatPaise('123456789')).toBe('₹12,34,567.89');
    expect(formatPaise('50', { compact: false })).toBe('₹0.50');
    expect(formatPaise(-2500)).toBe('−₹25');
    expect(formatPaise(2500, { sign: true })).toBe('+₹25');
  });
  it('splits for the rolling-digit component', () => {
    expect(splitPaise('125050')).toEqual({ symbol: '₹', whole: '1,250', frac: '.50' });
  });
  it('applies basis points with integer rounding', () => {
    expect(applyBasisPoints(50000, 1000)).toBe(5000); // 10% of ₹500
    expect(applyBasisPoints(3333, 500)).toBe(167);
  });
});
