import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

/**
 * The API must forbid client caching, because a client that caches it showed customers the wrong
 * shop for a day.
 *
 * Express sends an ETag and no Cache-Control, and that pair permits HEURISTIC freshness: a client
 * may reuse a stored response without revalidating. Android's HTTP stack does. So when the API was
 * answering out of the seed catalogue during a database outage, phones stored that and kept showing
 * it — three communities instead of eight, the wrong photographs, no non-veg — long after the
 * server had recovered. Clearing the app's data fixed it instantly, which is how we know.
 */
describe('cacheability of API answers', () => {
  it('forbids storing the catalogue', async () => {
    const r = await request(app).get('/api/v1/catalog');
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('forbids storing the community list — the one that showed 3 instead of 8', async () => {
    const r = await request(app).get('/api/v1/communities');
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('still lets media be cached, which is the whole point of media', async () => {
    const r = await request(app).get('/api/v1/media/issue/not-a-real-token');
    expect(r.headers['cache-control']).not.toBe('no-store');
  });
});
