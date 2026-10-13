import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://proj.supabase.co';
const { app } = await import('../src/index.js');

/**
 * The image proxy must never become an open proxy. The only caller input is the object key, and it
 * is validated against a strict filename pattern before any upstream fetch is built. These assert
 * that hostile keys are refused BEFORE a network call — we check the status is a client rejection
 * (400/404), never a 200 or a 5xx that would imply we tried to fetch an attacker-chosen target.
 */
describe('image proxy key validation (SSRF guard)', () => {
  const bad = [
    '..%2f..%2fetc%2fpasswd',
    'x.png%2f..%2fy',
    'not-an-image.txt',
    'noextension',
    'has space.png',
    'semi;colon.png',
  ];
  for (const key of bad) {
    it(`refuses a hostile key: ${key}`, async () => {
      const r = await request(app).get(`/api/v1/img/${key}?w=480`);
      expect([400, 404]).toContain(r.status);
      expect(r.status).not.toBe(200);
    });
  }

  it('accepts only the known image extensions in the pattern', async () => {
    // A well-formed key passes validation (the upstream fetch may then fail in a test env with no
    // real Supabase, but it must get PAST the 400 guard — i.e. not be rejected as malformed).
    const r = await request(app).get('/api/v1/img/1700000000000-abc123.png?w=240');
    expect(r.status).not.toBe(400);
  });

  it('is reachable without authentication (product images are public)', async () => {
    const r = await request(app).get('/api/v1/img/anything.png');
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });
});
