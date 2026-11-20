/** Review #24 / #32 (21 Nov 2026): IPv6 counts per /64, and paid calls have a daily ceiling. */
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
vi.mock('../src/lib/sentry.js', () => ({ reportError: vi.fn(), sentryEnabled: false }));
const { ipBucket } = await import('../src/lib/edge.js');
const { takeDaily, dailyUsage, __resetSpend } = await import('../src/lib/spend-cap.js');
const { reportError } = await import('../src/lib/sentry.js');

describe('ipBucket', () => {
  it('two addresses in the same /64 share one bucket', () => {
    expect(ipBucket('2401:4900:1c2a:5d10:1111:2222:3333:4444')).toBe(
      ipBucket('2401:4900:1c2a:5d10:aaaa:bbbb:cccc:dddd'),
    );
    expect(ipBucket('2401:4900:1c2a:5d10::1')).toBe('2401:4900:1c2a:5d10::/64');
  });
  it('different /64s and IPv4 stay apart; IPv4 written as IPv6 is IPv4', () => {
    expect(ipBucket('2401:4900:1c2a:5d11::1')).not.toBe(ipBucket('2401:4900:1c2a:5d10::1'));
    expect(ipBucket('49.37.1.2')).toBe('49.37.1.2');
    expect(ipBucket('::ffff:49.37.1.2')).toBe('49.37.1.2');
    expect(ipBucket('2401:4900::5d10:1')).toBe('2401:4900:0:0::/64');
  });
});

describe('daily ceilings', () => {
  afterEach(() => {
    delete process.env.DAILY_OTP_SEND_CAP;
    __resetSpend();
  });
  it('refuses past the ceiling and alerts once at 80%', () => {
    process.env.DAILY_OTP_SEND_CAP = '10';
    const results = Array.from({ length: 12 }, () => takeDaily('otp'));
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(results.slice(10)).toEqual([false, false]);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(dailyUsage().otp).toEqual({ used: 10, cap: 10 });
  });
});
