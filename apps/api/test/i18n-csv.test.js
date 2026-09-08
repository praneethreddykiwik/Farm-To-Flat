/**
 * Localised procurement CSV — English / Hindi / Telugu headers, translated units + names, BOM.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

describe('procurement CSV localisation', () => {
  it('defaults to English', async () => {
    const r = await request(app).get('/api/v1/admin/procurement/export.csv');
    expect(r.status).toBe(200);
    expect(r.text).toContain('Category,Product,Source');
  });

  it('translates the header + units + names into Hindi', async () => {
    const r = await request(app).get('/api/v1/admin/procurement/export.csv?lang=hi');
    expect(r.text).toContain('श्रेणी'); // "Category"
    expect(r.text).toContain('उत्पाद'); // "Product"
  });

  it('translates into Telugu using catalog aliases', async () => {
    const r = await request(app).get('/api/v1/admin/procurement/export.csv?lang=te');
    expect(r.text).toContain('వర్గం'); // "Category"
    expect(r.text).toContain('ఉత్పత్తి'); // "Product"
  });

  it('starts with a UTF-8 BOM so Excel renders the scripts', async () => {
    const r = await request(app).get('/api/v1/admin/procurement/export.csv?lang=te');
    expect(r.text.charCodeAt(0)).toBe(0xfeff);
  });

  it('falls back to English for an unknown lang', async () => {
    const r = await request(app).get('/api/v1/admin/procurement/export.csv?lang=xx');
    expect(r.text).toContain('Category,Product,Source');
  });
});
