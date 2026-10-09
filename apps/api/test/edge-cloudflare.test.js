import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { clientIp, originLockEnabled, requireCloudflare, viaCloudflare } from '../src/lib/edge.js';

const SECRET = 'a-shared-secret-of-some-length';

/** A minimal app with the lock mounted exactly where index.js mounts it: before everything. */
function appWith() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(requireCloudflare);
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/v1/thing', (req, res) => res.json({ ip: clientIp(req), via: viaCloudflare(req) }));
  return app;
}

const before = process.env.ORIGIN_SHARED_SECRET;
beforeEach(() => {
  process.env.ORIGIN_SHARED_SECRET = SECRET;
});
afterEach(() => {
  if (before === undefined) delete process.env.ORIGIN_SHARED_SECRET;
  else process.env.ORIGIN_SHARED_SECRET = before;
});

describe('the origin lock', () => {
  it('lets through a request carrying the shared secret', async () => {
    const r = await request(appWith()).get('/api/v1/thing').set('x-origin-secret', SECRET);
    expect(r.status).toBe(200);
    expect(r.body.via).toBe(true);
  });

  it('refuses a request that went straight to the origin', async () => {
    const r = await request(appWith()).get('/api/v1/thing');
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('DIRECT_ORIGIN_ACCESS');
  });

  it('refuses a wrong secret', async () => {
    const r = await request(appWith()).get('/api/v1/thing').set('x-origin-secret', 'nope');
    expect(r.status).toBe(403);
  });

  it('still answers /health directly — Render probes the container, not the edge', async () => {
    const r = await request(appWith()).get('/health');
    expect(r.status).toBe(200);
  });

  it('is entirely inert when no secret is configured', async () => {
    delete process.env.ORIGIN_SHARED_SECRET;
    expect(originLockEnabled()).toBe(false);
    const r = await request(appWith()).get('/api/v1/thing');
    expect(r.status).toBe(200);
  });
});

describe('which address the rate limiter counts', () => {
  /**
   * The reason the two live in one module. Reading CF-Connecting-IP without proving the request
   * came through Cloudflare is WORSE than not reading it: anyone reaching the origin directly
   * could mint a fresh rate-limit bucket per request by changing one header, which is the same as
   * having no limiter on the OTP endpoint at all.
   */
  it('ignores CF-Connecting-IP from a client that did not come through Cloudflare', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.get('/x', (req, res) => res.json({ ip: clientIp(req) }));
    const r = await request(app).get('/x').set('cf-connecting-ip', '9.9.9.9');
    expect(r.body.ip).not.toBe('9.9.9.9');
  });

  it('uses CF-Connecting-IP once the request is proven to be from the edge', async () => {
    const r = await request(appWith())
      .get('/api/v1/thing')
      .set('x-origin-secret', SECRET)
      .set('cf-connecting-ip', '9.9.9.9');
    expect(r.body.ip).toBe('9.9.9.9');
  });

  it('falls back to req.ip when the edge sends no CF-Connecting-IP', async () => {
    const r = await request(appWith()).get('/api/v1/thing').set('x-origin-secret', SECRET);
    expect(r.body.ip).toBeTruthy();
    expect(r.body.ip).not.toBe('unknown');
  });

  it('does not leak the secret length through a timing-unsafe compare', () => {
    // A length mismatch must be rejected without throwing out of timingSafeEqual, which requires
    // equal-length buffers and would otherwise 500 the whole API on any wrong-length header.
    expect(() => viaCloudflare({ get: () => 'x' })).not.toThrow();
    expect(viaCloudflare({ get: () => 'x' })).toBe(false);
  });
});
