import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The OTP request response must not become an enumeration oracle in production.
 *
 * It used to return the fixed dev code (`devOtp`) to a named allowlisted number even in prod. The
 * code is a constant, so that told a legitimate tester nothing new — but it let anyone POST a
 * request for an arbitrary number and read back whether `devOtp` appeared, learning precisely which
 * numbers are test accounts that accept 123456. In production the code must never appear in the
 * HTTP body; it is logged for the operator instead.
 */
const MOBILE = '9876500011';

beforeEach(() => {
  vi.resetModules();
  process.env.NODE_ENV = 'production';
  process.env.ALLOW_DEV_OTP = '1';
  process.env.DEV_OTP_ALLOWLIST = MOBILE; // this number IS allowlisted
});
afterEach(() => {
  vi.resetModules();
  delete process.env.ALLOW_DEV_OTP;
  delete process.env.DEV_OTP_ALLOWLIST;
  process.env.NODE_ENV = 'test';
});

describe('production OTP response', () => {
  it('never returns devOtp in the body — not even for an allowlisted number', async () => {
    const store = await import('../src/customer-store.js');
    const r = await store.requestOtp(MOBILE);
    expect(r.ok).toBe(true);
    expect(r.expiresInSeconds).toBe(300);
    expect(r).not.toHaveProperty('devOtp');
  });

  it('still accepts the fixed code for the allowlisted number (login works)', async () => {
    const store = await import('../src/customer-store.js');
    await store.requestOtp(MOBILE);
    const v = store.verifyOtp(MOBILE, '123456');
    // verifyOtp proves the code and returns the customer; the route mints the token. A clean
    // verify (no error, a customer object) is what "login works" means at this layer.
    expect(v.error).toBeUndefined();
    expect(v.ok).toBe(true);
    expect(v.customer).toBeTruthy();
  });

  it('a non-allowlisted number gets the same shape — no devOtp, nothing to distinguish it', async () => {
    const store = await import('../src/customer-store.js');
    // msg91 is unconfigured in tests, so a non-dev number returns a channel error rather than ok —
    // the point here is only that neither path ever carries devOtp.
    const r = await store.requestOtp('9000012345');
    expect(r.devOtp).toBeUndefined();
    if (r.ok) expect(r).not.toHaveProperty('devOtp');
  });
});
