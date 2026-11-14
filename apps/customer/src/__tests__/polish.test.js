/** Small wording helpers from the November polish pass. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/i18n', () => ({ t: (k) => k }));
const { arrivalPhrase, friendlyHours, todayISO, addDaysISO } = await import('../lib/dates');
const { farmShort } = await import('../lib/farm');

describe('when an order arrives', () => {
  it('says "this morning" for today, not "today morning"', () => {
    expect(arrivalPhrase(todayISO(), 'Morning')).toBe('this morning');
  });
  it('says "tomorrow morning" for tomorrow', () => {
    expect(arrivalPhrase(addDaysISO(todayISO(), 1), 'Morning')).toBe('tomorrow morning');
  });
  it('keeps a window the operator named themselves', () => {
    expect(arrivalPhrase(todayISO(), 'Early run')).toBe('today, early run');
  });
  it('gives the date further out', () => {
    expect(arrivalPhrase(addDaysISO(todayISO(), 4), 'Morning')).toMatch(
      /^\w{3}, \d{1,2} \w{3}, morning$/,
    );
  });
});

describe('a farm name on a card', () => {
  it('drops the word that only tells the operator what kind of source it is', () => {
    expect(farmShort('Shamshabad belt')).toBe('Shamshabad');
    expect(farmShort('Ooty sourcing')).toBe('Ooty');
    expect(farmShort('Market sourcing')).toBe('Market');
    expect(farmShort('Chevella')).toBe('Chevella');
  });
  it('is empty for nothing', () => {
    expect(farmShort(null)).toBe('');
    expect(farmShort('  ')).toBe('');
  });
});

describe('delivery hours', () => {
  it('reads 24-hour times as am/pm', () => {
    expect(friendlyHours('6:00 – 12:00')).toBe('6 am – 12 pm');
    expect(friendlyHours('17:30 – 20:00')).toBe('5:30 pm – 8 pm');
  });
  it('leaves times that already say am or pm alone', () => {
    expect(friendlyHours('6:00 am – 12:00 pm')).toBe('6:00 am – 12:00 pm');
  });
});
