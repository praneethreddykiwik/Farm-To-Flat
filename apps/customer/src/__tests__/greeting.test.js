import { describe, expect, it } from 'vitest';
import { greetingFor } from '../lib/dates';

// IST is UTC+5:30, so an IST hour H is UTC (H - 5.5).
const ist = (h, m = 0) => new Date(Date.UTC(2026, 10, 21, h, m) - 5.5 * 3600e3);

describe('home greeting follows the IST clock', () => {
  it('morning from 4, afternoon from noon, evening from 5 pm, moon late at night', () => {
    expect(greetingFor(ist(7))).toEqual({ text: 'Good morning', emoji: '☀️' });
    expect(greetingFor(ist(11, 59)).text).toBe('Good morning');
    expect(greetingFor(ist(12)).text).toBe('Good afternoon');
    expect(greetingFor(ist(13, 27)).text).toBe('Good afternoon');
    expect(greetingFor(ist(18)).text).toBe('Good evening');
    expect(greetingFor(ist(18)).emoji).toBe('🌇');
  });

  it('never says good morning with a sun in the small hours', () => {
    const late = greetingFor(ist(1, 27));
    expect(late.text).toBe('Good evening');
    expect(late.emoji).toBe('🌙');
    expect(greetingFor(ist(0)).emoji).toBe('🌙');
    expect(greetingFor(ist(23)).emoji).toBe('🌙');
    expect(greetingFor(ist(4)).text).toBe('Good morning');
  });
});
