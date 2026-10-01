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

  // The buy list's own filters used to be built from the rows the filters had already narrowed, so
  // using one destroyed the others: a community with no open orders was missing entirely, and
  // picking Evening rebuilt the slot list from evening-only rows and lost Morning.
  describe('the filter options are fixed, not rebuilt from the filtered rows', () => {
    it('offers every active community, including ones with nothing to buy today', async () => {
      const { body: cs } = await request(app).get('/api/v1/communities');
      const r = await request(app).get('/api/v1/admin/procurement');
      const offered = new Set(r.body.communities.map((c) => c.id));
      for (const c of cs.communities) expect(offered).toContain(c.id);
    });

    it('keeps every slot offered after one of them is picked', async () => {
      const base = await request(app).get('/api/v1/admin/procurement');
      const slots = base.body.windows.map((w) => w.key);
      expect(slots.length).toBeGreaterThan(1); // needs at least morning + evening to be meaningful

      for (const pick of slots) {
        const r = await request(app).get(`/api/v1/admin/procurement?window=${pick}`);
        expect(r.status).toBe(200);
        expect(r.body.windows.map((w) => w.key).sort()).toEqual([...slots].sort());
      }
    });

    it('keeps every community offered after a slot or a day is picked', async () => {
      const base = await request(app).get('/api/v1/admin/procurement');
      const all = base.body.communities.map((c) => c.id).sort();
      const slot = base.body.windows[0]?.key;
      const day = base.body.dates?.[0];
      for (const q of [slot && `window=${slot}`, day && `date=${day}`].filter(Boolean)) {
        const r = await request(app).get(`/api/v1/admin/procurement?${q}`);
        expect(r.body.communities.map((c) => c.id).sort()).toEqual(all);
      }
    });
  });

  it('exports a purchase CSV', async () => {
    const r = await request(app).get('/api/v1/admin/procurement/export.csv');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.text).toContain('To procure');
  });
});
