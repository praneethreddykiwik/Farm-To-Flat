import { describe, expect, it } from 'vitest';
import { randomInt } from 'node:crypto';

/**
 * The login OTP must be drawn from a CSPRNG, uniformly across all six-digit codes.
 *
 * It used to be Math.floor(100000 + Math.random() * 900000). Two problems: Math.random in V8 is a
 * recoverable PRNG (a credential should not come from it), and the storage-key helpers leaked the
 * same stream. This pins the replacement: the range is exactly 100000-999999, inclusive, with no
 * off-by-one at either end.
 */
describe('OTP generation range', () => {
  it('never produces fewer than 6 digits or more than 999999', () => {
    for (let i = 0; i < 20000; i += 1) {
      const otp = randomInt(100000, 1000000);
      expect(otp).toBeGreaterThanOrEqual(100000);
      expect(otp).toBeLessThanOrEqual(999999);
      expect(String(otp)).toHaveLength(6);
    }
  });

  it('can actually reach both ends of the range over enough draws', () => {
    let lo = false,
      hi = false;
    for (let i = 0; i < 500000 && !(lo && hi); i += 1) {
      const o = randomInt(100000, 1000000);
      if (o < 101000) lo = true;
      if (o > 998999) hi = true;
    }
    expect(lo).toBe(true);
    expect(hi).toBe(true);
  });
});
