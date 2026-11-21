/** "What are you cooking?" — from a dish's name to what is on the shelf for it (cookbook v2). */
import { describe, expect, it } from 'vitest';
import { DISHES, ING, findDish, ideas, suggest, isIngredient } from '../lib/cookbook';
import { checkDishes } from '../lib/cookbook-data/schema';
import { PRODUCTS as CATALOGUE } from '../../../api/src/data/seed.js';

const P = (id, name, aliases = [], extra = {}) => ({
  id,
  name,
  aliases,
  unit: 'KG',
  increment: '0.25',
  diet: 'VEG',
  availability: 'AVAILABLE',
  pricePaise: '4000',
  ...extra,
});
const SHELF = [
  P('tom', 'Tomato', ['tamata', 'tamatar']),
  P('oni', 'Onion', ['ullipaya', 'pyaz']),
  P('spo', 'Spring onion', ['ullikadalu'], { unit: 'BUNCH', increment: '1' }),
  P('chi', 'Green chilli', ['pachimirchi']),
  P('cur', 'Curry leaves', ['karivepaku'], { unit: 'BUNCH', increment: '1' }),
  P('gar', 'Garlic', ['velluli']),
  P('gin', 'Ginger', ['allam']),
  P('cor', 'Coriander', ['kothimeera'], { unit: 'BUNCH', increment: '1' }),
  P('dru', 'Drumstick', ['munakkaya']),
  P('drl', 'Drumstick Leaves', [], { unit: 'BUNCH', increment: '1' }),
  P('spi', 'Spinach', ['palakura', 'palak'], {
    unit: 'BUNCH',
    increment: '1',
    goodToKnow: ['Naturally high in folate'],
  }),
  P('mal', 'Malabar spinach', [], { unit: 'BUNCH', increment: '1' }),
  P('cuc', 'Cucumber', ['dosakaya', 'kheera']),
  P('bee', 'Beetroot', ['chukandar']),
  P('car', 'Carrot', ['gajar']),
  P('pot', 'Potato', ['aloo']),
  P('cau', 'Cauliflower', ['gobi'], { unit: 'PIECE', increment: '1' }),
  P('cap', 'Capsicum', ['shimla mirch']),
  P('sor', 'Bottle gourd', ['sorakaya'], { unit: 'PIECE', increment: '1' }),
  P('rid', 'Ridge gourd', ['beerakaya']),
  P('chk', 'Chicken curry cut', ['kodi'], { diet: 'NONVEG', increment: '0.5' }),
  P('egg', 'Country eggs', ['natu kodi guddu'], { diet: 'NONVEG', unit: 'DOZEN', increment: '1' }),
  P('out', 'Lemon', ['nimbu'], { availability: 'SOLD_OUT', unit: 'PIECE', increment: '1' }),
];
const ids = (r) => r.picks.map((x) => x.product.id);
const pick = (r, id) => r.picks.find((x) => x.product.id === id);

describe('the book itself', () => {
  it('is a real cookbook: hundreds of dishes from every part of India', () => {
    expect(DISHES.length).toBeGreaterThanOrEqual(250);
    const regions = new Set(DISHES.map((d) => d.region));
    for (const r of ['telangana', 'andhra', 'south', 'north', 'west', 'east', 'pan'])
      expect(regions.has(r), r).toBe(true);
    const diets = new Set(DISHES.map((d) => d.diet));
    expect([...diets].sort()).toEqual(['egg', 'nonveg', 'veg']);
  });

  it('passes every rule: known ingredients, unique ids and names, short reasons, honest diet', () => {
    expect(checkDishes(DISHES, ING)).toEqual([]);
  });

  it('has a dish for every product we sell', () => {
    const unused = CATALOGUE.filter(
      (p) =>
        !DISHES.some((d) => [...d.needs, ...d.better].some((part) => isIngredient(p, part.key))),
    ).map((p) => p.name);
    expect(unused).toEqual([]);
  });

  it('knows the dishes people actually ask for', () => {
    for (const q of [
      'chicken 65',
      'paneer butter masala',
      'pesarattu',
      'dosa',
      'masala dosa',
      'idli',
      'upma',
      'dal makhani',
      'kheer',
      'fish fry',
      'chole',
      'rajma',
      'palak paneer',
      'pav bhaji',
      'gobi manchurian',
      'egg curry',
      'mutton curry',
      'haleem',
      'pulihora',
      'gongura mutton',
      'aloo paratha',
      'poha',
      'sambar',
      'rasam',
      'curd rice',
      'bisi bele bath',
      'avial',
      'butter chicken',
      'gajar ka halwa',
      'vada pav',
    ]) {
      const d = findDish(q);
      expect(d, q).toBeTruthy();
    }
  });
});

