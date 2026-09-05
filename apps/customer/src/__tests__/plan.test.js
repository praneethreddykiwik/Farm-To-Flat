import { describe, expect, it, vi } from 'vitest';

// ai.js reads env.js, which touches expo-constants; the validator under test never needs it.
import { NUTRITION, dailyTargets, orderQuantityFor, totalsFor } from '../lib/nutrition';
import { normalisePlan } from '../lib/ai';
import { PRODUCTS } from '../api/mock/data';

// ai.js reads env.js, which touches expo-constants; the validator under test never needs it. (vi.mock is hoisted.)
vi.mock('../lib/env', () => ({
  env: {
    useMocks: true,
    aiProvider: 'groq',
    groqKey: null,
    geminiKey: null,
    groqModel: 'x',
    geminiModel: 'y',
  },
  API_BASE: '',
}));

describe('nutrition grounding', () => {
  it('has a reference row for every catalog product', () => {
    const missing = PRODUCTS.filter((p) => !NUTRITION[p.id]).map((p) => p.id);
    expect(missing).toEqual([]);
  });
  it('computes totals from the table, not from the model', () => {
    const t = totalsFor([
      { productId: 'p_eggs', grams: 100 },
      { productId: 'p_palak', grams: 100 },
    ]);
    expect(t.kcal).toBe(178); // 155 + 23
    expect(t.protein).toBe(16); // 12.6 + 2.9 → 15.5 → 16
  });
  it('rounds plan grams up to a sale unit the customer can actually order', () => {
    const eggs = PRODUCTS.find((p) => p.id === 'p_eggs'); // DOZEN, 600 g/unit, 0.88 edible
    expect(orderQuantityFor(eggs, 'p_eggs', 150)).toBe(1);
    const tomato = PRODUCTS.find((p) => p.id === 'p_tomato'); // KG in 0.25 steps
    expect(orderQuantityFor(tomato, 'p_tomato', 300)).toBe(0.5); // 300/0.95 = 316 g → 0.5 kg
  });
  it('derives realistic daily targets', () => {
    const t = dailyTargets({
      age: 20,
      sex: 'male',
      weightKg: 70,
      heightCm: 172,
      activity: 'active',
      goal: 'muscle',
    });
    expect(t.kcal).toBeGreaterThan(2800);
    expect(t.kcal).toBeLessThan(3600);
    expect(t.protein).toBe(126);
  });
});

describe('normalisePlan refuses to lie', () => {
  const targets = dailyTargets({ age: 30 });
  it('drops products that are not in the catalog and clamps absurd grams', () => {
    const raw = {
      title: 'Test',
      days: [
        {
          day: 1,
          meals: [
            {
              slot: 'lunch',
              name: 'Bowl',
              items: [
                { productId: 'p_tomato', grams: 5000 },
                { productId: 'p_not_real', grams: 100 },
                { productId: 'p_eggs', grams: 5 },
              ],
              steps: ['x'],
            },
          ],
        },
      ],
      cautions: ['a', 'b', 'c', 'd'],
    };
    const plan = normalisePlan(raw, PRODUCTS, targets, 'day');
    const items = plan.days[0].meals[0].items;
    expect(items.map((i) => i.productId)).toEqual(['p_tomato', 'p_eggs']);
    // clamped to 20–400 g before any portion scaling, and never above 400 after it
    expect(items[0].grams).toBeLessThanOrEqual(400);
    expect(items[1].grams).toBeGreaterThanOrEqual(20);
    expect(plan.cautions).toHaveLength(3);
    expect(plan.averageDay.kcal).toBe(totalsFor(items).kcal);
    expect(plan.shopping).toEqual(items.map((i) => ({ productId: i.productId, grams: i.grams })));
    // a tiny plan gets scaled up toward a real day's food, and says so
    expect(plan.scaled).toBeGreaterThan(1);
  });
  it('throws when the model returns nothing usable', () => {
    expect(() =>
      normalisePlan(
        { days: [{ day: 1, meals: [{ items: [{ productId: 'nope', grams: 10 }] }] }] },
        PRODUCTS,
        targets,
        'day',
      ),
    ).toThrow();
  });
  it('truncates to the horizon length', () => {
    const day = {
      meals: [{ slot: 'dinner', name: 'x', items: [{ productId: 'p_palak', grams: 100 }] }],
    };
    const plan = normalisePlan({ days: [day, day, day] }, PRODUCTS, targets, 'day');
    expect(plan.days).toHaveLength(1);
  });
});
