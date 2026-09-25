/**
 * A code that is minted and never delivered must not look like a code that was sent.
 *
 * This is the bug testers hit: with ALLOW_DEV_OTP=1 and no allowlist every number took the fixed
 * code, so `deliverOtp` was never called — no WhatsApp went out however well MSG91 was configured —
 * and production deliberately withheld the code from the response. The API answered `{ ok: true }`,
 * the app said "Sent to +91 …", and six empty boxes sat there forever.
 */
import { describe, expect, it } from 'vitest';
import { devOtpAllowedFor } from '../src/customer-store.js';

const list = (...m) => new Set(m);

describe('who may use the fixed dev code', () => {
  it('lets anyone use it outside production — that is what dev is for', () => {
    expect(
      devOtpAllowedFor('9000000001', {
        isProd: false,
        allowDev: false,
        allowlist: list(),
        isStaff: false,
      }),
    ).toBe(true);
  });

  it('refuses it in production once the flag is off, staff included', () => {
    const ctx = { isProd: true, allowDev: false, allowlist: list(), isStaff: true };
    expect(devOtpAllowedFor('9000000001', ctx)).toBe(false);
  });

  it('is open to every number when the flag is on and nothing narrows it', () => {
    // The posture that made 123456 a public bypass — true for staff numbers too.
    const ctx = { isProd: true, allowDev: true, allowlist: list(), isStaff: true };
    expect(devOtpAllowedFor('9000000001', ctx)).toBe(true);
  });

  it('confines to the named numbers the moment an allowlist exists', () => {
    const ctx = { isProd: true, allowDev: true, allowlist: list('9848011111'), isStaff: false };
    expect(devOtpAllowedFor('9848011111', ctx)).toBe(true);
    // Not named — needs a real code, which is the whole point of naming anyone.
    expect(devOtpAllowedFor('9000000001', ctx)).toBe(false);
    expect(devOtpAllowedFor('9000000001', { ...ctx, isStaff: true })).toBe(false);
  });
});
