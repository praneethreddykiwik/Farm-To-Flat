/**
 * Contract + non-negotiable-rule tests. Run with `pnpm --filter @f2f/api test`.
 * NODE_ENV=test keeps the app from binding a port (see src/index.js).
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

describe('health', () => {
  it('is alive', async () => {
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});

describe('public catalog (frozen contract)', () => {
  it('returns categories + products with paise strings', async () => {
    const r = await request(app).get('/api/v1/catalog');
    expect(r.status).toBe(200);
    expect(r.body.products.length).toBeGreaterThan(40);
    const p = r.body.products[0];
    expect(typeof p.pricePaise).toBe('string'); // money crosses the wire as a string
    expect(p).toHaveProperty('categoryName');
    expect(p).toHaveProperty('tint');
  });

  it('NON-NEGOTIABLE: never leaks cost or margin to customers', async () => {
    const r = await request(app).get('/api/v1/catalog');
    const banned = [
      'costPaise',
      'margin',
      'marginPaise',
      'marginPct',
      'procurementCost',
      'consumablesCost',
    ];
    for (const p of r.body.products) {
      for (const key of banned) expect(p, `product leaked ${key}`).not.toHaveProperty(key);
    }
  });

  it('alias search tolerates the vernacular + misspellings', async () => {
    const r = await request(app).get('/api/v1/catalog/search?q=karela');
    expect(r.body.products[0].name).toBe('Bitter gourd');
    const r2 = await request(app).get('/api/v1/catalog/search?q=tamatar');
    expect(r2.body.products[0].name).toBe('Tomato');
  });

  it('404s an unknown product with the contract error shape', async () => {
    const r = await request(app).get('/api/v1/catalog/p_nope');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });
});

describe('delivery windows', () => {
  it('returns a 14-day schedule with capacity', async () => {
    const r = await request(app).get('/api/v1/delivery-windows');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.windows)).toBe(true);
    const w = r.body.windows[0];
    expect(w).toMatchObject({ window: expect.any(String), capacity: expect.any(Number) });
  });
});

describe('admin catalog (operator only)', () => {
  it('DOES expose cost + margin (the operator needs to price)', async () => {
    const r = await request(app).get('/api/v1/admin/products');
    const p = r.body.products[0];
    expect(p).toHaveProperty('costPaise');
    expect(p).toHaveProperty('marginPct');
    expect(typeof p.costPaise).toBe('string');
  });

  it('validates create input with Zod (422 on bad body)', async () => {
    const r = await request(app).post('/api/v1/admin/products').send({ name: '' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('VALIDATION');
  });

  it('creates, updates and deletes a product', async () => {
    const create = await request(app).post('/api/v1/admin/products').send({
      name: 'Test kohlrabi',
      category: 'cat_veg',
      unit: 'KG',
      increment: '0.25',
      pricePaise: 4000,
      costPaise: 2600,
      dailyCap: 20,
    });
    expect(create.status).toBe(201);
    const id = create.body.product.id;
    expect(create.body.product.marginPct).toBe(35);

    const patch = await request(app)
      .patch(`/api/v1/admin/products/${id}`)
      .send({ pricePaise: 5000 });
    expect(patch.body.product.pricePaise).toBe('5000');

    const del = await request(app).delete(`/api/v1/admin/products/${id}`);
    expect(del.body.ok).toBe(true);
  });
});

describe('admin orders + fulfilment', () => {
  it('lists orders with status counts', async () => {
    const r = await request(app).get('/api/v1/admin/orders');
    expect(r.body.total).toBeGreaterThan(0);
    expect(r.body.counts).toHaveProperty('CONFIRMED');
  });

  it('enforces the fulfilment state machine', async () => {
    const list = await request(app).get('/api/v1/admin/orders?status=CONFIRMED');
    const order = list.body.orders[0];
    // legal: CONFIRMED -> PACKING
    const ok = await request(app)
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .send({ status: 'PACKING' });
    expect(ok.status).toBe(200);
    // illegal: PACKING -> DELIVERED (must go OUT_FOR_DELIVERY first)
    const bad = await request(app)
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .send({ status: 'DELIVERED' });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('exports a packing CSV', async () => {
    const r = await request(app).get('/api/v1/admin/orders/export.csv?type=packing');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.text.split('\r\n')[0]).toContain('Product');
  });
});
