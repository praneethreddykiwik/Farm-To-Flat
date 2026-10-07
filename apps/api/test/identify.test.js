import { describe, expect, it } from 'vitest';
import { catalogueForPrompt, parseReply, resolve, systemPrompt } from '../src/lib/identify.js';

const PRODUCTS = [
  { id: 'p_tomato', name: 'Tomato', aliases: ['tamata', 'టమాటా'] },
  { id: 'p_palak', name: 'Spinach', aliases: ['palakura', 'palak', 'పాలకూర'] },
  { id: 'p_thota', name: 'Amaranth', aliases: ['thotakura', 'chaulai'] },
];

describe('the prompt we pay for on every photograph', () => {
  it('lists every product as id + name + aliases', () => {
    const c = catalogueForPrompt(PRODUCTS);
    expect(c).toContain('p_tomato\tTomato (tamata, టమాటా)');
    expect(c.split('\n')).toHaveLength(3);
  });

  it('tells the model never to invent an id', () => {
    expect(systemPrompt(PRODUCTS)).toContain('Never invent one');
  });
});

describe('parsing the model reply', () => {
  it('reads a well-formed answer', () => {
    expect(parseReply('{"label":"Tomato","productId":"p_tomato","confidence":0.9}')).toEqual({
      label: 'Tomato',
      productId: 'p_tomato',
      confidence: 0.9,
    });
  });

  it('never throws on malformed output', () => {
    for (const bad of ['', 'not json', '{', '[]', 'null'])
      expect(() => parseReply(bad)).not.toThrow();
    expect(parseReply('garbage').productId).toBeNull();
  });

  it('clamps a confidence outside 0..1 instead of trusting it', () => {
    expect(parseReply('{"confidence":5}').confidence).toBe(1);
    expect(parseReply('{"confidence":-2}').confidence).toBe(0);
    expect(parseReply('{"confidence":"high"}').confidence).toBe(0);
  });
});

describe('resolving against the real catalogue', () => {
  it('accepts an id that exists', () => {
    const r = resolve(PRODUCTS, { label: 'Tomato', productId: 'p_tomato', confidence: 0.9 });
    expect(r.product.id).toBe('p_tomato');
    expect(r.via).toBe('id');
  });

  it('REFUSES an invented id and falls back to searching the label', () => {
    const r = resolve(PRODUCTS, {
      label: 'tomato',
      productId: 'p_does_not_exist',
      confidence: 0.95,
    });
    expect(r.product.id).toBe('p_tomato');
    expect(r.via).toBe('search');
    // A search hit is a weaker claim than the model naming the id outright.
    expect(r.confidence).toBeLessThanOrEqual(0.6);
  });

  it('finds the product from a Telugu label', () => {
    expect(resolve(PRODUCTS, { label: 'టమాటా', productId: null, confidence: 0.8 }).product.id).toBe(
      'p_tomato',
    );
  });

  it('finds the product from a transliterated label', () => {
    expect(
      resolve(PRODUCTS, { label: 'palakura', productId: null, confidence: 0.8 }).product.id,
    ).toBe('p_palak');
  });

  it('returns nothing for produce we do not stock', () => {
    const r = resolve(PRODUCTS, { label: 'dragonfruit', productId: null, confidence: 0.9 });
    expect(r.product).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.via).toBe('none');
  });

  it('returns nothing when the photo is not produce at all', () => {
    expect(
      resolve(PRODUCTS, { label: 'a laptop', productId: null, confidence: 0 }).product,
    ).toBeNull();
  });

  it('does not offer the matched product as its own alternative', () => {
    const r = resolve(PRODUCTS, { label: 'tomato', productId: 'p_tomato', confidence: 0.9 });
    expect(r.alternatives.map((p) => p.id)).not.toContain('p_tomato');
  });
});
