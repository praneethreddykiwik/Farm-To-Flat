import { describe, expect, it } from 'vitest';
import {
  OIL_TSP,
  SPREAD,
  WEEKLY_GOAL,
  applyOil,
  applyScale,
  checkItem,
  daySummary,
  finaliseAnalysis,
  itemsFromPicks,
  matchDish,
  searchFoods,
  streakFrom,
  totalsOf,
} from '../src/lib/meal-analysis.js';
import { DISHES } from '../src/data/dishes.js';
import { parseMealReply } from '../src/lib/meal-vision.js';
import { retentionCutoff } from '../src/lib/meal-retention.js';
import { progressDots, pushShape } from '../src/lib/notify.js';

describe('reference dishes', () => {
  it('every dish has plausible numbers and a household portion', () => {
    for (const d of DISHES) {
      expect(d.kcal, d.id).toBeGreaterThan(5);
      expect(d.kcal, d.id).toBeLessThan(400);
      // energy from the macros should land near the stated kcal (4/4/9), within a loose tolerance
      const fromMacros = d.protein * 4 + d.carbs * 4 + d.fat * 9;
      expect(Math.abs(fromMacros - d.kcal) / d.kcal, d.id).toBeLessThan(0.3);
      expect(d.serve[0], d.id).toBeGreaterThan(20);
      expect(d.indb || d.secondary, d.id).toBeTruthy();
    }
  });

  it('matches regional names, longest first', () => {
    expect(matchDish('Pappu')?.id).toBe('dal');
    expect(matchDish('curd rice')?.id).toBe('curd_rice');
    expect(matchDish('plain cooked rice')?.id).toBe('rice');
    expect(matchDish('Masala Dosa')?.id).toBe('masala_dosa');
    expect(matchDish('2 chapati')?.id).toBe('roti');
    expect(matchDish('kodi kura')?.id).toBe('chicken_curry');
    expect(matchDish('pizza')).toBeNull();
  });
});

describe('checking what the camera said', () => {
  it('keeps a plausible estimate and fills in missing macros', () => {
    const it0 = checkItem({ name: 'cooked rice', grams: 150, kcal: 180 });
    expect(it0.check).toBe('ok');
    expect(it0.kcal).toBe(180);
    expect(it0.carbs).toBeGreaterThan(30);
  });

  it('corrects a number no such dish has ever had', () => {
    const wild = checkItem({ name: 'sambar', grams: 150, kcal: 600 });
    expect(wild.check).toBe('adjusted');
    expect(wild.kcal).toBe(Math.round((97 * 150) / 100));
    const tooLow = checkItem({ name: 'roti', grams: 80, kcal: 20 });
    expect(tooLow.check).toBe('adjusted');
    expect(tooLow.kcal).toBe(Math.round((202 * 80) / 100));
  });

  it('uses the household portion when only a count is given', () => {
    const rotis = checkItem({ name: 'roti', count: 3 });
    expect(rotis.grams).toBe(120);
    expect(rotis.kcal).toBe(Math.round(202 * 1.2));
  });

  it('marks what it cannot check, and does not invent macros for it', () => {
    const odd = checkItem({ name: 'cheese pizza slice', grams: 120, kcal: 320 });
    expect(odd.check).toBe('unverified');
    expect(odd.kcal).toBe(320);
    expect(odd.protein).toBeNull();
  });

  it('a corrected or unverifiable plate is never "high" confidence', () => {
    const a = finaliseAnalysis({
      confidence: 'high',
      items: [{ name: 'sambar', grams: 150, kcal: 900 }],
    });
    expect(a.confidence).toBe('medium');
    const b = finaliseAnalysis({
      confidence: 'high',
      items: [{ name: 'cooked rice', grams: 150, kcal: 175 }],
    });
    expect(b.confidence).toBe('high');
  });

  it('always returns a range, wider when unsure, leaning upward', () => {
    const items = [{ kcal: 500, protein: 10, carbs: 60, fat: 20 }];
    const high = totalsOf(items, 'high');
    const low = totalsOf(items, 'low');
    expect(high.kcalLow).toBeLessThan(500);
    expect(high.kcalHigh).toBeGreaterThan(500);
    expect(low.kcalHigh - low.kcalLow).toBeGreaterThan(high.kcalHigh - high.kcalLow);
    // photo estimates miss low far more than high, so there is more room above than below
    expect(low.kcalHigh - 500).toBeGreaterThan(500 - low.kcalLow);
    expect(SPREAD.low).toBeGreaterThan(SPREAD.high);
  });

  it('survives a garbage reply', () => {
    expect(finaliseAnalysis(parseMealReply('not json')).items).toEqual([]);
    expect(finaliseAnalysis(null).items).toEqual([]);
    expect(finaliseAnalysis({ items: 'nope' }).totals.kcal).toBe(0);
  });

  it('reads macros and counts from the model reply', () => {
    const p = parseMealReply(
      JSON.stringify({
        items: [{ name: 'idli', count: 3, grams: 135, kcal: 190, protein: 6, carbs: 38, fat: 1 }],
        confidence: 'medium',
      }),
    );
    expect(p.items[0]).toMatchObject({ name: 'idli', count: 3, grams: 135, protein: 6 });
    expect(p.confidence).toBe('medium');
  });
});

