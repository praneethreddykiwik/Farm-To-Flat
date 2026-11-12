import { describe, expect, it, vi } from 'vitest';
import {
  ACTION,
  CATEGORY,
  CATEGORY_ACTIONS,
  routeForNotification,
} from '../lib/notificationRoutes';
import {
  planReminders,
  reminderId,
  slotInstant,
  slotsForMeals,
  SLOT_TIMES,
} from '../lib/mealReminders';

// mealReminders imports expo-notifications and react-native for the scheduling half; the pure
// planning half under test needs neither. (vi.mock is hoisted above the imports.)
vi.mock('expo-notifications', () => ({}));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

describe('where a notification tap goes', () => {
  it('a meal reminder opens the tracker on that meal', () => {
    expect(routeForNotification({ data: { kind: 'MEAL_CHECKIN', slot: 'lunch' } })).toEqual({
      pathname: '/meal-checkin',
      params: { slot: 'lunch' },
    });
  });

  it('its buttons carry what was pressed', () => {
    const data = { kind: 'MEAL_CHECKIN', slot: 'dinner' };
    expect(routeForNotification({ actionIdentifier: ACTION.SNAP, data }).params).toEqual({
      slot: 'dinner',
      do: 'snap',
    });
    expect(routeForNotification({ actionIdentifier: ACTION.HAD, data }).params.do).toBe('had');
    expect(routeForNotification({ actionIdentifier: ACTION.SKIP_MEAL, data }).params.do).toBe(
      'skip',
    );
  });

  it('the evening-before prompt opens the confirm screen for its date (it used to go nowhere)', () => {
    const data = {
      type: 'plan-confirm',
      planId: 'sched_1',
      date: '2026-11-14',
      url: '/confirm/2026-11-14',
    };
    expect(routeForNotification({ data })).toEqual({
      pathname: '/confirm/[date]',
      params: { date: '2026-11-14' },
    });
    expect(routeForNotification({ actionIdentifier: ACTION.SKIP_DAY, data }).params).toEqual({
      date: '2026-11-14',
      do: 'skip',
    });
    expect(routeForNotification({ actionIdentifier: ACTION.CONFIRM, data }).params.do).toBe(
      'confirm',
    );
  });

  it('never routes on a malformed date', () => {
    expect(routeForNotification({ data: { type: 'plan-confirm', date: '../../etc' } })).toBeNull();
  });

  it('order updates open the order', () => {
    expect(routeForNotification({ data: { orderId: 'ord_9', status: 'PACKING' } })).toEqual({
      pathname: '/order/[id]',
      params: { id: 'ord_9' },
    });
    expect(
      routeForNotification({ actionIdentifier: ACTION.ISSUE, data: { orderId: 'ord_9' } }).params
        .do,
    ).toBe('issue');
  });

  it('staff alerts still reach the approvals screen', () => {
    expect(routeForNotification({ data: { kind: 'PROCUREMENT_BUFFER' } })).toEqual({
      pathname: '/staff/approvals',
    });
  });

  it('an unknown payload or a platform default action changes nothing', () => {
    expect(routeForNotification({ data: {} })).toBeNull();
    expect(routeForNotification()).toBeNull();
    const plain = routeForNotification({
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      data: { kind: 'MEAL_CHECKIN', slot: 'lunch' },
    });
    expect(plain.params).toEqual({ slot: 'lunch' });
  });

  it('category ids are safe on iOS and every action id is routable', () => {
    for (const id of Object.values(CATEGORY)) expect(id).toMatch(/^[a-z]+$/);
    const known = new Set(Object.values(ACTION));
    for (const actions of Object.values(CATEGORY_ACTIONS))
      for (const a of actions) expect(known.has(a.identifier)).toBe(true);
  });
});

describe('meal reminders that know when to stay quiet', () => {
  const dates = ['2026-11-13', '2026-11-14'];
  // 06:00 IST on the 13th
  const dawn = new Date('2026-11-13T00:30:00Z');

  it('asks about the meals a person actually eats', () => {
    expect(slotsForMeals(1)).toEqual(['lunch']);
    expect(slotsForMeals(2)).toEqual(['lunch', 'dinner']);
    expect(slotsForMeals(3)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(slotsForMeals(4)).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
    expect(slotsForMeals(undefined)).toHaveLength(3);
  });

  it('fires at the slot time in IST, whatever the phone thinks the timezone is', () => {
    expect(slotInstant('2026-11-13', 'lunch').toISOString()).toBe('2026-11-13T08:00:00.000Z'); // 13:30 IST
    expect(slotInstant('2026-11-13', 'breakfast').toISOString()).toBe('2026-11-13T03:30:00.000Z'); // 09:00 IST
  });

  it('never lands at night', () => {
    for (const t of Object.values(SLOT_TIMES)) {
      expect(t.hour).toBeGreaterThanOrEqual(9);
      expect(t.hour * 60 + t.minute).toBeLessThanOrEqual(21 * 60);
    }
  });

  it('follows the plan: only the meals planned, named in the reminder', () => {
    const r = planReminders({
      now: dawn,
      dates,
      mealsByDate: {
        '2026-11-13': [
          { slot: 'lunch', name: 'Palakura pappu', kcal: 520.4 },
          { slot: 'dinner', name: 'Roti & kura' },
        ],
      },
    });
    expect(r.map((x) => x.id)).toEqual([
      reminderId('2026-11-13', 'lunch'),
      reminderId('2026-11-13', 'dinner'),
    ]);
    expect(r[0].body).toContain('Palakura pappu');
    expect(r[0].body).toContain('520 kcal');
    // the 14th has no plan and no default → silence, not a guess
    expect(r.some((x) => x.date === '2026-11-14')).toBe(false);
  });

  it('does not remind about a meal already logged', () => {
    const r = planReminders({
      now: dawn,
      dates: ['2026-11-13'],
      defaultSlots: slotsForMeals(3),
      logged: { '2026-11-13': ['breakfast', 'lunch'] },
    });
    expect(r.map((x) => x.slot)).toEqual(['dinner']);
  });

  it('does not schedule a time that has already passed', () => {
    const afternoon = new Date('2026-11-13T09:30:00Z'); // 15:00 IST — breakfast and lunch are gone
    const r = planReminders({
      now: afternoon,
      dates: ['2026-11-13'],
      defaultSlots: slotsForMeals(4),
    });
    expect(r.map((x) => x.slot)).toEqual(['snack', 'dinner']);
  });

  it('with no plan and no opt-in, schedules nothing at all', () => {
    expect(planReminders({ now: dawn, dates })).toEqual([]);
  });
});
