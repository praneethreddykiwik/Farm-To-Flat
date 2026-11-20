/**
 * Review #26 (21 Nov 2026): every request used to be JSON-parsed with an 8 MB limit before auth and
 * before the global rate limit. Now the limiter runs first, the default limit is 32 KB, and 8 MB is
 * allowed only on the photo routes, after sign-in.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

const KB = 1024;
const body = (bytes) => JSON.stringify({ pad: 'a'.repeat(bytes) });
const post = (path) => request(app).post(path).set('content-type', 'application/json');

async function token(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  return v.body.accessToken;
}

describe('body limits', () => {
  it('refuses more than 32 KB on an ordinary signed-in route', async () => {
    const t = await token('9666000001');
    const r = await post('/api/v1/orders')
      .set('Authorization', `Bearer ${t}`)
      .send(body(64 * KB));
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('does not read the body on a photo route until the caller is signed in', async () => {
    // Malformed JSON: if the parser ran first this would be 400 BAD_JSON. 401 means auth ran first
    // and the body was never parsed. (A real >8 MB body would race the early 401 on the socket.)
    for (const path of [
      '/api/v1/ai/identify',
      '/api/v1/meals/log',
      '/api/v1/meals/abc/photo',
      '/api/v1/orders/ord_x/issue',
    ]) {
      const r = await post(path).send('{bad json');
      expect(r.status, path).toBe(401);
    }
  });

  it('accepts a photo-sized body on the photo routes once signed in', async () => {
    const t = await token('9666000002');
    for (const path of ['/api/v1/meals/abc/photo', '/api/v1/orders/ord_missing/issue']) {
      const r = await post(path)
        .set('Authorization', `Bearer ${t}`)
        .send(body(2048 * KB));
      expect(r.status, path).not.toBe(413);
    }
  });

  it('a meal plan may be larger than 32 KB (the route caps it at 600 KB)', async () => {
    const t = await token('9666000003');
    const r = await request(app)
      .put('/api/v1/meals/plan')
      .set('Authorization', `Bearer ${t}`)
      .send({ profile: { note: 'a'.repeat(100 * KB) }, scheduled: [] });
    expect(r.status).not.toBe(413);
  });

  it('admin: sign-in stays at 32 KB; the console reads larger bodies after auth', async () => {
    const signIn = await post('/api/v1/admin/auth/google').send(body(64 * KB));
    expect(signIn.status).toBe(413);
    // Tests run with no ADMIN_TOKEN, so the console is open (dev SUPER_ADMIN).
    const upload = await post('/api/v1/admin/products/upload-image').send(body(2048 * KB));
    expect(upload.status).not.toBe(413);
    const other = await post('/api/v1/admin/products').send(body(200 * KB));
    expect(other.status).not.toBe(413);
  });
});

describe('the global rate limit runs before any body is parsed', () => {
  // The limiter is switched off under NODE_ENV=test (lib/rate-limit.js), so the order is pinned
  // structurally: the global limiter must be registered before the first JSON parser is.
  it('is mounted above every express.json()', () => {
    const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
    const limiter = src.indexOf('key: (req) => `all:${ipOf(req)}`');
    const firstParser = src.search(/app\.use\([^)]*json(32k|1mb|8mb)|express\.json\(/);
    expect(limiter).toBeGreaterThan(0);
    expect(firstParser).toBeGreaterThan(0);
    expect(limiter).toBeLessThan(firstParser);
  });
});
