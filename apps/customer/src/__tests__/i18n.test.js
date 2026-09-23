/**
 * Reading language.
 *
 * The rule that matters most: a missing translation falls back to English rather than a blank or a
 * guess. A shopper seeing "Spinach" when they asked for Telugu is a small disappointment; a blank
 * row, or the wrong vegetable, is a broken shop.
 */
import { describe, expect, it } from 'vitest';
import { LANGUAGES, RAIL_WORDS, categoryLabel, isLanguage, productLabel, t } from '../lib/i18n.js';

const spinach = {
  name: 'Spinach',
  names: { hi: 'पालक', te: 'పాలకూర' },
  categoryName: 'Leafy greens',
  categoryNames: { hi: 'पत्तेदार सब्ज़ियाँ', te: 'ఆకుకూరలు' },
};

describe('language selection', () => {
  it('offers exactly the three languages, each written in its own script', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'hi', 'te']);
    expect(LANGUAGES.find((l) => l.code === 'te').native).toBe('తెలుగు');
    expect(LANGUAGES.find((l) => l.code === 'hi').native).toBe('हिंदी');
  });

  it('rejects anything that is not one of them', () => {
    expect(isLanguage('en')).toBe(true);
    expect(isLanguage('ta')).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });

  it('shows the product name in the chosen language', () => {
    expect(productLabel(spinach, 'te')).toBe('పాలకూర');
    expect(productLabel(spinach, 'hi')).toBe('पालक');
    expect(productLabel(spinach, 'en')).toBe('Spinach');
  });

  it('falls back to English when a product has no translation', () => {
    const untranslated = { name: 'Capsicum', names: {} };
    expect(productLabel(untranslated, 'te')).toBe('Capsicum');
    expect(productLabel(untranslated, 'hi')).toBe('Capsicum');
    // …and when the server sends no `names` at all (an older API, or the mock server).
    expect(productLabel({ name: 'Okra' }, 'te')).toBe('Okra');
  });

  it('never returns undefined for a product with no name at all', () => {
    expect(productLabel(undefined, 'te')).toBe('');
    expect(productLabel({}, 'en')).toBe('');
  });

  it('localises the category the same way', () => {
    expect(categoryLabel(spinach, 'te')).toBe('ఆకుకూరలు');
    expect(categoryLabel({ categoryName: 'Gourds' }, 'hi')).toBe('Gourds');
  });

  it('falls back to English for an interface string, and to the key itself if unknown', () => {
    expect(t('soldOut', 'te')).toBe('ఈరోజు అయిపోయింది');
    expect(t('soldOut', 'xx')).toBe('Sold out today');
    expect(t('noSuchKey', 'en')).toBe('noSuchKey');
  });

  it('has every rail phrase in all three languages, so the loop never shows a gap', () => {
    expect(RAIL_WORDS.length).toBeGreaterThan(0);
    for (const w of RAIL_WORDS) {
      expect(w.en?.length).toBeGreaterThan(0);
      expect(w.hi?.length).toBeGreaterThan(0);
      expect(w.te?.length).toBeGreaterThan(0);
    }
  });

  it('writes Hindi in Devanagari and Telugu in Telugu script, not romanised', () => {
    const devanagari = /[ऀ-ॿ]/;
    const telugu = /[ఀ-౿]/;
    for (const w of RAIL_WORDS) {
      expect(devanagari.test(w.hi)).toBe(true);
      expect(telugu.test(w.te)).toBe(true);
    }
    expect(devanagari.test(t('addToBasket', 'hi'))).toBe(true);
    expect(telugu.test(t('addToBasket', 'te'))).toBe(true);
  });
});
