/**
 * Procurement aggregation: grouping, buffer, round-up-to-purchase-unit, and per-product buffer edit.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

describe('procurement buy list', () => {
  it('aggregates open orders by product, buffered and rounded up', async () => {
    const r = await request(app).get('/api/v1/admin/procurement');
    expect(r.status).toBe(200);
    expect(r.body.skuCount).toBeGreaterThan(0);
    expect(Number(r.body.totalProcureCostPaise)).toBeGreaterThan(0);

    for (const group of r.body.byCategory) {
      for (const it of group.items) {
        const required = Number(it.requiredQty);
        const procure = Number(it.procureQty);
        // buffer means you always buy at least what's ordered
        expect(procure).toBeGreaterThanOrEqual(required);
        // rounded to a purchase unit: KG in halves, everything else whole
        const step = it.unit === 'KG' ? 0.5 : 1;
        expect(Math.abs(procure / step - Math.round(procure / step))).toBeLessThan(1e-6);
      }
    }
  });

  it('summarises spend by farm/source and totals reconcile', async () => {
    const r = await request(app).get('/api/v1/admin/procurement');
    const bySource = r.body.bySource.reduce((s, f) => s + Number(f.procureCostPaise), 0);
    const byCategory = r.body.byCategory.reduce((s, g) => s + Number(g.subtotalPaise), 0);
    expect(bySource).toBe(Number(r.body.totalProcureCostPaise));
    expect(byCategory).toBe(Number(r.body.totalProcureCostPaise));
  });

  it('raising a product buffer raises how much to procure', async () => {
    const first = await request(app).get('/api/v1/admin/procurement');
    const line = first.body.byCategory
      .flatMap((g) => g.items)
      .find((i) => Number(i.requiredQty) > 0);
    const before = Number(line.procureQty);
    await request(app).patch(`/api/v1/admin/products/${line.productId}`).send({ bufferPct: 90 });
    const after = await request(app).get('/api/v1/admin/procurement');
    const line2 = after.body.byCategory
      .flatMap((g) => g.items)
      .find((i) => i.productId === line.productId);
    expect(Number(line2.procureQty)).toBeGreaterThanOrEqual(before);
    expect(line2.bufferPct).toBe(90);
  });

  it('exports a purchase CSV', async () => {
    const r = await request(app).get('/api/v1/admin/procurement/export.csv');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.text).toContain('To procure');
  });
});