describe('corrections the customer makes', () => {
  const plate = [
    {
      name: 'Cooked rice',
      grams: 150,
      kcal: 176,
      protein: 3.9,
      carbs: 38.6,
      fat: 0.3,
      dish: 'rice',
      check: 'ok',
    },
    {
      name: 'Dal',
      grams: 150,
      kcal: 95,
      protein: 4.8,
      carbs: 10.2,
      fat: 3.8,
      dish: 'dal',
      check: 'ok',
    },
  ];

  it('oil becomes its own visible line, and a new answer replaces the old one', () => {
    const once = applyOil(plate, 'normal');
    expect(once).toHaveLength(3);
    expect(once[2]).toMatchObject({ kcal: OIL_TSP.normal * 5 * 9, fat: 10, check: 'yours' });
    const again = applyOil(once, 'heavy');
    expect(again).toHaveLength(3);
    expect(again[2].kcal).toBe(OIL_TSP.heavy * 5 * 9);
    expect(applyOil(again, 'none')).toHaveLength(2);
  });

  it('scaling a portion scales the food, not the oil the customer entered', () => {
    const withOil = applyOil(plate, 'light');
    const bigger = applyScale(withOil, 1.5);
    expect(bigger[0].kcal).toBe(264);
    expect(bigger[0].grams).toBe(225);
    expect(bigger[2].kcal).toBe(withOil[2].kcal);
    expect(applyScale(plate, 99)[0].kcal).toBe(176 * 3); // clamped
  });

  it('picking foods from the list uses household portions', () => {
    const items = itemsFromPicks([
      { foodId: 'roti', servings: 2 },
      { foodId: 'dal' },
      { foodId: 'nope' },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ grams: 80, kcal: Math.round(202 * 0.8) });
    expect(items[1].grams).toBe(150);
  });

  it('search finds dishes by their Telugu and Hindi names', () => {
    expect(searchFoods('pappu')[0].id).toBe('dal');
    expect(searchFoods('perugu').map((f) => f.id)).toContain('curd');
    expect(searchFoods('').length).toBeGreaterThan(10);
    expect(searchFoods('idli')[0].serving).toMatchObject({ grams: 45, unit: 'idli' });
  });
});

describe('the day', () => {
  it('adds up what was eaten and leaves out what was skipped', () => {
    const s = daySummary([
      {
        slot: 'breakfast',
        status: 'FOLLOWED',
        actualKcal: 300,
        photoKey: 'k',
        confidence: 'medium',
        items: [{ kcal: 300, protein: 9, carbs: 50, fat: 6 }],
      },
      { slot: 'lunch', status: 'FOLLOWED', plannedKcal: 520 }, // "I had it", no photo
      { slot: 'dinner', status: 'SKIPPED', plannedKcal: 600 },
    ]);
    expect(s.totals.kcal).toBe(820);
    expect(s.totals.protein).toBe(9);
    expect(s.mealsLogged).toBe(2);
    expect(s.mealsSkipped).toBe(1);
    expect(s.bySlot.lunch.estimated).toBe(false);
    expect(s.totals.kcalLow).toBeLessThan(820);
    expect(s.totals.kcalHigh).toBeGreaterThan(820);
  });
  it('an empty day is zero, not an error', () => {
    expect(daySummary([]).totals).toMatchObject({ kcal: 0, protein: 0 });
    expect(daySummary(undefined).mealsLogged).toBe(0);
  });
});

