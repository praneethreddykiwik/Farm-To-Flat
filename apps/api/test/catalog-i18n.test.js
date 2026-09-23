/**
 * The catalog carries every language with every product, so the app can switch instantly, works
 * offline on the cached catalog, and one shopper changing language cannot evict another's cache.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

const devanagari = /[ऀ-ॿ]/;
const telugu = /[ఀ-౿]/;

describe('catalog localisation', () => {
  it('ships Hindi and Telugu names with the products', async () => {
    const { body } = await request(app).get('/api/v1/catalog').expect(200);
    const p = body.products.find((x) => x.name === 'Spinach');
    expect(p.names.hi).toBe('पालक');
    expect(p.names.te).toBe('పాలకూర');
    expect(p.categoryNames.te).toBeTruthy();
  });

  it('covers the whole catalog in both scripts, not a handful of products', async () => {
    const { body } = await request(app).get('/api/v1/catalog').expect(200);
    const missingHi = body.products.filter((p) => !p.names?.hi);
    const missingTe = body.products.filter((p) => !p.names?.te);
    expect(missingHi, `no Hindi: ${missingHi.map((p) => p.name).join(', ')}`).toHaveLength(0);
    expect(missingTe, `no Telugu: ${missingTe.map((p) => p.name).join(', ')}`).toHaveLength(0);
  });

  it('uses the real scripts rather than romanised spellings', async () => {
    const { body } = await request(app).get('/api/v1/catalog').expect(200);
    for (const p of body.products) {
      expect(devanagari.test(p.names.hi), `${p.name} hi=${p.names.hi}`).toBe(true);
      expect(telugu.test(p.names.te), `${p.name} te=${p.names.te}`).toBe(true);
    }
  });

  it('still hides cost and margin, whatever language is being served', async () => {
    const { body } = await request(app).get('/api/v1/catalog').expect(200);
    const blob = JSON.stringify(body);
    expect(blob).not.toContain('costPaise');
    expect(blob).not.toContain('margin');
  });
});