describe('finding the dish', () => {
  it('knows it by its English, Telugu and Hindi names', () => {
    expect(findDish('Tomato curry').name).toMatch(/tomato/i);
    expect(findDish('tamata kura').name).toMatch(/tomato|tamata/i);
    expect(findDish('kodi kura').name).toMatch(/chicken|kodi/i);
    expect(findDish('bhindi masala').name).toMatch(/bhindi/i);
  });

  it('takes the longest phrase, so tomato pappu is the dal and not the curry', () => {
    expect(findDish('tomato pappu').name).toMatch(/pappu|dal/i);
    expect(findDish('i want to make chicken 65 tonight').name).toMatch(/65/);
  });

  it('matches whole words: kheer is never kheera (cucumber)', () => {
    const r = suggest('kheer', SHELF);
    expect(r.title).toMatch(/kheer/i);
    expect(ids(r)).not.toContain('cuc');
  });

  it('forgives a typo', () => {
    expect(findDish('panner butter masala').name).toMatch(/paneer butter masala/i);
    expect(findDish('biryni').name).toMatch(/biryani/i);
    expect(findDish('chiken 65').name).toMatch(/65/);
    expect(findDish('sambhar').name).toMatch(/sambar/i);
  });

  it('finds it from the first few letters', () => {
    expect(findDish('samb').name).toMatch(/sambar/i);
  });

  it('says so when it does not know', () => {
    expect(findDish('lasagne')).toBeNull();
    expect(findDish('')).toBeNull();
  });
});

describe('what it suggests', () => {
  it('needs first, then what makes it better, each with one line why', () => {
    const r = suggest('tomato curry', SHELF);
    expect(r.known).toBe(true);
    expect(ids(r)[0]).toBe('tom');
    expect(r.picks.find((x) => x.role === 'better')).toBeTruthy();
    for (const x of r.picks) expect(x.why.length).toBeGreaterThan(8);
  });

  it('only ever offers what is on the shelf and can be bought today', () => {
    const r = suggest('lemon rice', SHELF);
    expect(ids(r)).not.toContain('out'); // the lemon is sold out
    // Nothing on the shelf at all: nothing offered, and it says what is missing.
    const bare = suggest('tomato curry', []);
    expect(bare.picks).toEqual([]);
    expect(bare.note).toMatch(/don’t sell tomato|not on our shelf/i);
  });

  it('never mistakes one thing for another with a longer name', () => {
    expect(ids(suggest('tomato curry', SHELF))).not.toContain('spo'); // onion ≠ spring onion
    expect(ids(suggest('palak pappu', SHELF))).not.toContain('mal'); // spinach ≠ malabar spinach
    expect(ids(suggest('sambar', SHELF))).not.toContain('drl'); // drumstick ≠ its leaves
  });

  it('keeps meat and eggs away from someone shopping vegetarian, and says why', () => {
    expect(ids(suggest('chicken 65', SHELF))).toContain('chk');
    const r = suggest('chicken 65', SHELF, { diet: 'VEG' });
    expect(ids(r)).not.toContain('chk');
    expect(r.note).toMatch(/vegetarian/);
  });

  it('carries the product’s own nutrition badge, and writes none of its own', () => {
    const r = suggest('palak pappu', SHELF);
    expect(pick(r, 'spi').badge).toBe('Naturally high in folate');
    expect(pick(r, 'tom')?.badge ?? null).toBeNull();
  });

  it('makes a gourd curry with the gourd that was asked for', () => {
    expect(ids(suggest('beerakaya kura', SHELF))).toContain('rid');
    expect(ids(suggest('beerakaya kura', SHELF))).not.toContain('sor');
    expect(ids(suggest('sorakaya kura', SHELF))).toContain('sor');
  });

  it('says plainly when the main ingredient is not on our shelf', () => {
    const r = suggest('fish fry', SHELF);
    expect(r.note).toMatch(/don’t sell fish/i);
    expect(r.notSold).toContain('Fish');
    expect(ids(r)).toContain('oni');
  });

  it('lists the pantry staples to have ready, skipping the obvious', () => {
    const r = suggest('tomato pappu', SHELF);
    expect(r.kitchen).toContain('Toor dal');
    expect(r.kitchen).not.toContain('Salt');
  });

  it('offers the next-best matches', () => {
    const r = suggest('biryani', SHELF);
    expect(r.title).toMatch(/hyderabadi chicken dum biryani/i);
    expect(r.others.map((o) => o.name).join(' ')).toMatch(/biryani/i);
  });
});

