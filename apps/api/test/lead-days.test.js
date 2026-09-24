/**
 * How soon a slot may be is a SEPARATE question from when it closes.
 *
 * Conflating the two broke this twice: expressing the lead as a midnight deadline made midnight the
 * binding deadline for both windows, so every slot showed the same countdown and the operator's
 * cut-off times stopped mattering. These pin both behaviours at once — next-day delivery AND two
 * different countdowns on the same day.
 */
import { describe, expect, it } from 'vitest';
import { generateWindows } from '../src/lib/windows.js';

const community = (over = {}) => ({
  id: 'c',
  deliveryDays: [0, 1, 2, 3, 4, 5, 6],
  morningCutoff: '03:45',
  eveningCutoff: '15:00',
  cutoffWarningMinutes: 15,
  ...over,
});
// Thu 24 Sep 2026, 13:41 IST — after the morning cut-off, before the evening one.
const NOW = Date.UTC(2026, 8, 24, 8, 11);
const FROM = '2026-09-24';

describe('order lead time', () => {
  it('defaults to next-day: ordering today never delivers today', () => {
    const w = generateWindows(community(), FROM, () => 0, NOW);
    expect(w.every((x) => x.date > FROM)).toBe(true);
    expect(w[0].date).toBe('2026-09-25');
  });

  it('still gives the two windows of a day DIFFERENT countdowns', () => {
    const w = generateWindows(community(), FROM, () => 0, NOW);
    const day = w.filter((x) => x.date === '2026-09-25');
    expect(day).toHaveLength(2);
    expect(day[0].secondsUntilCutoff).not.toBe(day[1].secondsUntilCutoff);
    // Morning closes earlier in the day than evening, so it runs out first.
    const m = day.find((x) => x.window === 'MORNING');
    const e = day.find((x) => x.window === 'EVENING');
    expect(m.secondsUntilCutoff).toBeLessThan(e.secondsUntilCutoff);
  });

  it('a tomorrow slot is orderable for the whole day, not only at dawn', () => {
    const w = generateWindows(community(), FROM, () => 0, NOW);
    const m = w.find((x) => x.date === '2026-09-25' && x.window === 'MORNING');
    expect(m.isOpen).toBe(true);
    expect(m.secondsUntilCutoff).toBeGreaterThan(10 * 3600); // ~14h of runway
    expect(m.showCountdown).toBe(true);
  });

  it('0 lets the operator allow same-day again', () => {
    const w = generateWindows(community({ orderLeadDays: 0 }), FROM, () => 0, NOW);
    const today = w.filter((x) => x.date === FROM);
    expect(today.length).toBeGreaterThan(0);
    // The morning cut-off has passed, the evening one has not — exactly as before this change.
    expect(today.find((x) => x.window === 'MORNING').isOpen).toBe(false);
    expect(today.find((x) => x.window === 'EVENING').isOpen).toBe(true);
  });

  it('a longer lead pushes the earliest day out without collapsing the countdowns', () => {
    const w = generateWindows(community({ orderLeadDays: 3 }), FROM, () => 0, NOW);
    expect(w[0].date).toBe('2026-09-27');
    const day = w.filter((x) => x.date === '2026-09-27');
    expect(day[0].secondsUntilCutoff).not.toBe(day[1].secondsUntilCutoff);
  });

  it('still returns a full fortnight of slots, not fewer because of the lead', () => {
    const none = generateWindows(community({ orderLeadDays: 0 }), FROM, () => 0, NOW);
    const one = generateWindows(community(), FROM, () => 0, NOW);
    expect(one.length).toBe(none.length);
  });

  it('respects the community delivery days after applying the lead', () => {
    // Tue/Thu/Sat only. From Thu 24 with a 1-day lead the next eligible day is Sat 26.
    const w = generateWindows(community({ deliveryDays: [2, 4, 6] }), FROM, () => 0, NOW);
    expect(w[0].date).toBe('2026-09-26');
  });
});
