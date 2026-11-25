/** "Tomorrow's order" in the Dynamic Island: when it shows, what it says, and what its links may do. */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildCard,
  cardForLink,
  cardSignature,
  closesAtFor,
  decideIsland,
  mayAct,
  popAtFor,
  tomorrowsPlan,
} from '../lib/orderIsland';
import { orderForMeals, quoteLines } from '../lib/planOrder';
import { handle } from '../api/mock/server';

const TODAY = '2026-11-25';
const TOMORROW = '2026-11-26';
const ist = (s) => Date.parse(`${s}+05:30`);
const product = { id: 'p_tomato', unit: 'KG', increment: '0.25', pricePaise: '4000' };
const productsById = { p_tomato: product };
const day = (date) => ({ date, meals: [{ items: [{ productId: 'p_tomato', grams: 900 }] }] });
const planWith = (extra = {}) => ({ id: 's1', days: [day(TODAY), day(TOMORROW)], ...extra });
const plan = { date: TOMORROW, planId: 's1', items: [{ productId: 'p_tomato', quantity: '1' }] };
const windows = [
  { date: TOMORROW, window: 'EVENING', isOpen: false, cutoffAt: new Date(0).toISOString() },
  {
    date: TOMORROW,
    window: 'MORNING',
    label: 'Morning',
    isOpen: true,
    cutoffAt: new Date(ist('2026-11-25T17:30:00')).toISOString(),
  },
];
const quote = {
  itemCount: 12,
  missing: [],
  subtotalPaise: '60000',
  totalPaise: '124050',
  minOrderValuePaise: '50000',
  meetsMinimum: true,
  couponError: null,
  walletBalancePaise: '0',
  codAllowed: true,
};
const now = ist('2026-11-25T16:00:00');
const card = () => buildCard({ plan, windows, quote, now });

describe('which day is asked about', () => {
  const ask = (scheduled) => tomorrowsPlan({ scheduled, productsById, today: TODAY });
  it('tomorrow only, and only while it is unanswered', () => {
    expect(ask([planWith()])).toMatchObject({ date: TOMORROW, planId: 's1' });
    expect(ask([planWith({ ordered: [TOMORROW] })])).toBeNull();
    expect(ask([planWith({ skipped: [TOMORROW] })])).toBeNull();
    expect(ask([{ id: 's2', days: [day('2026-11-27')] }])).toBeNull();
    expect(ask([])).toBeNull();
  });
  it('a day with nothing we sell is not asked about', () => {
    const odd = {
      id: 's3',
      days: [{ date: TOMORROW, meals: [{ items: [{ productId: 'x', grams: 9 }] }] }],
    };
    expect(ask([odd])).toBeNull();
  });
  it('asks for exactly what the confirm screen would order', () => {
    const { lines } = orderForMeals(day(TOMORROW).meals, productsById);
    expect(ask([planWith()]).items).toEqual(quoteLines(lines));
    expect(Number(ask([planWith()]).items[0].quantity)).toBeGreaterThanOrEqual(0.9);
  });
});

describe('what the card says', () => {
  it('the whole bill, the window and when it closes', () => {
    expect(card()).toMatchObject({
      rupees: '1,240',
      paise: '.50',
      items: '12 items',
      when: 'Thu, 26 Nov · Morning',
      payLabel: 'Pay ₹1,240.50',
      cashAllowed: true,
      shortBy: null,
      totalPaise: '124050',
      closesAtMs: ist('2026-11-25T17:30:00'),
    });
  });
  it('the wallet comes off what is paid, not off the price', () => {
    const c = buildCard({ plan, windows, quote: { ...quote, walletBalancePaise: '24050' }, now });
    expect(c.payLabel).toBe('Pay ₹1,000');
    expect(c.rupees).toBe('1,240');
    const all = buildCard({
      plan,
      windows,
      quote: { ...quote, walletBalancePaise: '999999' },
      now,
    });
    expect(all.payLabel).toBe('Pay from wallet');
  });
  it('says what is missing when the order is under the minimum', () => {
    const q = { ...quote, subtotalPaise: '38000', totalPaise: '40000', meetsMinimum: false };
    expect(buildCard({ plan, windows, quote: q, now }).shortBy).toBe('Add ₹120 more');
  });
  it('no card without a price, an open window that day, or every item', () => {
    expect(buildCard({ plan, windows, quote: null, now })).toBeNull();
    expect(buildCard({ plan: null, windows, quote, now })).toBeNull();
    expect(buildCard({ plan, windows: [], quote, now })).toBeNull();
    expect(
      buildCard({ plan, windows: [{ ...windows[1], date: '2026-11-27' }], quote, now }),
    ).toBeNull();
    expect(buildCard({ plan, windows, quote: { ...quote, missing: ['x'] }, now })).toBeNull();
    expect(
      buildCard({ plan, windows, quote: { ...quote, couponError: { code: 'X' } }, now }),
    ).toBeNull();
    expect(buildCard({ plan, windows, quote, now: ist('2026-11-25T17:30:00') })).toBeNull();
  });
});

