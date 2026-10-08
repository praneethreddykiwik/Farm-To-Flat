import { describe, expect, it } from 'vitest';

/**
 * The buy list is per RUN.
 *
 * On live data, defaulting to every date at once summed 28 orders across 13 delivery dates going
 * back three weeks, against 3 orders for the actual next run — a buy list roughly nine times too
 * large, and plausible enough that nobody would question it at the market.
 *
 * resolveDate is the whole fix, so it is tested on its own rather than through the route: it is
 * pure, and what matters is which day it lands on, not how the response is shaped.
 */
import { resolveDate } from '../src/routes/admin/procurement.js';

const DATES = ['2026-09-14', '2026-09-22', '2026-10-06', '2026-10-08', '2026-10-11'];

describe('which run the buy list is for', () => {
  it('defaults to the next delivery date that has not passed', () => {
    expect(resolveDate({}, DATES, '2026-10-07')).toBe('2026-10-08');
  });

  it('counts today as the next run — you still have to buy for it', () => {
    expect(resolveDate({}, DATES, '2026-10-08')).toBe('2026-10-08');
  });

  it('never silently includes three weeks of stale orders', () => {
    expect(resolveDate({}, DATES, '2026-10-07')).not.toBe('all');
  });

  it('falls back to the latest date when every run is in the past', () => {
    expect(resolveDate({}, DATES, '2026-12-01')).toBe('2026-10-11');
  });

  it('falls back to today when there is nothing open at all', () => {
    expect(resolveDate({}, [], '2026-10-07')).toBe('2026-10-07');
  });

  it('honours an explicitly chosen date', () => {
    expect(resolveDate({ date: '2026-09-22' }, DATES, '2026-10-07')).toBe('2026-09-22');
  });

  it('still allows every date at once, but only when asked for by name', () => {
    expect(resolveDate({ date: 'all' }, DATES, '2026-10-07')).toBe('all');
  });
});
