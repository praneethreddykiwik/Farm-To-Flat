/** "Is this enough for my family?" */
import { describe, expect, it } from 'vitest';
import {
  appetites,
  cleanHousehold,
  headcount,
  householdLabel,
  mealQuantity,
  topUpTo,
} from '../lib/household';

const veg = { name: 'Tomato', categoryId: 'cat_veg', unit: 'KG', increment: '0.25' };
const leafy = { name: 'Spinach', categoryId: 'cat_leafy', unit: 'BUNCH', increment: '1' };
const quarterBunch = { name: 'Kale', categoryId: 'cat_leafy', unit: 'BUNCH', increment: '0.25' };
const herb = { name: 'Coriander', categoryId: 'cat_herb', unit: 'BUNCH', increment: '1' };
const meat = { name: 'Chicken curry cut', categoryId: 'cat_meat', unit: 'KG', increment: '0.5' };
const eggs = { name: 'Country eggs', categoryId: 'cat_meat', unit: 'DOZEN', increment: '1' };
const cabbage = { name: 'Cabbage', categoryId: 'cat_veg', unit: 'PIECE', increment: '1' };
const four = { adults: 2, children: 2 };

describe('a household', () => {
  it('counts a child as half an appetite', () => {
    expect(headcount(four)).toBe(4);
    expect(appetites(four)).toBe(3);
  });

  it('reads the way people say it', () => {
    expect(householdLabel({ adults: 2, children: 0 })).toBe('2 adults');
    expect(householdLabel({ adults: 1, children: 1 })).toBe('1 adult, 1 child');
    expect(householdLabel(four)).toBe('2 adults, 2 children');
  });

  it('is nobody until someone is entered, and always has an adult once it is', () => {
    expect(cleanHousehold({ adults: 0, children: 0 })).toBeNull();
    expect(cleanHousehold(null)).toBeNull();
    expect(cleanHousehold({ adults: 0, children: 2 })).toEqual({ adults: 1, children: 2 });
    expect(cleanHousehold({ adults: 99, children: -3 })).toEqual({ adults: 12, children: 0 });
  });
});

describe('about how much one meal takes', () => {
  it('rounds up to a quantity the product is sold in', () => {
    expect(mealQuantity(veg, four)).toBe(0.5); // 3 × 125 g = 375 g → 500 g
    expect(mealQuantity(veg, { adults: 2, children: 0 })).toBe(0.25);
    expect(mealQuantity(meat, four)).toBe(0.5); // 450 g → one 500 g step
    expect(mealQuantity(meat, { adults: 4, children: 1 })).toBe(1);
  });

  it('counts greens by the bunch: one serves about three', () => {
    expect(mealQuantity(leafy, four)).toBe(1);
    expect(mealQuantity(leafy, { adults: 4, children: 0 })).toBe(2);
    expect(mealQuantity(quarterBunch, four)).toBe(1);
  });

  it('counts eggs two each, and a whole cabbage as serving four', () => {
    expect(mealQuantity(eggs, four)).toBe(1); // 6 eggs → one dozen
    expect(mealQuantity(eggs, { adults: 8, children: 0 })).toBe(2);
    expect(mealQuantity(cabbage, four)).toBe(1);
    expect(mealQuantity(cabbage, { adults: 6, children: 0 })).toBe(2);
  });

  it('never asks for more than can be bought in a day', () => {
    expect(mealQuantity({ ...meat, dailyCap: 1 }, { adults: 12, children: 0 })).toBe(1);
  });

  it('has nothing to say about herbs, or with nobody entered', () => {
    expect(mealQuantity(herb, four)).toBeNull();
    expect(mealQuantity(veg, null)).toBeNull();
  });
});

describe('speaking up', () => {
  it('only when the quantity is below the rough figure', () => {
    expect(topUpTo(veg, 0.25, four)).toBe(0.5);
    expect(topUpTo(veg, 0.5, four)).toBeNull();
    expect(topUpTo(veg, 1, four)).toBeNull();
  });

  it('not about something that is not in the basket', () => {
    expect(topUpTo(veg, 0, four)).toBeNull();
  });

  it('not for a couple buying the smallest amount', () => {
    expect(topUpTo(veg, 0.25, { adults: 2, children: 0 })).toBeNull();
  });
});
