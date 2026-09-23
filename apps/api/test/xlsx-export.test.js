/**
 * The buyer's purchase list must be a real spreadsheet, and must honour every filter the screen
 * offers — a list forwarded to the market must not be mistakable for another day's run.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('purchase list export', () => {
  it('returns a real .xlsx workbook, not a CSV', async () => {
    const r = await request(app).get('/api/v1/admin/procurement/export.xlsx').responseType('blob');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe(XLSX_TYPE);
    expect(r.headers['content-disposition']).toMatch(/\.xlsx"$/);
    // Every xlsx is a zip — "PK" is the signature. A CSV would not have it.
    expect(Buffer.from(r.body).subarray(0, 2).toString()).toBe('PK');
  });

  it('names the file for the language and the delivery day it was built for', async () => {
    const r = await request(app)
      .get('/api/v1/admin/procurement/export.xlsx?lang=te&date=2026-09-26')
      .responseType('blob');
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain('f2f-purchase-list-te-2026-09-26');
  });

  it('honours the community filter', async () => {
    const all = await request(app).get('/api/v1/admin/procurement').expect(200);
    expect(Array.isArray(all.body.communities)).toBe(true);
    const cid = all.body.communities[0]?.id;
    if (!cid) return;
    const one = await request(app).get(`/api/v1/admin/procurement?communityId=${cid}`).expect(200);
    expect(one.body.filters.communityId).toBe(cid);
    // Narrowing to one community can never need MORE produce than every community together.
    expect(one.body.skuCount).toBeLessThanOrEqual(all.body.skuCount);
    // The filter list itself must not collapse to the chosen one, or you cannot switch back.
    expect(one.body.communities.length).toBe(all.body.communities.length);
    const r = await request(app)
      .get(`/api/v1/admin/procurement/export.xlsx?communityId=${cid}`)
      .responseType('blob');
    expect(r.status).toBe(200);
    expect(Buffer.from(r.body).subarray(0, 2).toString()).toBe('PK');
  });

  it('still honours the window filter', async () => {
    const r = await request(app).get('/api/v1/admin/procurement?window=MORNING').expect(200);
    expect(r.body.filters.window).toBe('MORNING');
  });
});

describe('packing sheet & driver manifest export', () => {
  const XT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  it('packing sheet is a real workbook', async () => {
    const r = await request(app).get('/api/v1/admin/orders/export.xlsx').responseType('blob');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe(XT);
    expect(Buffer.from(r.body).subarray(0, 2).toString()).toBe('PK');
    expect(r.headers['content-disposition']).toContain('f2f-packing-');
  });
  it('manifest is a real workbook', async () => {
    const r = await request(app)
      .get('/api/v1/admin/orders/export.xlsx?type=manifest')
      .responseType('blob');
    expect(r.status).toBe(200);
    expect(Buffer.from(r.body).subarray(0, 2).toString()).toBe('PK');
    expect(r.headers['content-disposition']).toContain('f2f-manifest-');
  });
});
