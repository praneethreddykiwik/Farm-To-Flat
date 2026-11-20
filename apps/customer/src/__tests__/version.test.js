/** Review #45 (21 Nov 2026): which app versions the server's minimum retires. */
import { describe, expect, it } from 'vitest';
import { isBelow } from '../lib/version';

describe('isBelow', () => {
  it('compares x.y.z numerically', () => {
    expect(isBelow('0.2.0', '0.3.0')).toBe(true);
    expect(isBelow('0.10.0', '0.9.9')).toBe(false);
    expect(isBelow('1.0.0', '1.0.0')).toBe(false);
    expect(isBelow('0.2.0', '0.2.1')).toBe(true);
  });
  it('never blocks on something unreadable', () => {
    expect(isBelow('0.2.0', null)).toBe(false);
    expect(isBelow('dev', '0.3.0')).toBe(false);
  });
});