describe('the streak — built to encourage, not to punish', () => {
  const on = (...dates) => dates.map((date) => ({ date, status: 'FOLLOWED' }));

  it('counts consecutive days up to today', () => {
    const s = streakFrom(on('2026-11-10', '2026-11-11', '2026-11-12'), '2026-11-12');
    expect(s.current).toBe(3);
    expect(s.loggedToday).toBe(true);
  });

  it('today not logged yet does not break it', () => {
    const s = streakFrom(on('2026-11-10', '2026-11-11'), '2026-11-12');
    expect(s.current).toBe(2);
    expect(s.loggedToday).toBe(false);
  });

  it('forgives one missed day in seven', () => {
    const s = streakFrom(on('2026-11-08', '2026-11-09', '2026-11-11', '2026-11-12'), '2026-11-12');
    expect(s.current).toBe(4);
    expect(s.restDaysUsed).toBe(1);
  });

  it('does not forgive two missed days in a row', () => {
    const s = streakFrom(on('2026-11-08', '2026-11-11', '2026-11-12'), '2026-11-12');
    expect(s.current).toBe(2);
  });

  it('does not forgive a second gap within the same seven days', () => {
    const s = streakFrom(on('2026-11-06', '2026-11-08', '2026-11-10', '2026-11-12'), '2026-11-12');
    expect(s.current).toBe(2); // 12, (rest 11), 10 — the gap on the 9th is not forgiven
  });

  it('a skipped meal is not a logged day', () => {
    const s = streakFrom([{ date: '2026-11-12', status: 'SKIPPED' }], '2026-11-12');
    expect(s.current).toBe(0);
  });

  it('reports the week and a five-day goal', () => {
    const s = streakFrom(
      on('2026-11-07', '2026-11-08', '2026-11-09', '2026-11-11', '2026-11-12'),
      '2026-11-12',
    );
    expect(s.week).toHaveLength(7);
    expect(s.week[6]).toEqual({ date: '2026-11-12', logged: true });
    expect(s.daysThisWeek).toBe(5);
    expect(s.weeklyGoal).toBe(WEEKLY_GOAL);
    expect(s.goalMet).toBe(true);
  });

  it('remembers the best run', () => {
    const s = streakFrom(
      on('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-11-12'),
      '2026-11-12',
    );
    expect(s.current).toBe(1);
    expect(s.best).toBe(4);
  });

  it('nothing logged is zero', () => {
    expect(streakFrom([], '2026-11-12')).toMatchObject({
      current: 0,
      best: 0,
      daysThisWeek: 0,
      goalMet: false,
    });
  });
});

describe('retention and pushes', () => {
  it('the photo cutoff is counted in IST days', () => {
    // 20:00 UTC on the 12th is already the 13th in India
    expect(retentionCutoff(new Date('2026-11-12T20:00:00Z'), 35)).toBe('2026-10-09');
    expect(retentionCutoff(new Date('2026-11-12T10:00:00Z'), 35)).toBe('2026-10-08');
  });

  it("an order's status pushes replace each other and show progress", () => {
    expect(progressDots(3)).toBe('●●●○');
    expect(pushShape('ORDER_OUT', { orderId: 'o1' })).toMatchObject({
      replaceKey: 'order-o1',
      dots: '●●●○',
    });
    expect(pushShape('ORDER_PLACED', { orderId: 'o1' }).replaceKey).toBe('order-o1');
    expect(pushShape('ORDER_DELIVERED', { orderId: 'o1' }).categoryId).toBe('orderdelivered');
    expect(pushShape('REFUND_INITIATED', { orderId: 'o1' })).toEqual({});
    expect(pushShape('ORDER_OUT', {})).toEqual({});
  });
});
