/**
 * The limiter is the only thing between the OTP flow and an account-takeover grind: verifyOtp
 * allows three guesses, but a fresh request resets that counter, so the request side has to be
 * capped. These exercise the middleware directly with `enabled: true`, since it is deliberately
 * inert under NODE_ENV=test.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ipOf, rateLimit, resetRateLimits } from '../src/lib/rate-limit.js';

const run = (mw, req) =>
  new Promise((resolve) => {
    const res = { setHeader: () => {} };
    mw(req, res, (err) => resolve(err));
  });

describe('rateLimit', () => {
  beforeEach(() => resetRateLimits());

  it('allows up to max, then refuses with 429 and a retry hint', async () => {
    const mw = rateLimit({ windowMs: 60_000, max: 3, key: () => 'k', enabled: true });
    for (let i = 0; i < 3; i++) expect(await run(mw, {})).toBeUndefined();

    const err = await run(mw, {});
    expect(err?.status).toBe(429);
    expect(err?.code).toBe('RATE_LIMITED');
    expect(Number(err?.details?.retryAfterSeconds)).toBeGreaterThan(0);
  });

  it('counts each key separately, so one attacker cannot lock out everyone', async () => {
    const mw = rateLimit({
      windowMs: 60_000,
      max: 1,
      key: (req) => req.body.mobile,
      enabled: true,
    });
    expect(await run(mw, { body: { mobile: '9000000001' } })).toBeUndefined();
    expect((await run(mw, { body: { mobile: '9000000001' } }))?.status).toBe(429);
    // a different number is untouched
    expect(await run(mw, { body: { mobile: '9000000002' } })).toBeUndefined();
  });

  it('lets the window expire', async () => {
    const mw = rateLimit({ windowMs: 15, max: 1, key: () => 'k', enabled: true });
    expect(await run(mw, {})).toBeUndefined();
    expect((await run(mw, {}))?.status).toBe(429);
    await new Promise((r) => setTimeout(r, 25));
    expect(await run(mw, {})).toBeUndefined();
  });

  it('never blocks a request whose key cannot be computed', async () => {
    const mw = rateLimit({
      windowMs: 60_000,
      max: 0,
      key: (req) => req.body.mobile, // throws: no body
      enabled: true,
    });
    expect(await run(mw, {})).toBeUndefined();
  });

  it('ipOf falls back when express gives no ip', () => {
    expect(ipOf({ ip: '1.2.3.4' })).toBe('1.2.3.4');
    expect(ipOf({ socket: { remoteAddress: '5.6.7.8' } })).toBe('5.6.7.8');
    expect(ipOf({})).toBe('unknown');
  });
});
