import { describe, expect, it } from 'vitest';
import { badgeLabel, badgeWidth } from '../lib/countBadge';

describe('basket count badge', () => {
  it('shows the count, and 99+ beyond two digits', () => {
    expect(badgeLabel(3)).toBe('3');
    expect(badgeLabel(13)).toBe('13');
    expect(badgeLabel(99)).toBe('99');
    expect(badgeLabel(100)).toBe('99+');
    expect(badgeLabel(undefined)).toBe('0');
  });
  it('is a circle for one digit and widens by a figure for each one after', () => {
    expect(badgeWidth(7)).toBe(18);
    expect(badgeWidth(13)).toBe(25);
    expect(badgeWidth(58)).toBe(25);
    expect(badgeWidth(120)).toBe(32);
  });
});
