/** "Have you tried the meal planner?" — who sees it, how often, and where Try it goes. */
import { describe, expect, it } from 'vitest';
import {
  SNOOZE_DAYS,
  hasTriedPlanner,
  nudgeInstant,
  shouldShowNudge,
  snoozeUntil,
} from '../lib/plannerNudge';
import {
  ACTION,
  CATEGORY,
  CATEGORY_ACTIONS,
  routeForNotification,
} from '../lib/notificationRoutes';

const now = Date.UTC(2026, 10, 24, 6, 0);

describe('the planner prompt', () => {
  it('shows only to someone who can open the planner and has not used it', () => {
    expect(shouldShowNudge({ visible: true, tried: false, now })).toBe(true);
    expect(shouldShowNudge({ visible: false, tried: false, now })).toBe(false);
    expect(shouldShowNudge({ visible: true, tried: true, now })).toBe(false);
  });
  it('a draft or a saved plan counts as tried', () => {
    expect(hasTriedPlanner({ draft: null, scheduled: [] })).toBe(false);
    expect(hasTriedPlanner({ draft: { id: 1 }, scheduled: [] })).toBe(true);
    expect(hasTriedPlanner({ draft: null, scheduled: [{}] })).toBe(true);
  });
  it('closing it keeps it away for a week', () => {
    const snoozedUntil = snoozeUntil(now);
    const at = (d) =>
      shouldShowNudge({ visible: true, tried: false, snoozedUntil, now: now + d * 864e5 });
    expect(at(SNOOZE_DAYS - 0.1)).toBe(false);
    expect(at(SNOOZE_DAYS)).toBe(true);
  });
  it('the reminder fires at 4:30 PM IST, in the future, after any snooze', () => {
    const ist = (d) => new Date(d.getTime() + 330 * 60000).toISOString().slice(11, 16);
    for (const snoozedUntil of [null, snoozeUntil(now)]) {
      for (let h = 0; h < 24; h += 1) {
        const n = now + h * 3600e3;
        const d = nudgeInstant({ now: n, snoozedUntil });
        expect(ist(d)).toBe('16:30');
        expect(d.getTime()).toBeGreaterThan(Math.max(n, snoozedUntil || 0));
      }
    }
  });
  it('the notification has a Try it button, and both the tap and the button open the planner', () => {
    expect(CATEGORY.PLANNER).not.toMatch(/[:-]/);
    expect(CATEGORY_ACTIONS[CATEGORY.PLANNER]).toEqual([
      { identifier: ACTION.TRY_PLANNER, buttonTitle: 'Try it' },
    ]);
    const data = { kind: 'PLANNER_NUDGE' };
    for (const actionIdentifier of [undefined, ACTION.TRY_PLANNER])
      expect(routeForNotification({ data, actionIdentifier })).toEqual({
        pathname: '/(tabs)/plan',
      });
  });
});
