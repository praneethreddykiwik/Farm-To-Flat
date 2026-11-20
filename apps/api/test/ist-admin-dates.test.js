/**
 * Admin "today" and the referral month are IST, not UTC (review #19, 21 Nov 2026). The boundary
 * that matters is 00:00–05:30 IST, when the UTC date is still the day before.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
const { istMonthOf, todayISO } = await import('../src/lib/dates.js');
const { orderAdmin } = await import('../src/serialize.js');

afterEach(() => vi.useRealTimers());

describe('IST admin dates', () => {
  it('istMonthOf puts 00:30 IST on 1 Nov into November, not October', () => {
    // 31 Oct 19:00 UTC = 1 Nov 00:30 IST.
    expect(istMonthOf('2026-10-31T19:00:00.000Z')).toBe('2026-11');
    // 31 Oct 18:00 UTC = 31 Oct 23:30 IST — still October.
    expect(istMonthOf('2026-10-31T18:00:00.000Z')).toBe('2026-10');
    expect(istMonthOf(undefined)).toBe('');
    expect(istMonthOf('not a date')).toBe('');
  });

  it("orderAdmin marks yesterday's open order stale just after IST midnight", () => {
    // 20 Nov 19:00 UTC = 21 Nov 00:30 IST. The UTC date is still the 20th.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T19:00:00.000Z'));
    expect(todayISO()).toBe('2026-11-21');
    const order = {
      id: 'o1',
      orderNumber: 'F-1',
      status: 'CONFIRMED',
      items: [],
      subtotalPaise: 0,
      totalPaise: 0,
      deliveryDate: '2026-11-20',
      window: 'MORNING',
      createdAt: '2026-11-19T10:00:00.000Z',
    };
    expect(orderAdmin(order).stale).toBe(true);
    // Delivery today (IST) is not stale.
    expect(orderAdmin({ ...order, deliveryDate: '2026-11-21' }).stale).toBe(false);
  });
});
