/**
 * Tests for the analytics + order-simulation endpoints added for the admin stats page and the
 * live fulfilment board.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

describe('admin analytics', () => {
  it('compares every community with revenue, cost, profit and margin', async () => {
    const r = await request(app).get('/api/v1/admin/analytics');
    expect(r.status).toBe(200);
    expect(r.body.communities.length).toBe(3);
    for (const c of r.body.communities) {
      expect(c).toHaveProperty('revenuePaise');
      expect(c).toHaveProperty('costPaise');
      expect(c).toHaveProperty('profitPaise');
      expect(c).toHaveProperty('marginPct');
      expect(c).toHaveProperty('aovPaise');
      // profit = revenue - cost
      expect(Number(c.profitPaise)).toBe(Number(c.revenuePaise) - Number(c.costPaise));
    }
    expect(r.body.revenueByDay).toHaveLength(14);
    expect(r.body.leaders).toHaveProperty('revenue');
  });
});

describe('order simulation (auto-listing demo)', () => {
  it('creates a CONFIRMED order that then shows in the list', async () => {
    const before = (await request(app).get('/api/v1/admin/orders')).body.total;
    const sim = await request(app).post('/api/v1/admin/orders/simulate');
    expect(sim.status).toBe(201);
    expect(sim.body.order.status).toBe('CONFIRMED');
    expect(sim.body.order.itemCount).toBeGreaterThan(0);
    const after = (await request(app).get('/api/v1/admin/orders')).body.total;
    expect(after).toBe(before + 1);
  });
});
