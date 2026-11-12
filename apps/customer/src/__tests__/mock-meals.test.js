import { beforeEach, describe, expect, it } from 'vitest';
import { handleMeals, resetMockMeals } from '../api/mock/meals';

/**
 * The mock meal API is what the calorie tracker is built and demonstrated against. These hold it to
 * the real API's shapes, so a screen that works on mocks is not a screen that breaks on the server.
 */
const DAY = '2026-11-13';
const log = (body) => handleMeals('POST', '/meals/log', {}, { date: DAY, ...body });
const day = () => handleMeals('GET', '/meals/day', { date: DAY }).body;

describe('mock meal tracking', () => {
  beforeEach(() => resetMockMeals());

  it('leaves every non-meal path alone', () => {
    expect(handleMeals('GET', '/catalog', {}, undefined)).toBeNull();
  });

  it('starts the day empty', () => {
    const d = day();
    expect(d.logs).toEqual([]);
    expect(d.summary.totals.kcal).toBe(0);
    expect(d.photoRetentionDays).toBe(35);
  });

  it('logs picked foods and adds them up', () => {
    const res = log({
      slot: 'lunch',
      mode: 'pick',
      picks: [
        { foodId: 'rice-cooked', servings: 1 },
        { foodId: 'dal-tadka', servings: 1 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.log.source).toBe('picked');
    expect(res.body.log.items.map((i) => i.check)).toEqual(['yours', 'yours']);
    const d = day();
    expect(d.summary.totals.kcal).toBe(195 + 158);
    expect(d.summary.mealsLogged).toBe(1);
  });

  it('gives a photo a range, not just a number', () => {
    const { log: l } = log({ slot: 'dinner', mode: 'photo' }).body;
    expect(l.source).toBe('photo');
    expect(l.hasPhoto).toBe(true);
    expect(l.photoKey).toBeUndefined(); // the storage key never reaches the app
    expect(l.totals.kcalLow).toBeLessThan(l.totals.kcal);
    expect(l.totals.kcalHigh).toBeGreaterThan(l.totals.kcal);
    // no oil line until the customer says how much went in — as on the real API
    expect(l.items.some((i) => i.dish === 'added-fat')).toBe(false);
  });

  it('adds oil as its own visible line, and replaces it rather than stacking', () => {
    const { log: l } = log({ slot: 'dinner', mode: 'photo' }).body;
    const before = l.actualKcal;
    const a = handleMeals('PATCH', `/meals/${l.id}`, {}, { oil: 'normal' }).body.log;
    expect(a.actualKcal).toBe(before + 90);
    const b = handleMeals('PATCH', `/meals/${l.id}`, {}, { oil: 'heavy' }).body.log;
    expect(b.items.filter((i) => i.dish === 'added-fat')).toHaveLength(1);
    expect(b.actualKcal).toBe(before + 180);
    const c = handleMeals('PATCH', `/meals/${l.id}`, {}, { oil: 'none' }).body.log;
    expect(c.actualKcal).toBe(before);
  });

  it('counts a skipped meal as an answer, not as eating', () => {
    log({ slot: 'snack', mode: 'skipped' });
    const d = day();
    expect(d.summary.mealsSkipped).toBe(1);
    expect(d.summary.mealsLogged).toBe(0);
    expect(handleMeals('GET', '/meals/streak', { today: DAY }).body.current).toBe(0);
  });

  it('starts a streak with the first meal of the day', () => {
    log({ slot: 'breakfast', mode: 'pick', picks: [{ foodId: 'idli', servings: 3 }] });
    const s = handleMeals('GET', '/meals/streak', { today: DAY }).body;
    expect(s.current).toBe(1);
    expect(s.loggedToday).toBe(true);
    expect(s.week).toHaveLength(7);
    expect(s.week[6]).toEqual({ date: DAY, logged: true });
    expect(s.weeklyGoal).toBe(5);
  });

  it('finds a food by the name used at home', () => {
    const names = (q) => handleMeals('GET', '/meals/foods', { q }).body.foods.map((f) => f.id);
    expect(names('pappu')).toEqual(['dal-tadka']);
    expect(names('perugu')).toEqual(['curd']);
    expect(names('')).toHaveLength(8);
  });

  it('refuses an empty pick and an unknown meal', () => {
    expect(log({ slot: 'lunch', mode: 'pick', picks: [] }).status).toBe(422);
    expect(handleMeals('PATCH', '/meals/nope', {}, { scale: 1.25 }).status).toBe(404);
  });

  it('deletes a meal outright', () => {
    const { log: l } = log({ slot: 'lunch', mode: 'photo' }).body;
    expect(handleMeals('DELETE', `/meals/${l.id}`, {}).status).toBe(200);
    expect(day().logs).toEqual([]);
  });
});
