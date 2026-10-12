import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { degradedGuard, masterDataProblem } from '../src/lib/degraded.js';

/**
 * The guard that stops the API selling from a catalogue we do not stock.
 *
 * Tested as the middleware rather than through the real app, because persistEnabled is hard-false
 * under NODE_ENV=test — a supertest against the app would pass whether the guard worked or not,
 * which is worse than no test.
 */
function appWith({ configured, healthy }) {
  const app = express();
  app.use(
    '/api/v1',
    degradedGuard(
      () => configured,
      () => healthy,
    ),
  );
  app.get('/api/v1/catalog', (_q, r) => r.json({ products: [] }));
  app.post('/api/v1/orders', (_q, r) => r.json({ ok: true }));
  app.get('/api/v1/health', (_q, r) => r.json({ service: 'f2f-api' }));
  return app;
}

describe('while the database is unavailable', () => {
  const down = { configured: true, healthy: false };

  it('refuses the catalogue instead of serving the seed one', async () => {
    const r = await request(appWith(down)).get('/api/v1/catalog');
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('SERVICE_DEGRADED');
  });

  it('refuses an order — this is the one that was taking real money', async () => {
    // A customer could check out and pay through the live Razorpay account for an order held only
    // in memory, which the next deploy or spin-down would destroy.
    const r = await request(appWith(down)).post('/api/v1/orders').send({});
    expect(r.status).toBe(503);
  });

  it('still answers /health, because that is how anyone finds out', async () => {
    const r = await request(appWith(down)).get('/api/v1/health');
    expect(r.status).toBe(200);
  });

  it('says something a customer can act on, not a stack trace', async () => {
    const r = await request(appWith(down)).get('/api/v1/catalog');
    expect(r.body.error.message).toMatch(/try again/i);
  });
});

describe('while the database is fine', () => {
  it('lets everything through', async () => {
    const app = appWith({ configured: true, healthy: true });
    expect((await request(app).get('/api/v1/catalog')).status).toBe(200);
    expect((await request(app).post('/api/v1/orders').send({})).status).toBe(200);
  });
});

describe('with no database configured at all', () => {
  it('lets everything through — dev and the mock server must keep working', async () => {
    const app = appWith({ configured: false, healthy: false });
    expect((await request(app).get('/api/v1/catalog')).status).toBe(200);
  });
});

describe('reaching a database and finding nothing', () => {
  /**
   * The hole the 503 guard did not cover. loadAll() throws when a query FAILS, so a refused
   * connection was handled — but a connection to a blank schema, the wrong DATABASE_URL, or a
   * half-finished restore returns empty arrays and looks like success. hydrate() then leaves the
   * SEED categories in place beside an empty product list, and /health says "database".
   */
  const ok = { products: [{}], communities: [{}], categories: [{}] };

  it('accepts a load that actually has a shop in it', () => {
    expect(masterDataProblem(ok)).toBeNull();
  });

  it('refuses a load with no products', () => {
    expect(masterDataProblem({ ...ok, products: [] })).toMatch(/products=0/);
  });

  it('refuses a load with no communities — this is the 3-vs-8 symptom', () => {
    expect(masterDataProblem({ ...ok, communities: [] })).toMatch(/communities=0/);
  });

  it('refuses a load with no categories, which hydrate() would silently keep seeded', () => {
    expect(masterDataProblem({ ...ok, categories: [] })).toMatch(/categories=0/);
  });

  it('refuses an entirely empty load and names every missing part', () => {
    const why = masterDataProblem({ products: [], communities: [], categories: [] });
    expect(why).toMatch(/products=0/);
    expect(why).toMatch(/communities=0/);
    expect(why).toMatch(/categories=0/);
  });

  it('refuses undefined rather than treating absence as emptiness-is-fine', () => {
    expect(masterDataProblem({})).toBeTruthy();
    expect(masterDataProblem(null)).toBeTruthy();
  });
});
