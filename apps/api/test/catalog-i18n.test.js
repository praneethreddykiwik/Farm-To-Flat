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

  it('translates a product the operator added later, keyed on its name not a seed id', async () => {
    // Products created through the admin panel get a generated id, so an id-keyed map would leave
    // them in English forever. This is the path that catches them.
    const { productName } = await import('../src/lib/i18n.js');
    const added = { id: 'p_cuid_generated', name: 'Rohu Fish', aliases: [] };
    expect(productName(added, 'hi')).toBe('रोहू मछली');
    expect(productName(added, 'te')).toBe('బొచ్చె చేప');
    expect(productName({ id: 'p_x', name: 'ROHU FISH ', aliases: [] }, 'hi')).toBe('रोहू मछली');
    // Something genuinely unknown still falls back to English rather than guessing.
    expect(productName({ id: 'p_y', name: 'Dragonfruit', aliases: [] }, 'te')).toBe('Dragonfruit');
  });

  it('still hides cost and margin, whatever language is being served', async () => {
    const { body } = await request(app).get('/api/v1/catalog').expect(200);
    const blob = JSON.stringify(body);
    expect(blob).not.toContain('costPaise');
    expect(blob).not.toContain('margin');
  });
});