describe('how much, for this family', () => {
  it('scales with the family, and a child eats about half', () => {
    const two = pick(suggest('aloo gobi', SHELF, { household: { adults: 2, children: 0 } }), 'pot');
    const four = pick(
      suggest('aloo gobi', SHELF, { household: { adults: 4, children: 0 } }),
      'pot',
    );
    const threePlusKid = pick(
      suggest('aloo gobi', SHELF, { household: { adults: 3, children: 2 } }),
      'pot',
    );
    expect(four.quantity).toBeGreaterThan(two.quantity);
    expect(threePlusKid.quantity).toBe(four.quantity); // 3 + 2×½ = 4 appetites
    expect(two.amount).toMatch(/g$|kg$/);
  });

  it('rounds up to what the product is sold in', () => {
    const r = suggest('aloo gobi', SHELF, { household: { adults: 2, children: 0 } });
    expect((pick(r, 'pot').quantity * 4) % 1).toBe(0); // potatoes in 250 g steps
    expect(Number.isInteger(pick(r, 'cau').quantity)).toBe(true); // cauliflower by the piece
  });

  it('a herb is one bunch for an ordinary family, two for a crowd', () => {
    const small = suggest('tomato curry', SHELF, { household: { adults: 2, children: 0 } });
    const crowd = suggest('tomato curry', SHELF, { household: { adults: 8, children: 0 } });
    const c1 = pick(small, 'cor') || pick(small, 'cur');
    const c2 = pick(crowd, 'cor') || pick(crowd, 'cur');
    expect(c1.quantity).toBe(1);
    expect(c2.quantity).toBe(2);
  });

  it('assumes two people until the family is set, and says so', () => {
    expect(suggest('aloo gobi', SHELF).forLabel).toBe('2 people');
    expect(suggest('aloo gobi', SHELF, { household: { adults: 2, children: 1 } }).forLabel).toBe(
      '2 adults, 1 child',
    );
  });

  it('counts a basket line as enough only when it covers the dish', () => {
    const r = suggest('aloo gobi', SHELF, {
      household: { adults: 4, children: 0 },
      inBasket: ['pot'],
      basketQty: { pot: 0.25 },
    });
    const pot = pick(r, 'pot');
    expect(pot.inBasket).toBe(true);
    expect(pot.enough).toBe(false);
    expect(r.have).toBeLessThan(r.total);
  });
});

describe('a dish it has never heard of', () => {
  it('is built around the thing named, if we sell it', () => {
    const r = suggest('drumstick leaves stir fry', SHELF);
    expect(r.known).toBe(false);
    expect(ids(r)[0]).toBe('drl');
    expect(r.note).toMatch(/don’t have this exact recipe/);
  });

  it('names an ingredient we do not sell', () => {
    const r = suggest('crab lollipop surprise', SHELF);
    expect(r.known).toBe(false);
    expect(r.note).toMatch(/don’t sell crab/i);
  });

  it('otherwise offers the base of an everyday curry, and says that is what it is', () => {
    const r = suggest('lasagne', SHELF);
    expect(r.known).toBe(false);
    expect(r.title).toBe('Lasagne');
    expect(r.note).toMatch(/don’t know this dish yet/);
    expect(ids(r)).toEqual(expect.arrayContaining(['oni', 'tom', 'chi']));
  });
});

describe('speed — it runs on every basket change', () => {
  it('ideas for a full basket take a few milliseconds, not the 86 ms they used to', () => {
    const basket = CATALOGUE.slice(0, 12).map((p) => p.id);
    ideas(CATALOGUE, basket, 6); // first run fills the caches
    const t = performance.now();
    for (let i = 0; i < 10; i += 1) ideas(CATALOGUE, basket, 6);
    expect((performance.now() - t) / 10).toBeLessThan(10);
  });
});

describe('the one-tap ideas', () => {
  it('start from what is already in the basket', () => {
    const list = ideas(SHELF, ['chk']);
    const first = DISHES.find((d) => d.id === list[0].id);
    expect(first.needs[0].key).toBe('chicken');
    expect(list.length).toBeLessThanOrEqual(6);
  });

  it('fall back to everyday favourites for an empty basket', () => {
    expect(ideas(SHELF, []).length).toBe(6);
  });
});
