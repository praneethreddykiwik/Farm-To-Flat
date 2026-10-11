import { describe, expect, it } from 'vitest';
import { normalise, search } from '../src/lib/search.js';

/**
 * A customer typing in Hindi got nothing at all, and nothing in the system said so.
 *
 * normalise() whitelisted Latin, digits and Telugu. Every Devanagari character fell outside it and
 * was stripped, so a Hindi query did not become "a query with no results" — it became the EMPTY
 * STRING, and search returns [] for that before it looks at a single product. The Hindi aliases
 * sitting on products had never been reachable, while the Telugu aliases beside them worked.
 */
const products = [
  { id: '1', name: 'Mutton Keema', aliases: ['keema', 'qeema', 'कीमा', 'మటన్ కీమా'] },
  { id: '2', name: 'Mutton paya', aliases: ['paya', 'trotters', 'पाया', 'మటన్ పాయా'] },
];

describe('searching in the scripts customers actually type', () => {
  it('finds a product by its Hindi alias', () => {
    expect(search(products, 'कीमा').map((p) => p.name)).toEqual(['Mutton Keema']);
    expect(search(products, 'पाया').map((p) => p.name)).toEqual(['Mutton paya']);
  });

  it('still finds a product by its Telugu alias', () => {
    expect(search(products, 'మటన్ పాయా').map((p) => p.name)).toEqual(['Mutton paya']);
  });

  it('still finds a product in English', () => {
    expect(search(products, 'qeema').map((p) => p.name)).toEqual(['Mutton Keema']);
    expect(search(products, 'trotters').map((p) => p.name)).toEqual(['Mutton paya']);
  });

  it('does not silently throw a non-Latin query away', () => {
    // The actual bug: the query survived as '' and search bailed before looking at anything.
    expect(normalise('कीमा')).not.toBe('');
    expect(normalise('పాయా')).not.toBe('');
  });

  it('still strips punctuation and emoji, which is what the filter is for', () => {
    expect(normalise('to!ma@to 🍅')).toBe('tomato');
  });
});
