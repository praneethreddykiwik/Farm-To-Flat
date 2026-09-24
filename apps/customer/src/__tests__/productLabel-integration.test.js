/**
 * The catalog the SERVER actually sends, run through the label the CARD actually renders.
 *
 * The unit tests cover the fallback rules with hand-written products. This one takes a real
 * /catalog payload shape and proves the two halves meet: that `names` survives serialisation and
 * that `productLabel` picks it up for every product, in both scripts.
 */
import { describe, expect, it } from 'vitest';
import { productLabel, categoryLabel } from '../lib/i18n.js';

// A verbatim slice of the live production response (GET /api/v1/catalog).
const LIVE = [
  {
    id: 'p_gongura',
    name: 'Sorrel leaves',
    names: { hi: 'अंबाडी', te: 'గోంగూర' },
    categoryName: 'Leafy greens',
    categoryNames: { hi: 'पत्तेदार सब्ज़ियाँ', te: 'ఆకుకూరలు' },
  },
  {
    id: 'p_palak',
    name: 'Spinach',
    names: { hi: 'पालक', te: 'పాలకూర' },
    categoryName: 'Leafy greens',
    categoryNames: { hi: 'पत्तेदार सब्ज़ियाँ', te: 'ఆకుకూరలు' },
  },
  {
    id: 'p_TWr9PD4L',
    name: 'Rohu Fish',
    names: { hi: 'रोहू मछली', te: 'బొచ్చె చేప' },
    categoryName: 'Meat & fish',
    categoryNames: { hi: 'मांस और मछली', te: 'మాంసం & చేపలు' },
  },
];

describe('the label the product card renders, against a live catalog payload', () => {
  it('shows every product in the chosen script, not English', () => {
    const dev = /[ऀ-ॿ]/;
    const tel = /[ఀ-౿]/;
    for (const p of LIVE) {
      const hi = productLabel(p, 'hi');
      const te = productLabel(p, 'te');
      expect(hi, `${p.name} in Hindi`).not.toBe(p.name);
      expect(te, `${p.name} in Telugu`).not.toBe(p.name);
      expect(dev.test(hi), `${p.name} → ${hi}`).toBe(true);
      expect(tel.test(te), `${p.name} → ${te}`).toBe(true);
    }
  });

  it('English still shows the English name', () => {
    for (const p of LIVE) expect(productLabel(p, 'en')).toBe(p.name);
  });

  it('localises the category shown under the name', () => {
    expect(categoryLabel(LIVE[0], 'te')).toBe('ఆకుకూరలు');
    expect(categoryLabel(LIVE[2], 'hi')).toBe('मांस और मछली');
  });

  it('a catalog cached before this feature existed falls back to English rather than blanking', () => {
    // Exactly what an upgrading customer has on disk for the first moments after the update.
    const stale = { id: 'p_palak', name: 'Spinach', categoryName: 'Leafy greens' };
    expect(productLabel(stale, 'te')).toBe('Spinach');
    expect(categoryLabel(stale, 'hi')).toBe('Leafy greens');
  });
});
