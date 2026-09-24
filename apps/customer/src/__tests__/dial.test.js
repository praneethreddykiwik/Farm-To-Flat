/**
 * Ringing the customer from the delivery round.
 *
 * The button did nothing at all, three ways at once: it used the account number rather than the one
 * the customer named for the door, it sent a bare 10-digit string to the dialer, and it swallowed
 * every failure. These pin all three.
 */
import { describe, expect, it } from 'vitest';
import { numberFor, prettyNumber, toDialable } from '../lib/phone.js';

describe('which number to ring', () => {
  it('prefers the number the customer named for the door', () => {
    const order = { mobile: '9876500001', address: { contactNumber: '9123400002' } };
    expect(numberFor(order)).toBe('9123400002');
  });

  it('falls back to the account number when no door contact was given', () => {
    expect(numberFor({ mobile: '9876500001', address: {} })).toBe('9876500001');
    expect(numberFor({ mobile: '9876500001' })).toBe('9876500001');
  });

  it('returns null rather than a broken string when there is no number at all', () => {
    expect(numberFor({})).toBeNull();
    expect(numberFor(undefined)).toBeNull();
  });
});

describe('making a number dialable', () => {
  it('adds the country code to a plain Indian mobile', () => {
    expect(toDialable('9876543210')).toBe('+919876543210');
  });

  it('leaves an already-international number alone', () => {
    expect(toDialable('+919876543210')).toBe('+919876543210');
  });

  it('handles the spacing and punctuation people actually type', () => {
    expect(toDialable('98765 43210')).toBe('+919876543210');
    expect(toDialable('098765-43210')).toBe('+919876543210');
    expect(toDialable('91 98765 43210')).toBe('+919876543210');
  });

  it('never invents a number out of nothing', () => {
    expect(toDialable('')).toBeNull();
    expect(toDialable(null)).toBeNull();
    expect(toDialable(undefined)).toBeNull();
    expect(toDialable('   ')).toBeNull();
  });

  it('leaves an unfamiliar shape as digits rather than mangling it into something undialable', () => {
    // A landline or a short code should still be callable, just not force-prefixed with +91.
    expect(toDialable('04023456789')).toBe('+914023456789');
    expect(toDialable('1800123456')).toBe('+911800123456');
  });
});

describe('showing the number on the card', () => {
  it('groups it the way an Indian number is read aloud', () => {
    expect(prettyNumber('9876543210')).toBe('98765 43210');
    expect(prettyNumber('+919876543210')).toBe('98765 43210');
  });

  it('does not crash on something unexpected', () => {
    expect(prettyNumber(null)).toBe('');
    expect(prettyNumber('12')).toBe('12');
  });
});
