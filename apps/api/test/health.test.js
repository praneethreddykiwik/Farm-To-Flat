/**
 * The health probe has to distinguish "no database by design" from "a database it cannot reach".
 *
 * This exists because of a real incident: a deploy shipped a Prisma client selecting a column the
 * database did not have, boot hydration threw, and the API fell back to the in-memory demo seed with
 * persistence off. It answered `{ ok: true }` throughout and served demo products and communities as
 * if they were real. Render happily promoted the deploy. Nothing flagged it.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const persistence = await import('../src/persistence.js');

describe('GET /health', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is healthy in a process that was never given a database', async () => {
    // The test env has no DATABASE_URL. Serving from memory is what it is *for*, so calling it
    // unhealthy would fire on every local run and teach everyone to ignore the signal.
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, data: 'in-memory' });
  });

  it('reports 503 when a database was configured but hydration left it unused', async () => {
    // The production shape: DATABASE_URL is set, so the process is MEANT to be database-backed,
    // but boot hydration failed and disabled persistence.
    vi.spyOn(persistence, 'persistEnabled', 'get').mockReturnValue(true);
    vi.spyOn(persistence, 'isPersistenceEnabled').mockReturnValue(false);

    const r = await request(app).get('/health');
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    // The body has to say WHY, because the next person reads this from a dashboard, not a debugger.
    expect(r.body.data).toMatch(/DATABASE UNAVAILABLE/);
  });

  it('is healthy when the configured database is actually in use', async () => {
    vi.spyOn(persistence, 'persistEnabled', 'get').mockReturnValue(true);
    vi.spyOn(persistence, 'isPersistenceEnabled').mockReturnValue(true);

    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, data: 'database' });
  });
});
