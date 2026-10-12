import { describe, expect, it } from 'vitest';

/**
 * Mocks must be opt-in, because the cost of getting this default wrong is invisible and large.
 *
 * It used to read `!== '0'`, so a build where the variable was merely ABSENT ran entirely on the
 * in-app mock server: a different catalogue, stock photographs instead of the real ones, three
 * communities instead of eight, payments that succeed without touching a bank. `eas update` reads
 * the EAS environment rather than the eas.json build profile, the variable was missing from that
 * environment, and so every over-the-air update shipped a fully mocked app to real testers — who
 * reported the mock data back as bugs.
 */
const useMocksFor = (value) => value === '1';

describe('the mocks switch', () => {
  it('is OFF when the variable is missing — the case that shipped a mocked app', () => {
    expect(useMocksFor(undefined)).toBe(false);
  });

  it('is OFF for "0"', () => {
    expect(useMocksFor('0')).toBe(false);
  });

  it('is OFF for an empty string, which is how a blank env var arrives', () => {
    expect(useMocksFor('')).toBe(false);
  });

  it('is ON only for an explicit "1"', () => {
    expect(useMocksFor('1')).toBe(true);
  });

  it('is OFF for anything else — "true", "yes", a typo', () => {
    for (const v of ['true', 'yes', 'TRUE', 'on', '2', 'mock']) expect(useMocksFor(v)).toBe(false);
  });
});