describe('when it appears', () => {
  it('two hours before the cut-off, never after 6 pm, and never past midnight', () => {
    const c = ist('2026-11-25T17:30:00');
    expect(popAtFor(c, TOMORROW)).toBe(ist('2026-11-25T15:30:00'));
    // A 3:45 am cut-off on the delivery day: the card closes at midnight and comes up at 6 pm.
    const closes = closesAtFor(ist('2026-11-26T03:45:00'), TOMORROW);
    expect(closes).toBe(ist('2026-11-26T00:00:00'));
    expect(popAtFor(closes, TOMORROW)).toBe(ist('2026-11-25T18:00:00'));
  });

  const base = { known: true, live: [], saved: null, now, canSchedule: true };
  const on = (c, extra = {}) => ({ date: c.date, step: 'ask', state: 'active', ...extra });
  it('shows in its time, waits for it on iOS 26, and stays away before it elsewhere', () => {
    const early = ist('2026-11-25T09:00:00');
    expect(decideIsland({ ...base, card: card() })).toBe('start');
    expect(decideIsland({ ...base, card: card(), now: early })).toBe('schedule');
    expect(decideIsland({ ...base, card: card(), now: early, canSchedule: false })).toBe('none');
  });
  it('is not put up again once swiped away, unless asked for', () => {
    const saved = { date: TOMORROW, sig: 'x', popAt: now - 1 };
    expect(decideIsland({ ...base, card: card(), saved })).toBe('none');
    expect(decideIsland({ ...base, card: card(), saved, force: true })).toBe('start');
    // Scheduled, never shown yet, and gone (an OS restart): schedule it again.
    const later = { date: TOMORROW, sig: 'x', popAt: now + 1 };
    expect(decideIsland({ ...base, card: card(), saved: later, now: now - 36e5 })).toBe('schedule');
  });
  it('changes only when what it says changes', () => {
    const c = card();
    const saved = { date: c.date, sig: cardSignature(c), popAt: now - 1 };
    expect(decideIsland({ ...base, card: c, saved, live: [on(c)] })).toBe('none');
    const dearer = { ...c, totalPaise: '130000' };
    expect(decideIsland({ ...base, card: dearer, saved, live: [on(c)] })).toBe('update');
    expect(decideIsland({ ...base, card: dearer, saved, live: [on(c, { step: 'skipped' })] })).toBe(
      'none',
    );
  });
  it('goes when there is nothing to ask, but not while things are still loading', () => {
    const live = [on(card())];
    expect(decideIsland({ ...base, card: null, live })).toBe('end');
    expect(decideIsland({ ...base, card: null, live, known: false })).toBe('none');
    expect(decideIsland({ ...base, card: null })).toBe('none');
  });
});

describe('its links', () => {
  const saved = { date: TOMORROW, token: 'SECRET', totalPaise: '124050' };
  it('a link without the current token cannot act', () => {
    expect(cardForLink(saved, { date: TOMORROW, token: 'SECRET' })).toBe(saved);
    expect(cardForLink(saved, { date: TOMORROW, token: 'GUESS' })).toBeNull();
    expect(cardForLink(saved, { date: '2026-11-27', token: 'SECRET' })).toBeNull();
    expect(cardForLink(saved, { date: TOMORROW })).toBeNull();
    expect(cardForLink({ date: TOMORROW }, { date: TOMORROW, token: undefined })).toBeNull();
    expect(cardForLink(null, { date: TOMORROW, token: 'SECRET' })).toBeNull();
  });
  it('goes straight through only for the amount the card showed', () => {
    const p = { action: 'cod', card: saved, quote, slotOnDay: true, ordered: false };
    expect(mayAct(p)).toEqual({ go: true });
    expect(mayAct({ ...p, action: 'pay' })).toEqual({ go: true });
    expect(mayAct({ ...p, quote: { ...quote, totalPaise: '124051' } }).go).toBe(false);
    expect(mayAct({ ...p, quote: null }).go).toBe(false);
    expect(mayAct({ ...p, ordered: true }).go).toBe(false);
    expect(mayAct({ ...p, slotOnDay: false }).go).toBe(false);
    expect(mayAct({ ...p, quote: { ...quote, meetsMinimum: false } }).go).toBe(false);
    const noCash = { ...quote, codAllowed: false };
    expect(mayAct({ ...p, quote: noCash }).go).toBe(false);
    expect(mayAct({ ...p, action: 'pay', quote: noCash }).go).toBe(true);
  });
});

describe('the mock server, as the real one', () => {
  const H = { Authorization: 'Bearer test' };
  beforeAll(async () => {
    await handle('POST', '/auth/otp/request', { mobile: '9848000000' });
    await handle('POST', '/auth/otp/verify', { mobile: '9848000000', otp: '123456' });
  });
  it('prices the lines and leaves the basket alone', async () => {
    await handle('PUT', '/cart/items', { productId: 'p_karela', quantity: '1' }, H);
    const before = (await handle('GET', '/cart', null, H)).body.cart;
    const r = await handle(
      'POST',
      '/cart/quote',
      { items: [{ productId: 'p_tomato', quantity: '2' }] },
      H,
    );
    expect(r.status).toBe(200);
    expect(Number(r.body.quote.totalPaise)).toBeGreaterThan(0);
    expect((await handle('GET', '/cart', null, H)).body.cart).toEqual(before);
  });
});
