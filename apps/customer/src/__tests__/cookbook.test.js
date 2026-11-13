/** "What are you cooking?" — from a dish's name to what is on the shelf for it. */
import { describe, expect, it } from 'vitest';
import { DISHES, findDish, ideas, suggest } from '../lib/cookbook';

const P = (id, name, aliases = [], extra = {}) => ({
  id,
  name,
  aliases,
  unit: 'KG',
  increment: '0.25',
  diet: 'VEG',
  availability: 'AVAILABLE',
  ...extra,
});
const SHELF = [
  P('tom', 'Tomato', ['tamata', 'tamatar']),
  P('oni', 'Onion', ['ullipaya', 'pyaz']),
  P('spo', 'Spring onion', ['ullikadalu']),
  P('chi', 'Green chilli', ['pachimirchi']),
  P('cur', 'Curry leaves', ['karivepaku']),
  P('gar', 'Garlic', ['velluli']),
  P('gin', 'Ginger', ['allam']),
  P('cor', 'Coriander', ['kothimeera']),
  P('dru', 'Drumstick', ['munakkaya']),
  P('drl', 'Drumstick Leaves', []),
  P('spi', 'Spinach', ['palakura', 'palak'], { goodToKnow: ['Naturally high in folate'] }),
  P('mal', 'Malabar spinach', []),
  P('bee', 'Beetroot', ['chukandar'], { goodToKnow: ['Naturally high in folate'] }),
  P('car', 'Carrot', ['gajar']),
  P('sor', 'Bottle gourd', ['sorakaya']),
  P('rid', 'Ridge gourd', ['beerakaya']),
  P('chk', 'Chicken curry cut', ['kodi'], { diet: 'NONVEG' }),
  P('egg', 'Country eggs', ['natu kodi guddu'], { diet: 'NONVEG', unit: 'DOZEN' }),
  P('out', 'Lemon', ['nimbu'], { availability: 'SOLD_OUT' }),
];
const ids = (r) => r.picks.map((x) => x.product.id);

describe('finding the dish', () => {
  it('knows it by its English, Telugu and Hindi names', () => {
    expect(findDish('Tomato curry').id).toBe('tomato_curry');
    expect(findDish('tamata kura').id).toBe('tomato_curry');
    expect(findDish('kodi kura').id).toBe('chicken_curry');
    expect(findDish('bhindi').id).toBe('bhindi');
  });

  it('takes the longest phrase, so tomato pappu is the dal and not the curry', () => {
    expect(findDish('tomato pappu').id).toBe('tomato_dal');
    expect(findDish('i want to make chicken biryani tonight').id).toBe('biryani');
  });

  it('finds it from the first few letters', () => {
    expect(findDish('samb').id).toBe('sambar');
  });

  it('says so when it does not know', () => {
    expect(findDish('lasagne')).toBeNull();
    expect(findDish('')).toBeNull();
  });
});

describe('what it suggests', () => {
  it('for tomato curry: what it needs first, then what makes it better, each with one line why', () => {
    const r = suggest('tomato curry', SHELF);
    expect(r.title).toBe('Tomato curry');
    expect(r.known).toBe(true);
    expect(ids(r).slice(0, 4)).toEqual(['tom', 'oni', 'chi', 'cur']);
    expect(r.picks.find((x) => x.product.id === 'gar').role).toBe('better');
    for (const x of r.picks) expect(x.why.length).toBeGreaterThan(8);
  });

  it('only ever offers what is on the shelf and can be bought today', () => {
    const r = suggest('lemon rice', SHELF);
    expect(ids(r)).not.toContain('out'); // the lemon is sold out
    const none = suggest('tomato curry', []);
    expect(none).toBeNull();
  });

  it('never mistakes one thing for another with a longer name', () => {
    const r = suggest('tomato curry', SHELF);
    expect(ids(r)).toContain('oni');
    expect(ids(r)).not.toContain('spo'); // onion is not spring onion
    expect(ids(suggest('palak pappu', SHELF))).not.toContain('mal'); // nor spinach, malabar spinach
    expect(ids(suggest('sambar', SHELF))).not.toContain('drl'); // nor drumstick, its leaves
  });

  it('counts what is already in the basket, and moves it behind what is still to buy', () => {
    const r = suggest('tomato curry', SHELF, { inBasket: ['tom', 'oni'] });
    expect(r.have).toBe(2);
    expect(r.total).toBe(4);
    expect(ids(r).slice(0, 4)).toEqual(['chi', 'cur', 'tom', 'oni']);
    expect(r.picks.find((x) => x.product.id === 'tom').inBasket).toBe(true);
  });

  it('keeps meat and eggs away from someone shopping vegetarian', () => {
    expect(ids(suggest('tomato curry', SHELF))).toContain('egg');
    expect(ids(suggest('tomato curry', SHELF, { diet: 'VEG' }))).not.toContain('egg');
    expect(ids(suggest('biryani', SHELF, { diet: 'VEG' }))).not.toContain('chk');
  });

  it('carries the product’s own nutrition badge, and writes none of its own', () => {
    const r = suggest('palak pappu', SHELF);
    expect(r.picks.find((x) => x.product.id === 'spi').badge).toBe('Naturally high in folate');
    expect(r.picks.find((x) => x.product.id === 'tom').badge).toBeNull();
  });

  it('makes a gourd curry with the gourd that was asked for, not all of them', () => {
    expect(ids(suggest('beerakaya kura', SHELF))).toContain('rid');
    expect(ids(suggest('beerakaya kura', SHELF))).not.toContain('sor');
    expect(ids(suggest('sorakaya', SHELF))).toContain('sor');
    expect(ids(suggest('sorakaya', SHELF))).not.toContain('rid');
  });
});

describe('a dish it has never heard of', () => {
  it('is built around the thing named, if we sell it', () => {
    const r = suggest('drumstick leaves fry', SHELF);
    expect(r.known).toBe(false);
    expect(ids(r)[0]).toBe('drl');
    expect(r.note).toMatch(/don’t have this exact recipe/);
    expect(ids(r)).toContain('oni');
  });

  it('otherwise offers the base of an everyday curry, and says that is what it is', () => {
    const r = suggest('lasagne', SHELF);
    expect(r.known).toBe(false);
    expect(r.title).toBe('Lasagne');
    expect(r.note).toMatch(/don’t know this dish yet/);
    expect(ids(r)).toEqual(expect.arrayContaining(['oni', 'tom', 'chi']));
  });
});

describe('the one-tap ideas', () => {
  it('start from what is already in the basket', () => {
    const list = ideas(SHELF, ['chk']);
    expect(list[0].id).toBe('chicken_curry');
    expect(list.length).toBeLessThanOrEqual(6);
  });

  it('fall back to everyday favourites for an empty basket', () => {
    expect(ideas(SHELF, []).map((d) => d.id)).toContain('tomato_curry');
  });
});

describe('the book itself', () => {
  it('gives every ingredient of every dish a reason', () => {
    for (const d of DISHES)
      for (const part of [...d.needs, ...d.better]) {
        expect(part.why, `${d.id}/${part.key}`).toBeTruthy();
        expect(part.why.length, `${d.id}/${part.key}`).toBeLessThanOrEqual(70);
      }
  });

  it('makes no health claim in its own words — those come only from the product', () => {
    const banned = /calcium|vitamin|protein|iron|immun|healthy|nutri|diabet|cure|weight|detox/i;
    for (const d of DISHES)
      for (const part of [...d.needs, ...d.better])
        expect(banned.test(part.why), `${d.id}/${part.key}: ${part.why}`).toBe(false);
  });
});
